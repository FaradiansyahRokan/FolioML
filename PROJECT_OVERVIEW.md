# Project Documentation

---

## 1. Project Overview

**Name:** **FolioML - Retrieval-Augmented Generation (RAG)** 
**Purpose:** Provide an interactive AI‑assistant that lets users upload multiple documents (PDF, TXT, MD) and converse with them via Retrieval‑Augmented Generation (RAG)
**Target Users:** Researchers, students, knowledge workers, and developers who need quick, contextual answers from a personal collection of files.  
**Problem Solved:** Manual reading of dozens‑hundred PDFs is time‑consuming, information is scattered, and classic keyword search cannot capture semantic similarity.

---

## 2. Problem Statement

- **Why built?**  Users struggle to extract insights from large document corpora.  
- **Existing pain points:**
  - Skimming PDFs is tedious.
  - Traditional search returns exact keyword matches, missing synonyms and paraphrases.
  - Centralised knowledge bases are heavyweight and often require costly vector‑DB services.
- **Why legacy solutions fall short:** Keyword‑based tools lack semantic understanding; hosted RAG services add latency, cost, and data‑privacy concerns.
- **Bottleneck:** The “search‑then‑read” loop forces users to open many files, copy‑paste text, and lose context.

---

## 3. Solution

A lightweight **frontend‑backend** application that:
1. **Ingests** uploaded files, extracts clean text, chunks it, and creates embeddings **in‑process** using OpenAI/Claude APIs.  
2. **Stores** embeddings temporarily in memory (no external DB).  
3. **Retrieves** the most relevant chunks on‑the‑fly and feeds them to a Large Language Model (LLM) to generate concise, cited answers.

**Why better?**
- Zero‑setup – no vector DB provisioning.
- Full control of data: everything stays in the user’s session.
- Fast prototyping: developers can spin up the system with a single `npm run dev` + `uvicorn`.

**Magic:** Real‑time streaming of LLM responses with chunk‑level citations, all powered by an in‑memory similarity search.

---

## 4. Core Features

| Feature | Description |
|---------|-------------|
| **Document Upload** | Drag‑and‑drop or file‑picker for PDFs, TXT, MD. |
| **Text Extraction** | PDF parsing → clean plain text. |
| **Chunking & Embedding** | Sliding‑window chunker + OpenAI embeddings (or local model). |
| **In‑Memory Vector Store** | Simple cosine similarity lookup (no DB). |
| **Semantic Search** | Retrieve top‑k relevant chunks for a query. |
| **Chat Interface** | Conversational UI with streaming LLM responses. |
| **Citation Display** | Each answer includes source chunk citations (file name + snippet). |
| **History** | Session‑level chat history retained while app runs. |
| **Export** | Download conversation transcript as markdown. |

---

## 5. User Flow / Workflow

```
User opens app → Upload one or many documents
    ↓
Backend parses PDFs → extracts clean text
    ↓
Text is split into overlapping chunks (≈200‑300 tokens)
    ↓
Each chunk is sent to the embedding model → vector stored in RAM
    ↓
User asks a question in the chat box
    ↓
Retriever finds top‑k similar chunks (cosine similarity)
    ↓
Prompt builder formats: <system prompt> + <retrieved chunks> + <user query>
    ↓
LLM generates answer (streamed to UI)
    ↓
UI displays answer with inline citations linking back to original document snippets
```

---

## 6. System Architecture

```
Frontend (Next.js + TypeScript)            <-- UI & chat UI
    │
    ▼
API Gateway (Next.js API routes)            <-- Auth‑less proxy
    │
    ▼
Backend Service (Python FastAPI)
    │   ├─ /upload   → receives files, extracts text
    │   ├─ /ingest   → chunk‑ing, embedding, store in RAM
    │   └─ /chat     → retrieve, build prompt, call LLM, stream response
    │
    ▼
Embedding Provider (OpenAI / Azure / Local model)   <-- HTTP call
    │
    ▼
In‑Memory Vector Store (list of dicts: {id, vector, metadata})
    │
    ▼
LLM Provider (OpenAI ChatCompletion, Anthropic, etc.)
```

