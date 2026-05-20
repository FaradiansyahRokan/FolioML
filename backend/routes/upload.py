from fastapi import APIRouter, UploadFile, File, HTTPException, Query
from pydantic import BaseModel
import traceback
from rag.pdf_processor import extract_text, chunk_text, SUPPORTED_EXTENSIONS
from rag.embeddings import get_embeddings_batch
from rag.vector_store import (
    add_document, store_chunks, get_all_documents, delete_document,
    update_document_chunk_count, get_document_stats, get_document
)

router = APIRouter()


class WebSearchPreviewResult(BaseModel):
    title: str
    url: str
    snippet: str
    source_domain: str


@router.get("/search/preview")
def search_preview(query: str = Query(..., min_length=1)) -> dict:
    """Return DuckDuckGo search results as preview cards (no ingestion)."""
    from ddgs import DDGS
    from urllib.parse import urlparse
    try:
        raw = DDGS().text(query, max_results=10)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")
    if not raw:
        raise HTTPException(status_code=404, detail="No results found.")
    results = []
    for r in raw:
        url = r.get("href", "")
        try:
            domain = urlparse(url).netloc.replace("www.", "")
        except Exception:
            domain = url
        results.append({
            "title": r.get("title", "No Title"),
            "url": url,
            "snippet": r.get("body", ""),
            "source_domain": domain,
        })
    return {"results": results, "query": query}


