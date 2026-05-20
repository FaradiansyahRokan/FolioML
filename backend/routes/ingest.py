"""
URL Ingestion — scrape a webpage and ingest it like a document.
"""
import re
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from rag.pdf_processor import chunk_text, StructuredDocument, DocumentSection
from rag.embeddings import get_embeddings_batch
from rag.vector_store import add_document, store_chunks, update_document_chunk_count, delete_document

router = APIRouter()


from typing import Optional

class URLIngestRequest(BaseModel):
    url: str
    title: Optional[str] = None
    snippet: Optional[str] = None


def _html_to_text(html: str) -> str:
    """Convert HTML to clean text with some structure preserved."""
    import re
    
    # Remove script and style elements
    html = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r'<style[^>]*>.*?</style>', '', html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r'<nav[^>]*>.*?</nav>', '', html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r'<footer[^>]*>.*?</footer>', '', html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r'<header[^>]*>.*?</header>', '', html, flags=re.DOTALL | re.IGNORECASE)
    
    # Convert headings to markdown
    for i in range(1, 7):
        html = re.sub(rf'<h{i}[^>]*>(.*?)</h{i}>', rf'\n{"#" * i} \1\n', html, flags=re.DOTALL | re.IGNORECASE)
    
    # Convert paragraphs and divs to newlines
    html = re.sub(r'<br\s*/?>', '\n', html, flags=re.IGNORECASE)
    html = re.sub(r'<p[^>]*>', '\n\n', html, flags=re.IGNORECASE)
    html = re.sub(r'</p>', '', html, flags=re.IGNORECASE)
    html = re.sub(r'<li[^>]*>', '\n- ', html, flags=re.IGNORECASE)
    
    # Convert bold and italic
    html = re.sub(r'<(b|strong)[^>]*>(.*?)</\1>', r'**\2**', html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r'<(i|em)[^>]*>(.*?)</\1>', r'*\2*', html, flags=re.DOTALL | re.IGNORECASE)
    
    # Convert code blocks
    html = re.sub(r'<code[^>]*>(.*?)</code>', r'`\1`', html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r'<pre[^>]*>(.*?)</pre>', r'\n```\n\1\n```\n', html, flags=re.DOTALL | re.IGNORECASE)
    
    # Remove all remaining tags
    html = re.sub(r'<[^>]+>', '', html)
    
    # Decode HTML entities
    html = html.replace('&nbsp;', ' ')
    html = html.replace('&amp;', '&')
    html = html.replace('&lt;', '<')
    html = html.replace('&gt;', '>')
    html = html.replace('&quot;', '"')
    html = html.replace('&#39;', "'")
    
    # Clean up whitespace
    html = re.sub(r'\n{3,}', '\n\n', html)
    html = re.sub(r' {2,}', ' ', html)
    
    return html.strip()


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
async def ingest_url(req: URLIngestRequest):
    """Scrape a URL, convert to text, chunk, embed, and store."""
    url = req.url.strip()
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    
    # Fetch the page
    html = ""
    fetch_failed = False
    try:
        # Try to scrape using a standard browser User-Agent
        async with httpx.AsyncClient(follow_redirects=True, verify=False, timeout=15.0) as client:
            response = await client.get(url, headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            })
            response.raise_for_status()
            html = response.text
            if not html.strip():
                fetch_failed = True
    except Exception as e:
        print(f"[Scrape Failed] {url} - Error: {e}")
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
        chunk_count=len(chunks), structured_data=structured.to_dict()
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