- **Frontend:** React components, Tailwind CSS for sleek modern look.  
- **Backend:** FastAPI, Uvicorn (ASGI) – async endpoints for streaming.  
- **Database:** None persisted; RAM‑only.  
- **AI Pipeline:** `pdfminer` → `text_cleaner` → `chunker` → `embedding_api` → `vector_store` → `retriever` → `prompt_builder` → `LLM`.  
- **Hosting:** Local dev (Docker optional), can be containerised for production.

---

## 7. Technology Stack

| Layer | Tech |
|-------|------|
| **Frontend** | Next.js (React), TypeScript, Tailwind CSS, react‑markdown, katex (math rendering) |
| **Backend** | Python 3.11, FastAPI, Uvicorn, pydantic |
| **Embedding** | OpenAI text‑embedding‑ada‑002 (or any OpenAI compatible endpoint) |
| **LLM** | OpenAI ChatGPT‑4o, Claude‑3.5, or any compatible chat model |
| **Document Parsing** | pdfminer.six, python‑docx, plain‑text handling |
| **Vector Store** | Simple Python list + NumPy cosine similarity (no external DB) |
| **Infra** | Docker (optional), Docker‑Compose, VS Code devcontainer |
| **Queue / Async** | FastAPI’s async endpoints; no extra queue needed for the in‑memory version |

---

## 8. AI / ML Components

- **Embedding Model:** `text-embedding-ada-002` (1536‑dim). Chosen for its speed, cost‑effectiveness, and strong semantic capture for short‑to‑medium texts.
- **LLM Provider:** ChatGPT‑4o (or Claude‑3.5). Supports streaming and system‑prompt control.
- **RAG Strategy:** Retrieve‑then‑Generate – the retrieved chunks are supplied as context in the prompt.
- **Chunking Strategy:** Overlap of 50 tokens to preserve continuity across sentence boundaries.
- **Memory:** Session‑level in‑memory cache of embeddings, cleared on server restart.

---

## 9. Data Flow (Internal)

```
File Upload → PDF Parser → Clean Text → Chunker → Embedding API → In‑Memory Vector Store

User Query → Retriever (cosine similarity) → Top‑k chunks → Prompt Builder → LLM → Streamed Answer → UI (with citations)
```

---

## 10. Scalability

- **Current Limits:** In‑memory store fits ~10k chunks (≈2‑3 GB RAM).  
- **Horizontal Scaling:** Replace RAM store with a distributed vector DB (Pinecone, Weaviate, Qdrant) – the API stays the same.  
- **Bottlenecks:** Embedding latency (batch calls), similarity search (O(N)).  
- **Mitigations:** Batch embeddings, FAISS‑style approximate nearest neighbor, caching recent queries, async streaming, GPU acceleration for embedding if using local model.

---

## 11. Security

- **Data Isolation:** All documents stay on the server process; no external persistence.  
- **Transport:** HTTPS recommended for production (TLS termination via reverse proxy).  
- **Authentication:** Not built‑in – can be added via Next‑Auth or API key header.  
- **Rate Limiting:** Simple per‑IP limit on `/chat` to avoid LLM abuse.  
- **Encryption:** No at‑rest encryption needed for in‑memory data; if persisted, enable disk encryption.

---

## 12. Performance Optimization

- **Async Endpoints:** FastAPI streams LLM response without blocking.
- **Batch Embedding:** Send up to 100 chunks per API call to reduce round‑trips.
- **Caching:** Store recent embeddings in a LRU cache for re‑use across queries.
- **Streaming UI:** React component updates on each token for a “live” feel.
- **GPU (optional):** If using a local embedding model, GPU can accelerate vector generation.

---

## 13. Business Side

| Aspect | Consideration |
|--------|----------------|
| **Monetization** | SaaS tier – free tier (limited docs, 5 queries/min), paid tier (unlimited docs, higher rate limits). |
| **Pricing** | OpenAI usage billed per token; add a markup to cover infrastructure. |
| **Cost Structure** | LLM API costs (~$0.002 per 1k tokens), Embedding API (~$0.0004 per 1k tokens). |
| **Customer Segments** | Academic researchers, knowledge‑base teams, product documentation teams. |
| **CAC/LTV** | Low CAC via developer evangelism; LTV driven by subscription renewal. |

