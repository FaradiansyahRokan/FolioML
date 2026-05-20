import math
import re
import json
from typing import List, Dict, Any, Optional
from datetime import datetime
from collections import Counter
from database.connection import get_db

# ─────────────────────────────────────────────────────────────
# Storage (In-memory index synced with SQLite)
# ─────────────────────────────────────────────────────────────
_documents: Dict[int, Dict] = {}
_chunks: List[Dict] = []
_next_doc_id: int = 1
SIMILARITY_THRESHOLD = 0.15

def load_from_db():
    """Load all documents and chunks from SQLite on startup."""
    global _documents, _chunks, _next_doc_id
    
    _documents.clear()
    _chunks.clear()
    
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Load docs
        cursor.execute("SELECT * FROM documents")
        for row in cursor.fetchall():
            doc_id = row["id"]
            _documents[doc_id] = {
                "id": doc_id,
                "name": row["name"],
                "content": row["content"],
                "page_count": row["page_count"],
                "chunk_count": row["chunk_count"],
                "created_at": row["created_at"],
                "structured": json.loads(row["structured_data"]) if row["structured_data"] else {},
            }
            if doc_id >= _next_doc_id:
                _next_doc_id = doc_id + 1
                
        # Load chunks
        cursor.execute("SELECT * FROM chunks")
        for row in cursor.fetchall():
            try:
                embedding = json.loads(row["embedding"])
            except:
                continue
                
            _chunks.append({
                "id": row["id"],
                "document_id": row["document_id"],
                "document_name": row["document_name"],
                "content": row["content"],
                "page": row["page"],
                "section": row["section"],
                "chunk_type": row["chunk_type"],
                "chunk_index": row["chunk_index"],
                "embedding": embedding,
            })
            
    _rebuild_bm25_index()
    print(f"Loaded {len(_documents)} documents and {len(_chunks)} chunks from database.")

# ─────────────────────────────────────────────────────────────
# BM25 Index (Hybrid Retrieval)
# ─────────────────────────────────────────────────────────────
_bm25_doc_count: int = 0
_bm25_doc_lens: List[int] = []
_bm25_avg_len: float = 0.0
_bm25_df: Counter = Counter()  # document frequency for each term
_bm25_tf: List[Counter] = []   # term frequency per chunk


def _tokenize(text: str) -> List[str]:
    """Simple tokenizer for BM25."""
    text = text.lower()
    text = re.sub(r'[^\w\s]', ' ', text)
    tokens = text.split()
    # Remove very short tokens and common stop words
    stop_words = {'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
                  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
                  'would', 'could', 'should', 'may', 'might', 'shall', 'can',
                  'and', 'or', 'but', 'if', 'of', 'at', 'by', 'for', 'with',
                  'about', 'to', 'from', 'in', 'on', 'it', 'its', 'this',
                  'that', 'these', 'those', 'i', 'you', 'he', 'she', 'we',
                  'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your',
                  'his', 'our', 'their', 'yang', 'dan', 'di', 'ke', 'dari',
                  'ini', 'itu', 'untuk', 'dengan', 'pada', 'tidak', 'ada',
                  'juga', 'akan', 'sudah', 'atau', 'bisa', 'oleh', 'seperti',
                  'antara', 'sebuah', 'satu', 'lebih', 'karena', 'dalam',
                  'sebagai', 'bahwa', 'mereka', 'hanya', 'saat', 'telah'}
    return [t for t in tokens if len(t) > 1 and t not in stop_words]


def _rebuild_bm25_index():
    """Rebuild the BM25 index from all stored chunks."""
    global _bm25_doc_count, _bm25_avg_len, _bm25_doc_lens, _bm25_df, _bm25_tf
    
    _bm25_doc_count = len(_chunks)
    _bm25_doc_lens = []
    _bm25_df = Counter()
    _bm25_tf = []
    
    for chunk in _chunks:
        tokens = _tokenize(chunk["content"])
        tf = Counter(tokens)
        _bm25_tf.append(tf)
        _bm25_doc_lens.append(len(tokens))
        
        # Update document frequency (each term counted once per doc)
        for term in set(tokens):
            _bm25_df[term] += 1
    
    _bm25_avg_len = sum(_bm25_doc_lens) / max(_bm25_doc_count, 1)


