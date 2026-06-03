import json
import logging
from ddgs import DDGS
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional, Dict
from rag.embeddings import get_embedding
from rag.vector_store import similarity_search
from services.llm_service import generate_answer, stream_answer
from utils.trusted_sources import (
    filter_trusted_results,
    rank_by_credibility,
    is_trusted_domain,
)

router = APIRouter()

class ChatRequest(BaseModel):
    question: str
    top_k: Optional[int] = 5
    history: Optional[List[Dict]] = None  # conversation memory
    document_ids: Optional[List[int]] = None  # selected documents filter
    use_web_fallback: bool = False
    context_text: Optional[str] = None  # Raw text to use as context, bypassing RAG


class SourceCitation(BaseModel):
    document_name: str
    content_preview: str
    similarity: float
    chunk_index: int
    page: Optional[int] = None


class ChatResponse(BaseModel):
    answer: str
    sources: List[SourceCitation]


async def _fetch_web_fallback(query: str, max_results: int = 10, trusted_only: bool = True) -> list:
    """
    Fetch web results from trusted sources only.
    
    Args:
        query: Search query
        max_results: Max results to fetch (will be filtered to trusted only)
        trusted_only: If True, only return results from trusted sources
    """
    import httpx
    import asyncio
    import logging
    from ddgs import DDGS
    from routes.ingest import _html_to_text
    
    try:
        # Fetch more results to account for filtering
        raw_results = DDGS().text(query, max_results=max_results * 3)
    except Exception as e:
        logging.error(f"DDGS search failed: {e}")
        return []
    
    if not raw_results:
        return []
    
    # FILTER: Only keep trusted sources
    if trusted_only:
        filtered_results = filter_trusted_results(raw_results)
        
        if not filtered_results:
            logging.warning(f"No trusted sources found for query: {query}")
            return []
        
        # RANK: Sort by credibility
        filtered_results = rank_by_credibility(filtered_results)
        
        # Take top results after filtering
        raw_results = filtered_results[:max_results]
    else:
        raw_results = raw_results[:max_results]
        
    async def fetch_and_parse(url, title, body, source_category):
        try:
            async with httpx.AsyncClient(follow_redirects=True, timeout=5.0) as client:
                resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
                if resp.status_code == 200:
                    page_text = _html_to_text(resp.text)
                    if len(page_text) > 100:
                        return f"URL: {url}\nContent:\n{page_text[:3000]}"
        except Exception as e:
            logging.warning(f"Failed to fetch {url}: {e}")
            pass
        return f"URL: {url}\nContent Snippet:\n{body}"

    tasks = [
        fetch_and_parse(
            r.get("href", ""), 
            r.get("title", "No Title"), 
            r.get("body", ""),
            r.get("source_category", "unknown")
        ) 
        for r in raw_results
    ]
    fetched = await asyncio.gather(*tasks)
    
    chunks = []
    for i, (r, content) in enumerate(zip(raw_results, fetched)):
        url = r.get("href", "")
        credibility_score = get_source_credibility_score(url)
        source_category = r.get("source_category", "unknown")
        
        chunks.append({
            "document_name": f"[{source_category.upper()}] {r.get('title', 'Source')}",
            "content": content,
            "similarity": credibility_score,  # Use credibility score instead of 1.0
            "hybrid_score": credibility_score,
            "chunk_index": i,
            "page": 1,
            "section": f"Web Search ({source_category})",
            "chunk_type": "web_article",
            "source_url": url,
            "credibility_score": credibility_score,
        })
    
    return chunks


def _build_sources(chunks: list) -> List[dict]:
    """Build source citation dicts from chunks."""
    return [
        {
            "document_name": chunk["document_name"],
            "content_preview": chunk["content"][:800] + ("..." if len(chunk["content"]) > 800 else ""),
            "similarity": round(float(chunk.get("similarity", 0)), 4),
            "hybrid_score": round(float(chunk.get("hybrid_score", 0)), 4),
            "chunk_index": chunk["chunk_index"],
            "page": chunk.get("page", 1),
            "section": chunk.get("section", ""),
            "chunk_type": chunk.get("chunk_type", "text"),
        }
        for chunk in chunks
    ]


from utils.auth import get_current_user