---

## 14. Competitive Analysis

| Competitor | Strength | Weakness |
|------------|----------|----------|
| **Notion AI** | Integrated note‑taking, rich UI. | Requires Notion subscription, limited raw document upload. |
| **Google NotebookLM** | Powerful Google search integration. | Closed ecosystem, less control over data. |
| **Perplexity AI** | Fast web‑search backed answers. | No private document ingestion. |
| **OpenAI Retrieval Plugin** | Easy plug‑and‑play with vector DB. | Needs external vector store, higher cost. |

**Our Edge:** Zero‑DB, full data privacy, simple dev‑first setup, customizable UI.

---

## 15. Limitations

- **Memory Bound:** In‑memory vector store caps total document size.
- **Hallucination:** LLM may generate content not grounded in retrieved chunks – mitigated by citing sources.
- **Token Limits:** Prompt length limited (~8k tokens for most models). Large corpora require more aggressive chunk reduction.
- **Latency:** Embedding and LLM calls add round‑trip time; batching helps but cannot be eliminated.
- **Security:** No auth out‑of‑the‑box – must be added for production.

---

## 16. Future Improvements

- **Persistent Vector DB** (Weaviate/Pinecone) for unlimited scale.
- **User Auth & Multi‑User Isolation** (OAuth, JWT).
- **Fine‑Tuned RAG Model** for domain‑specific accuracy.
- **Voice Interaction** – Speech‑to‑text query and text‑to‑speech answers.
- **Agentic Orchestration** – Multiple specialist agents (summarizer, extractor, chart generator).
- **Desktop/Electron Wrapper** for offline use.

---

## 17. Engineering Decisions

- **In‑Memory Store:** Chosen for rapid prototyping and zero‑cost demo; easy to swap to a DB later.
- **FastAPI + Async:** Provides native streaming and high concurrency without heavy infrastructure.
- **Next.js UI:** React ecosystem enables component re‑use, server‑side rendering for SEO, and easy Tailwind integration.
- **OpenAI APIs:** Best trade‑off between cost, speed, and quality for embeddings and chat.
- **Chunk Overlap:** Prevents loss of context across chunk boundaries.

---

## 18. Operational System

- **Dev:** `npm run dev` (frontend) + `uvicorn main:app --reload` (backend).  
- **CI/CD:** GitHub Actions – lint (ESLint, flake8), test (Jest, pytest), build Docker images, push to registry.  
- **Deployment:** Docker‑Compose for local; Kubernetes Helm chart for cloud (AWS/EKS).  
- **Monitoring:** Prometheus metrics exposed by FastAPI; Grafana dashboards.  
- **Logging:** Structured JSON logs via `loguru`.  
- **Error Tracking:** Sentry integration for both frontend and backend.

---

## 19. Internal Logic / Brain System

1. **Retriever:** Compute cosine similarity between query embedding and stored chunk vectors; return top‑k.
2. **Prompt Builder:** System prompt defines role (knowledge assistant). Retrieved chunks are inserted under a `Context:` heading.
3. **LLM Call:** `openai.ChatCompletion.create(..., stream=True)` – tokens are streamed back.
4. **Citation Extraction:** Each chunk metadata includes `source_file` and `snippet`; mapper adds footnote numbers to the answer.
5. **Tool Calling (future):** Could invoke external tools (e.g., PDF summarizer) via LangChain style agents.

---

## 20. UX Philosophy

- **Chat‑Centric UI:** Mirrors natural conversation, lowers learning curve.
- **Inline Citations:** Transparency – users see exactly where information originated.
- **Minimalist Design:** Focus on content; subtle animations (hover, loading spinners) keep UI lively without distraction.
- **Responsive Layout:** Single‑column on mobile, two‑column on desktop (document list left, chat right).
- **Dark/Light Mode Toggle:** Keeps eyes comfortable during long research sessions.
- **Keyboard Shortcuts:** `Ctrl+Enter` to send, `Esc` to clear, enhancing productivity.

---

*Document generated on 2026‑05‑20.*