def _bm25_score(query_tokens: List[str], chunk_idx: int, k1: float = 1.5, b: float = 0.75) -> float:
    """Calculate BM25 score for a single chunk."""
    if chunk_idx >= len(_bm25_tf):
        return 0.0
    
    score = 0.0
    tf = _bm25_tf[chunk_idx]
    doc_len = _bm25_doc_lens[chunk_idx]
    
    for term in query_tokens:
        if term not in _bm25_df:
            continue
        
        df = _bm25_df[term]
        idf = math.log(((_bm25_doc_count - df + 0.5) / (df + 0.5)) + 1)
        
        term_freq = tf.get(term, 0)
        tf_norm = (term_freq * (k1 + 1)) / (term_freq + k1 * (1 - b + b * doc_len / max(_bm25_avg_len, 1)))
        
        score += idf * tf_norm
    
    return score


# ─────────────────────────────────────────────────────────────
# Core vector store operations
# ─────────────────────────────────────────────────────────────

def _cosine_similarity(a: List[float], b: List[float]) -> float:
    """Compute cosine similarity between two vectors."""
    if not a or not b or not isinstance(a, list) or not isinstance(b, list):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def add_document(name: str, content: str, page_count: int = 1, chunk_count: int = 0,
                 structured_data: Dict = None) -> int:
    """Save a new document record to DB and memory, return its ID."""
    global _next_doc_id
    created_at = datetime.now().isoformat()
    structured_json = json.dumps(structured_data) if structured_data else "{}"
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            '''INSERT INTO documents (name, content, page_count, chunk_count, created_at, structured_data)
               VALUES (?, ?, ?, ?, ?, ?)''',
            (name, content, page_count, chunk_count, created_at, structured_json)
        )
        doc_id = cursor.lastrowid
        
    _documents[doc_id] = {
        "id": doc_id,
        "name": name,
        "content": content,
        "page_count": page_count,
        "chunk_count": chunk_count,
        "created_at": created_at,
        "structured": structured_data or {},
    }
    _next_doc_id = max(_next_doc_id, doc_id + 1)
    return doc_id


def update_document_chunk_count(document_id: int, chunk_count: int):
    """Update the chunk count for a document after processing."""
    if document_id in _documents:
        _documents[document_id]["chunk_count"] = chunk_count
        with get_db() as conn:
            conn.execute("UPDATE documents SET chunk_count = ? WHERE id = ?", (chunk_count, document_id))


