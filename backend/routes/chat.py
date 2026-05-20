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

router = APIRouter()


class ChatRequest(BaseModel):
    question: str
    top_k: Optional[int] = 5
    history: Optional[List[Dict]] = None  # conversation memory
    document_ids: Optional[List[int]] = None  # selected documents filter
    use_web_fallback: bool = False


class SourceCitation(BaseModel):
    document_name: str
    content_preview: str
    similarity: float
    chunk_index: int
    page: Optional[int] = None


class ChatResponse(BaseModel):
    answer: str
    sources: List[SourceCitation]


async def _fetch_web_fallback(query: str, max_results: int = 5) -> list:
    import httpx
    import asyncio
    import logging
    from ddgs import DDGS
    from routes.ingest import _html_to_text
    
    try:
        results = DDGS().text(query, max_results=max_results)
    except Exception as e:
        logging.error(f"DDGS search failed: {e}")
        return []
        
    if not results:
        return []
        
    async def fetch_and_parse(url, title, body):
        try:
            async with httpx.AsyncClient(follow_redirects=True, timeout=5.0) as client:
                resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
                if resp.status_code == 200:
                    page_text = _html_to_text(resp.text)
                    if len(page_text) > 100:
                        return f"URL: {url}\nContent:\n{page_text[:3000]}"
        except Exception:
            pass
        return f"URL: {url}\nContent Snippet:\n{body}"

    tasks = [fetch_and_parse(r.get("href", ""), r.get("title", "No Title"), r.get("body", "")) for r in results]
    fetched = await asyncio.gather(*tasks)
    
    chunks = []
    for i, (r, content) in enumerate(zip(results, fetched)):
        chunks.append({
            "document_name": f"Web: {r.get('title', 'Source')}",
            "content": content,
            "similarity": 1.0,
            "hybrid_score": 1.0,
            "chunk_index": i,
            "page": 1,
            "section": "Web Search Fallback",
            "chunk_type": "text",
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


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
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
        query_text=request.question
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
async def chat_stream(request: ChatRequest):
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
        query_text=request.question
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
