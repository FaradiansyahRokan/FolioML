"""
URL Ingestion — scrape a webpage and ingest it like a document.
"""
import re
import httpx
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from rag.pdf_processor import chunk_text, StructuredDocument, DocumentSection
from rag.embeddings import get_embeddings_batch
from rag.vector_store import add_document, store_chunks, update_document_chunk_count, delete_document
from utils.auth import get_current_user

router = APIRouter()


from typing import Optional

class URLIngestRequest(BaseModel):
    url: str
    title: Optional[str] = None
    snippet: Optional[str] = None


def _html_to_text(html: str) -> str:
    """Convert HTML to clean text using Trafilatura, fallback to BeautifulSoup."""
    try:
        import trafilatura
        # Trafilatura is the gold standard for extracting main article content
        extracted = trafilatura.extract(html, include_links=True, include_formatting=True)
        if extracted:
            return extracted
    except ImportError:
        pass

    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, 'html.parser')
        
        # Remove script, style, nav, footer, header elements
        for element in soup(["script", "style", "nav", "footer", "header", "aside", "noscript"]):
            element.decompose()
            
        # Get text with newlines
        text = soup.get_text(separator='\n')
        
        # Clean up whitespace (remove empty lines and extra spaces)
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        return '\n\n'.join(lines)
    except ImportError:
        # Fallback to regex if BS4 is missing
        import re
        html = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL | re.IGNORECASE)
        html = re.sub(r'<style[^>]*>.*?</style>', '', html, flags=re.DOTALL | re.IGNORECASE)
        html = re.sub(r'<[^>]+>', ' ', html)
        return re.sub(r'\s{2,}', ' ', html).strip()


def _extract_title(html: str) -> str:
    """Extract page title from HTML."""
    match = re.search(r'<title[^>]*>(.*?)</title>', html, re.DOTALL | re.IGNORECASE)
    if match:
        title = match.group(1).strip()
        # Clean HTML entities
        title = title.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')
        return title[:200]
    return ""


def _build_structured_from_markdown(text: str, url: str, title: str) -> StructuredDocument:
    """Build a StructuredDocument from markdown-converted web content."""
    structured = StructuredDocument(url)
    structured.title = title
    structured.metadata = {"format": "url", "source_url": url}
    
    lines = text.split("\n")
    current_content = []
    
    for line in lines:
        heading_match = re.match(r'^(#{1,6})\s+(.+)$', line)
        if heading_match:
            if current_content:
                content = "\n".join(current_content).strip()
                if content:
                    structured.sections.append(DocumentSection(
                        content=content, section_type="text"
                    ))
                current_content = []
            level = len(heading_match.group(1))
            structured.sections.append(DocumentSection(
                title=heading_match.group(2).strip(),
                level=level,
                section_type="heading"
            ))
        else:
            current_content.append(line)
    
    if current_content:
        content = "\n".join(current_content).strip()
        if content:
            structured.sections.append(DocumentSection(
                content=content, section_type="text"
            ))
    
    structured.pages = [{"page": 1, "text": text}]
    structured.page_count = 1
    return structured


@router.post("/ingest/url")
async def ingest_url(req: URLIngestRequest, user_id: str = Depends(get_current_user)):
    """Scrape a URL, convert to text, chunk, embed, and store."""
    url = req.url.strip()
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    
    # Fetch the page
    html = ""
    fetch_failed = False
    
    try:
        import trafilatura
        downloaded = trafilatura.fetch_url(url)
        if downloaded:
            html = downloaded
        else:
            fetch_failed = True
    except Exception as e:
        print(f"[Scrape Failed] {url} - Error: {e}")
        fetch_failed = True
    
    # Fallback to httpx if trafilatura fails
    if fetch_failed:
        fetch_failed = False
        try:
            async with httpx.AsyncClient(follow_redirects=True, verify=False, timeout=15.0) as client:
                response = await client.get(url, headers={
                    "User-Agent": "FolioML/1.0 (https://folioml.vercel.app; admin@folioml) based on httpx"
                })
                response.raise_for_status()
                html = response.text
                if not html.strip() or len(html) < 200:
                    fetch_failed = True
        except Exception as e:
            print(f"[Scrape Fallback Failed] {url} - Error: {e}")
            fetch_failed = True
    
    title = req.title or url
    text = ""
    
    if not fetch_failed:
        # Extract title and convert to text
        extracted_title = _extract_title(html)
        if extracted_title:
            title = extracted_title
        text = _html_to_text(html)
        
    if len(text.strip()) < 50:
        # Fallback to snippet if text is too short or fetch failed
        if req.snippet and len(req.snippet.strip()) > 5:
            print(f"[Fallback Used] Using snippet for {url}")
            text = f"Title: {title}\nURL: {url}\nContent (Snippet):\n{req.snippet.strip()}"
        else:
            raise HTTPException(status_code=422, detail="Could not extract text from URL and no snippet fallback provided.")
    
    # Build structured document
    structured = _build_structured_from_markdown(text, url, title)
    
    # Chunk with semantic awareness
    chunks = chunk_text(text, structured=structured)
    if not chunks:
        raise HTTPException(status_code=422, detail="No chunks produced from URL content.")
    
    # Store document
    display_name = f"{title[:60]}"
    document_id = add_document(
        name=display_name, content=text, page_count=1,
        chunk_count=len(chunks), structured_data=structured.to_dict(),
        user_id=user_id
    )
    
    # Generate embeddings
    chunk_texts = [c["content"] for c in chunks]
    try:
        embeddings = await get_embeddings_batch(chunk_texts)
    except Exception as e:
        delete_document(document_id)
        raise HTTPException(status_code=500, detail=f"Failed to generate embeddings: {str(e)}")
    
    store_chunks(document_id, display_name, chunks, embeddings)
    update_document_chunk_count(document_id, len(chunks))
    
    return {
        "message": "URL ingested successfully",
        "document_id": document_id,
        "document_name": display_name,
        "chunks_created": len(chunks),
        "page_count": 1,
        "title": title,
        "source_url": url,
    }