def store_chunks(document_id: int, document_name: str, chunks: List[Dict], embeddings: List[List[float]]):
    """Store text chunks with their embeddings in memory and DB, and update BM25 index."""
    db_rows = []
    
    for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
        if not embedding or not isinstance(embedding, list) or len(embedding) == 0:
            raise ValueError(
                f"Chunk {i} has an invalid embedding (got: {type(embedding).__name__}). "
                "Check your OLLAMA_EMBEDDING_MODEL."
            )
            
        content = chunk["content"] if isinstance(chunk, dict) else chunk
        page = chunk.get("page", 1) if isinstance(chunk, dict) else 1
        section = chunk.get("section", "") if isinstance(chunk, dict) else ""
        chunk_type = chunk.get("type", "text") if isinstance(chunk, dict) else "text"
        
        db_rows.append((
            document_id, document_name, content, page, section, chunk_type, i, json.dumps(embedding)
        ))
        
        _chunks.append({
            "id": len(_chunks) + 1,  # Temporary ID until reload
            "document_id": document_id,
            "document_name": document_name,
            "content": content,
            "page": page,
            "section": section,
            "chunk_type": chunk_type,
            "embedding": embedding,
            "chunk_index": i,
        })
    
    with get_db() as conn:
        conn.executemany(
            '''INSERT INTO chunks (document_id, document_name, content, page, section, chunk_type, chunk_index, embedding)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
            db_rows
        )
        
    # Rebuild BM25 after adding chunks
    _rebuild_bm25_index()


def similarity_search(query_embedding: List[float], top_k: int = 5,
                      document_ids: List[int] = None, query_text: str = "") -> List[Dict[str, Any]]:
    """
    Hybrid retrieval: combine semantic search (cosine similarity) with 
    BM25 keyword search for better results.
    """
    if not _chunks:
        return []

    valid_indices = []
    valid_chunks = []
    for idx, c in enumerate(_chunks):
        if not (c.get("embedding") and isinstance(c["embedding"], list) and len(c["embedding"]) > 0):
            continue
        if document_ids is not None and c["document_id"] not in document_ids:
            continue
        valid_indices.append(idx)
        valid_chunks.append(c)

    if not valid_chunks:
        return []

    # Semantic scores
    semantic_scores = []
    for chunk in valid_chunks:
        score = _cosine_similarity(query_embedding, chunk["embedding"])
        semantic_scores.append(score)
    
    # BM25 scores
    bm25_scores = []
    if query_text and _bm25_tf:
        query_tokens = _tokenize(query_text)
        for idx in valid_indices:
            bm25_scores.append(_bm25_score(query_tokens, idx))
    else:
        bm25_scores = [0.0] * len(valid_chunks)
    
    # Normalize scores to [0, 1]
    max_semantic = max(semantic_scores) if semantic_scores else 1.0
    max_bm25 = max(bm25_scores) if bm25_scores and max(bm25_scores) > 0 else 1.0
    
    norm_semantic = [s / max_semantic if max_semantic > 0 else 0 for s in semantic_scores]
    norm_bm25 = [s / max_bm25 if max_bm25 > 0 else 0 for s in bm25_scores]
    
    # Hybrid scoring: α × semantic + (1-α) × BM25
    alpha = 0.7  # Weight towards semantic search
    hybrid_scores = [alpha * s + (1 - alpha) * b for s, b in zip(norm_semantic, norm_bm25)]
    
    # Filter and sort
    scored = []
    for i, (chunk, hybrid, sem, bm25) in enumerate(zip(valid_chunks, hybrid_scores, semantic_scores, bm25_scores)):
        if sem >= SIMILARITY_THRESHOLD or bm25 > 0:
            scored.append({
                "id": chunk["id"],
                "document_id": chunk["document_id"],
                "document_name": chunk["document_name"],
                "content": chunk["content"],
                "page": chunk.get("page", 1),
                "section": chunk.get("section", ""),
                "chunk_type": chunk.get("chunk_type", "text"),
                "chunk_index": chunk["chunk_index"],
                "similarity": round(sem, 4),
                "bm25_score": round(bm25, 4),
                "hybrid_score": round(hybrid, 4),
            })

    scored.sort(key=lambda x: x["hybrid_score"], reverse=True)
    
    # Context compression: remove near-duplicate chunks
    compressed = _compress_results(scored, top_k)
    return compressed


def _compress_results(results: List[Dict], top_k: int) -> List[Dict]:
    """Remove near-duplicate chunks from results (context compression)."""
    if not results:
        return []
    
    selected = [results[0]]
    for result in results[1:]:
        if len(selected) >= top_k:
            break
        
        # Check if this chunk is too similar to any already selected
        is_duplicate = False
        for existing in selected:
            # Simple overlap check: if >60% of words overlap, skip
            words_new = set(result["content"].lower().split())
            words_existing = set(existing["content"].lower().split())
            if not words_new:
                is_duplicate = True
                break
            overlap = len(words_new & words_existing) / len(words_new)
            if overlap > 0.6:
                is_duplicate = True
                break
        
        if not is_duplicate:
            selected.append(result)
    
    return selected


def get_all_documents() -> List[Dict[str, Any]]:
    """Return all uploaded documents (without full content)."""
    return [
        {
            "id": d["id"],
            "name": d["name"],
            "page_count": d.get("page_count", 1),
            "chunk_count": d.get("chunk_count", 0),
            "created_at": d["created_at"],
            "source_url": d.get("structured", {}).get("metadata", {}).get("source_url") if isinstance(d.get("structured"), dict) and isinstance(d.get("structured").get("metadata"), dict) else None,
        }
        for d in _documents.values()
    ]


def get_document(document_id: int) -> Optional[Dict]:
    """Return a single document by ID (with full content)."""
    return _documents.get(document_id)


def delete_document(document_id: int):
    """Delete a document and all its chunks from memory and DB."""
    global _chunks
    _documents.pop(document_id, None)
    _chunks = [c for c in _chunks if c["document_id"] != document_id]
    
    with get_db() as conn:
        conn.execute("DELETE FROM documents WHERE id = ?", (document_id,))
        # cascading delete handles chunks
        
    _rebuild_bm25_index()


def get_chunks(document_ids: List[int] = None) -> List[Dict]:
    """Return stored chunks, optionally filtered by document IDs."""
    if document_ids is None:
        return _chunks
    return [c for c in _chunks if c["document_id"] in document_ids]


def get_document_stats() -> Dict:
    """Return statistics about the knowledge base."""
    total_docs = len(_documents)
    total_chunks = len(_chunks)
    total_chars = sum(len(c["content"]) for c in _chunks)
    docs_by_type = Counter()
    for d in _documents.values():
        ext = d["name"].rsplit(".", 1)[-1].lower() if "." in d["name"] else "unknown"
        docs_by_type[ext] += 1
    
    return {
        "total_documents": total_docs,
        "total_chunks": total_chunks,
        "total_characters": total_chars,
        "documents_by_type": dict(docs_by_type),
        "avg_chunk_size": total_chars // max(total_chunks, 1),
    }