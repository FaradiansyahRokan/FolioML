from fastapi import APIRouter, UploadFile, File, HTTPException, Query, Depends
from pydantic import BaseModel
import traceback
from rag.pdf_processor import extract_text, chunk_text, SUPPORTED_EXTENSIONS
from rag.embeddings import get_embeddings_batch
from rag.vector_store import (
    add_document, store_chunks, get_all_documents, delete_document,
    update_document_chunk_count, get_document_stats, get_document
)
import base64
import httpx

router = APIRouter()


class WebSearchPreviewResult(BaseModel):
    title: str
    url: str
    snippet: str
    source_domain: str


@router.get("/search/preview")
def search_preview(query: str = Query(..., min_length=1), category: str = Query("all")) -> dict:
    """Return DuckDuckGo search results as preview cards, filtered by category."""
    from ddgs import DDGS
    from urllib.parse import urlparse
    from utils.trusted_sources import filter_trusted_results
    
    try:
        # Fetch more to account for filtering
        raw = DDGS().text(query, max_results=20)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")
        
    if not raw:
        raise HTTPException(status_code=404, detail="No results found.")
        
    # Apply category filter
    filtered = filter_trusted_results(raw, target_category=category) if category != "all" else raw
    
    # Take top 10 after filtering
    filtered = filtered[:10]
    
    results = []
    for r in filtered:
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


from utils.auth import get_current_user

@router.post("/upload/image")
async def upload_image(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user)
):
    """Upload an image, describe it using llava, and store the description as a document."""
    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
        
    b64_image = base64.b64encode(file_bytes).decode('utf-8')
    filename = file.filename or "image.png"
    
    # Call ollama llava
    try:
        OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(f"{OLLAMA_BASE_URL}/api/chat", json={
                "model": "llava:latest",
                "messages": [
                    {
                        "role": "user",
                        "content": "You are an expert OCR and image analyst. Please describe this image in extreme detail. If there is any text, data, or charts in the image, transcribe and explain them perfectly.",
                        "images": [b64_image]
                    }
                ],
                "stream": False
            }, timeout=120.0)
            resp.raise_for_status()
            data = resp.json()
            description = data["message"]["content"]
    except Exception as e:
        print(f"[UPLOAD ERROR] Vision model failed: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Vision model (llava) failed: {str(e)}")
        
    text = f"Image filename: {filename}\nImage Description and Contents:\n{description}"
    
    try:
        chunks = chunk_text(text, chunk_size=800, overlap=200)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to chunk image text: {str(e)}")
        
    try:
        doc_id = add_document(filename, "image", page_count=1, user_id=user_id)
        texts_to_embed = [c["text"] for c in chunks]
        embeddings = get_embeddings_batch(texts_to_embed)
        
        chunks_with_embeddings = []
        for i, chunk in enumerate(chunks):
            chunks_with_embeddings.append({
                "text": chunk["text"],
                "embedding": embeddings[i],
                "metadata": chunk["metadata"]
            })
            
        store_chunks(doc_id, chunks_with_embeddings)
        update_document_chunk_count(doc_id, len(chunks))
        
        return {
            "message": "Image processed and stored successfully",
            "document_id": doc_id,
            "document_name": filename,
            "chunks_created": len(chunks),
            "page_count": 1
        }
    except Exception as e:
        print(f"[UPLOAD ERROR] DB storage failed: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user)
):
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
            chunk_count=len(chunks), structured_data=structured_data,
            user_id=user_id
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
async def ingest_web_search(
    request: WebSearchRequest,
    user_id: str = Depends(get_current_user)
):
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
            chunk_count=len(chunks), user_id=user_id
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
def list_documents(user_id: str = Depends(get_current_user)):
    """Return all uploaded documents."""
    docs = get_all_documents(user_id=user_id)
    return {"documents": docs}


@router.get("/documents/stats")
def document_stats(user_id: str = Depends(get_current_user)):
    """Return knowledge base statistics."""
    return get_document_stats(user_id=user_id)


@router.get("/documents/{document_id}")
def read_document(document_id: int, user_id: str = Depends(get_current_user)):
    """Get full content of a single document."""
    doc = get_document(document_id, user_id=user_id)
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
def remove_document(document_id: int, user_id: str = Depends(get_current_user)):
    """Delete a document and all its chunks."""
    delete_document(document_id, user_id=user_id)
    return {"message": f"Document {document_id} deleted successfully"}

from rag.vector_store import share_document, get_shared_document

@router.post("/documents/{document_id}/share")
def create_share_link(document_id: int, user_id: str = Depends(get_current_user)):
    """Generate a public share link for a document."""
    try:
        share_id = share_document(document_id, user_id)
        return {"share_id": share_id, "url": f"/share/{share_id}"}
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))

@router.get("/share/{share_id}")
def read_shared_document(share_id: str):
    """Retrieve a publicly shared document without authentication."""
    doc = get_shared_document(share_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Shared document not found or is private")
    
    source_url = doc.get("structured", {}).get("metadata", {}).get("source_url") if isinstance(doc.get("structured"), dict) and isinstance(doc.get("structured").get("metadata"), dict) else None
    
    return {
        "document": {
            **doc,
            "source_url": source_url
        }
    }