@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, user_id: str = Depends(get_current_user)):
    """Non-streaming RAG chat endpoint."""
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    try:
        query_embedding = await get_embedding(request.question)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to embed question: {str(e)}")

    chunks = similarity_search(
        query_embedding, 
        top_k=request.top_k,
        document_ids=request.document_ids,
        query_text=request.question,
        user_id=user_id
    )

    if not chunks and request.use_web_fallback:
        chunks = await _fetch_web_fallback(request.question, max_results=5)

    if not chunks:
        return ChatResponse(
            answer="Saya tidak dapat menemukan informasi tersebut dalam dokumen maupun di internet.",
            sources=[],
        )

    try:
        answer = await generate_answer(request.question, chunks, request.history)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate answer: {str(e)}")

    sources = [SourceCitation(**s) for s in _build_sources(chunks)]
    return ChatResponse(answer=answer, sources=sources)


@router.post("/chat/stream")
async def chat_stream(request: ChatRequest, user_id: str = Depends(get_current_user)):
    """Streaming RAG chat endpoint. Returns NDJSON lines."""
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    try:
        query_embedding = await get_embedding(request.question)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to embed question: {str(e)}")

    chunks = similarity_search(
        query_embedding, 
        top_k=request.top_k, 
        document_ids=request.document_ids,
        query_text=request.question,
        user_id=user_id
    )

    if not chunks and request.use_web_fallback:
        chunks = await _fetch_web_fallback(request.question, max_results=5)

    if not chunks:
        async def empty_response():
            yield json.dumps({
                "type": "sources", "sources": []
            }) + "\n"
            yield json.dumps({
                "type": "token",
                "content": "Saya tidak dapat menemukan informasi tersebut dalam dokumen maupun di internet."
            }) + "\n"
            yield json.dumps({"type": "done"}) + "\n"

        return StreamingResponse(empty_response(), media_type="text/plain")

    sources_data = _build_sources(chunks)

    async def event_generator():
        # Send sources first
        yield json.dumps({"type": "sources", "sources": sources_data}) + "\n"

        # Stream answer tokens
        try:
            async for token in stream_answer(request.question, chunks, request.history):
                yield json.dumps({"type": "token", "content": token}) + "\n"
        except Exception as e:
            yield json.dumps({"type": "error", "message": str(e)}) + "\n"

        yield json.dumps({"type": "done"}) + "\n"

    return StreamingResponse(event_generator(), media_type="text/plain")


# ─────────────────────────────────────────────────────────────
# Fast Research Endpoint — Web Search Only (No Documents)
# ─────────────────────────────────────────────────────────────

class FastResearchRequest(BaseModel):
    query: str
    max_results: Optional[int] = 5
    history: Optional[List[Dict]] = None


@router.post("/research")
async def fast_research(request: FastResearchRequest):
    """
    Fast research from web sources only (trusted sources).
    Returns immediate answer without document search.
    """
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty.")

    # Fetch from trusted web sources only
    chunks = await _fetch_web_fallback(request.query, max_results=request.max_results or 5, trusted_only=True)

    if not chunks:
        return ChatResponse(
            answer="Maaf, tidak dapat menemukan informasi dari sumber terpercaya untuk query tersebut.",
            sources=[],
        )

    try:
        answer = await generate_answer(request.query, chunks, request.history)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate answer: {str(e)}")

    sources = [SourceCitation(**s) for s in _build_sources(chunks)]
    return ChatResponse(answer=answer, sources=sources)


@router.post("/research/stream")
async def fast_research_stream(request: FastResearchRequest):
    """
    Streaming fast research from web sources only.
    Returns NDJSON lines.
    """
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty.")

    # Fetch from trusted web sources only
    chunks = await _fetch_web_fallback(request.query, max_results=request.max_results or 5, trusted_only=True)

    if not chunks:
        async def empty_response():
            yield json.dumps({
                "type": "sources", "sources": []
            }) + "\n"
            yield json.dumps({
                "type": "token",
                "content": "Maaf, tidak dapat menemukan informasi dari sumber terpercaya untuk query tersebut."
            }) + "\n"
            yield json.dumps({"type": "done"}) + "\n"

        return StreamingResponse(empty_response(), media_type="text/plain")

    sources_data = _build_sources(chunks)

    async def event_generator():
        # Send sources first (with credibility info)
        yield json.dumps({
            "type": "sources",
            "sources": sources_data,
            "note": "Sources dari sumber terpercaya (Wikipedia, Berita, Akademik, dll)"
        }) + "\n"

        # Stream answer tokens
        try:
            async for token in stream_answer(request.query, chunks, request.history):
                yield json.dumps({"type": "token", "content": token}) + "\n"
        except Exception as e:
            yield json.dumps({"type": "error", "message": str(e)}) + "\n"

        yield json.dumps({"type": "done"}) + "\n"

    return StreamingResponse(event_generator(), media_type="text/plain")
