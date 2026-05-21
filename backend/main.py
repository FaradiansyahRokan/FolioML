from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.upload import router as upload_router
from routes.chat import router as chat_router
from routes.insights import router as insights_router
from routes.ingest import router as ingest_router
from routes.agents import router as agents_router
from routes.audio import router as audio_router

app = FastAPI(
    title="FolioML - AI Knowledge OS",
    description="Upload documents, scrape URLs, and leverage AI agents for deep research and analysis.",
    version="3.0.0",
)

# CORS — allow Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routes
app.include_router(upload_router, prefix="/api", tags=["Documents"])
app.include_router(chat_router, prefix="/api", tags=["Chat"])
app.include_router(insights_router)
app.include_router(ingest_router, prefix="/api", tags=["Ingestion"])
app.include_router(agents_router)
app.include_router(audio_router, prefix="/api", tags=["Audio"])


from database.connection import init_db
from rag.vector_store import load_from_db

@app.on_event("startup")
async def startup():
    print("DocChat AI Knowledge OS v3.0 started")
    print("Initializing SQLite Database...")
    init_db()
    load_from_db()
    print("Documents: PDF, DOCX, TXT, MD, CSV")
    print("URL Ingestion: Paste any URL")
    print("Agents: 8 specialized AI agents")
    print("Hybrid Retrieval: Semantic + BM25")
    print("Insights: Study Guide, Podcast, FAQ, Critique, Cross-Reference")


@app.get("/")
def root():
    return {
        "status": "ok",
        "version": "3.0.0",
        "features": [
            "streaming", "multi-format", "conversation-memory",
            "hybrid-retrieval", "semantic-chunking", "url-ingestion",
            "agent-system", "cross-reference", "structured-parsing",
        ],
    }


@app.get("/health")
def health():
    from rag.vector_store import get_document_stats
    stats = get_document_stats()
    return {
        "status": "healthy",
        "mode": "in-memory",
        "knowledge_base": stats,
    }