@router.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    """Upload a document (PDF, TXT, DOCX, MD, CSV), extract text, chunk, embed, and store."""
    filename = file.filename or "unknown"
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Supported: {', '.join(SUPPORTED_EXTENSIONS)}"
        )

    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    
    # 10MB size limit
    MAX_FILE_SIZE = 10 * 1024 * 1024
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({len(file_bytes) // 1024 // 1024}MB). Maximum allowed size is 10MB."
        )

    # Step 1: Extract text
    try:
        result = extract_text(file_bytes, filename)
    except Exception as e:
        print(f"[UPLOAD ERROR] Step 1 - extract_text failed: {traceback.format_exc()}")
        raise HTTPException(status_code=422, detail=f"Failed to extract text: {str(e)}")

    text = result["text"]
    pages = result.get("pages", [])
    page_count = result.get("page_count", 1)
    structured = result.get("structured", None)

    if not text.strip():
        raise HTTPException(status_code=422, detail="No text could be extracted from this file.")

    # Step 2: Chunking
    try:
        chunks = chunk_text(text, pages=pages, chunk_size=800, overlap=200, structured=structured)
    except Exception as e:
        print(f"[UPLOAD ERROR] Step 2 - chunk_text failed: {traceback.format_exc()}")
        raise HTTPException(status_code=422, detail=f"Failed to chunk document: {str(e)}")

    if not chunks:
        raise HTTPException(status_code=422, detail="No chunks were produced from this file.")

    print(f"[UPLOAD] {filename}: {len(chunks)} chunks produced from {page_count} pages")

    # Step 3: Save document
    try:
        structured_data = structured.to_dict() if structured else {}
        document_id = add_document(
            name=filename, content=text, page_count=page_count,
            chunk_count=len(chunks), structured_data=structured_data
        )
    except Exception as e:
        print(f"[UPLOAD ERROR] Step 3 - add_document failed: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Failed to save document to DB: {str(e)}")

    # Step 4: Generate embeddings
    # Limit to 1500 chars per chunk — safe for nomic-embed-text (~350-500 tokens)
    MAX_CHUNK_CHARS = 1500
    chunk_texts = [c["content"][:MAX_CHUNK_CHARS] for c in chunks]
    try:
        embeddings = await get_embeddings_batch(chunk_texts)
    except Exception as e:
        print(f"[UPLOAD ERROR] Step 4 - get_embeddings_batch failed: {traceback.format_exc()}")
        delete_document(document_id)
        raise HTTPException(status_code=500, detail=f"Failed to generate embeddings: {str(e)}")

    # Step 5: Store chunks
    try:
        store_chunks(document_id, filename, chunks, embeddings)
        update_document_chunk_count(document_id, len(chunks))
    except Exception as e:
        print(f"[UPLOAD ERROR] Step 5 - store_chunks failed: {traceback.format_exc()}")
        delete_document(document_id)
        raise HTTPException(status_code=500, detail=f"Failed to store chunks: {str(e)}")

    return {
        "message": "Document uploaded successfully",
        "document_id": document_id,
        "document_name": filename,
        "chunks_created": len(chunks),
        "page_count": page_count,
        "tables_found": len(structured.tables) if structured else 0,
        "sections_found": len([s for s in structured.sections if s.section_type == "heading"]) if structured else 0,
    }


class WebSearchRequest(BaseModel):
    query: str

@router.post("/ingest/web-search")
async def ingest_web_search(request: WebSearchRequest):
    """Search DuckDuckGo and ingest the results as a document."""
    from ddgs import DDGS
    
    query = request.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty.")
        
    try:
        results = DDGS().text(query, max_results=5)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Web search failed: {str(e)}")
        
    if not results:
        raise HTTPException(status_code=404, detail="No results found for query.")
        
    import httpx
    import asyncio
    from routes.ingest import _html_to_text

    # Combine results into a single text
    text_parts = []
    
    async def fetch_and_parse(url, title, body):
        try:
            async with httpx.AsyncClient(follow_redirects=True, timeout=8.0) as client:
                resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
                if resp.status_code == 200:
                    page_text = _html_to_text(resp.text)
                    return f"Title: {title}\nURL: {url}\nContent:\n{page_text}"
        except Exception:
            pass
        return f"Title: {title}\nURL: {url}\nContent (Snippet):\n{body}"

    tasks = [fetch_and_parse(r.get("href", ""), r.get("title", "No Title"), r.get("body", "")) for r in results]
    fetched_results = await asyncio.gather(*tasks)
    
    for content in fetched_results:
        text_parts.append(content)
        
    text = "\n\n---\n\n".join(text_parts)
    filename = f"Web: {query[:30]}"
    
    # Chunking
    try:
        chunks = chunk_text(text, chunk_size=800, overlap=200)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to chunk web results: {str(e)}")
        
    # Generate embeddings
    MAX_CHUNK_CHARS = 1500
    chunk_texts = [c["content"][:MAX_CHUNK_CHARS] for c in chunks]
    try:
        embeddings = await get_embeddings_batch(chunk_texts)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate embeddings: {str(e)}")
        
    # Save document
    try:
        document_id = add_document(
            name=filename, content=text, page_count=1,
            chunk_count=len(chunks)
        )
        store_chunks(document_id, filename, chunks, embeddings)
        update_document_chunk_count(document_id, len(chunks))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to store web document: {str(e)}")
        
    return {
        "message": "Web search ingested successfully",
        "document_id": document_id,
        "document_name": filename,
        "chunks_created": len(chunks),
        "page_count": 1,
    }


@router.get("/documents")
def list_documents():
    """Return all uploaded documents."""
    docs = get_all_documents()
    return {"documents": docs}


@router.get("/documents/stats")
def document_stats():
    """Return knowledge base statistics."""
    return get_document_stats()


@router.get("/documents/{document_id}")
def read_document(document_id: int):
    """Get full content of a single document."""
    doc = get_document(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Extract source_url for convenience if it exists
    source_url = doc.get("structured", {}).get("metadata", {}).get("source_url") if isinstance(doc.get("structured"), dict) and isinstance(doc.get("structured").get("metadata"), dict) else None
    
    return {
        "document": {
            **doc,
            "source_url": source_url
        }
    }


@router.delete("/documents/{document_id}")
def remove_document(document_id: int):
    """Delete a document and all its chunks."""
    delete_document(document_id)
    return {"message": f"Document {document_id} deleted successfully"}
