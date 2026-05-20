# 📄 DocChat — RAG Document Chat (No Database)

Versi **tanpa database** — semua data disimpan di memory (RAM).
Upload PDF, tanya pertanyaan, dapat jawaban dari dokumenmu lengkap dengan source citation.

> ⚠️ **Catatan:** Data akan hilang saat server di-restart. Cocok untuk testing dan penggunaan lokal ringan.

```
┌─────────────────────────────────────────────────────────┐
│  Upload PDF  →  Extract Text  →  Chunk  →  Embed        │
│                      ↓                                   │
│               Simpan di Memory (RAM)                     │
│                                                          │
│  Question  →  Embed  →  Cosine Search  →  LLM  → Answer │
└─────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer      | Technology                        |
|------------|-----------------------------------|
| Frontend   | Next.js 14, TypeScript, Tailwind CSS |
| Backend    | FastAPI, Python 3.11+             |
| Storage    | In-memory (Python dict + list)    |
| AI (cloud) | OpenAI (GPT-4o-mini + embeddings) |
| AI (local) | Ollama (Llama 3.2 + nomic-embed-text) |
| PDF        | PyMuPDF (fitz)                    |

**Tidak perlu:** PostgreSQL, pgvector, Docker

---

## Project Structure

```
rag-chat/
├── backend/
│   ├── main.py                  # FastAPI entry point (tanpa DB init)
│   ├── requirements.txt         # Lebih ringan — tanpa psycopg2/pgvector
│   ├── .env.example
│   ├── database/
│   │   └── connection.py        # Dummy — tidak dipakai
│   ├── rag/
│   │   ├── pdf_processor.py     # Ekstrak teks + chunking
│   │   ├── embeddings.py        # OpenAI / Ollama embeddings
│   │   └── vector_store.py      # In-memory storage + cosine similarity
│   ├── routes/
│   │   ├── upload.py            # POST /api/upload
│   │   └── chat.py              # POST /api/chat
│   └── services/
│       └── llm_service.py       # OpenAI / Ollama LLM calls
│
├── frontend/
│   ├── app/page.tsx             # Main chat UI
│   ├── components/              # MessageBubble, SourcesPanel, dll
│   ├── services/api.ts          # API calls ke backend
│   └── types/index.ts           # TypeScript types
│
└── README.md
```

---

## Quick Start (Hanya 2 Langkah!)

### 1. Backend

```bash
cd backend

# Copy dan isi environment variables
cp .env.example .env
# Edit .env — isi OPENAI_API_KEY (atau set AI_PROVIDER=ollama)

# Buat virtual environment
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Jalankan server
uvicorn main:app --reload --port 8000
```

API docs: http://localhost:8000/docs

### 2. Frontend

```bash
cd frontend

# Copy env
cp .env.local.example .env.local

# Install dan jalankan
npm install
npm run dev
```

Buka http://localhost:3000 ✅

---

## Environment Variables

### Backend (`backend/.env`)

```env
# AI Provider: "openai" atau "ollama"
AI_PROVIDER=openai

# OpenAI (jika AI_PROVIDER=openai)
OPENAI_API_KEY=sk-...
OPENAI_CHAT_MODEL=gpt-4o-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

# Ollama (jika AI_PROVIDER=ollama)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_CHAT_MODEL=llama3.2
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
```

### Frontend (`frontend/.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api
```

---

## Pakai Ollama (Fully Local, Gratis)

```bash
# 1. Install Ollama: https://ollama.com/download

# 2. Pull model
ollama pull llama3.2
ollama pull nomic-embed-text

# 3. Set di backend/.env
AI_PROVIDER=ollama
```

---

## API Endpoints

| Method | Path                    | Keterangan              |
|--------|-------------------------|-------------------------|
| POST   | `/api/upload`           | Upload PDF              |
| GET    | `/api/documents`        | Daftar semua dokumen    |
| DELETE | `/api/documents/{id}`   | Hapus dokumen           |
| POST   | `/api/chat`             | Tanya jawab RAG         |
| GET    | `/health`               | Health check            |

---

## File yang Diubah vs Versi Database

| File | Perubahan |
|------|-----------|
| `backend/database/connection.py` | Jadi dummy kosong |
| `backend/rag/vector_store.py` | Ganti pgvector → dict/list + cosine similarity manual |
| `backend/routes/upload.py` | Simpan dokumen ke memory, bukan SQL |
| `backend/main.py` | Hapus `init_db()` |
| `backend/requirements.txt` | Hapus `psycopg2-binary` dan `pgvector` |
| `backend/.env.example` | Hapus `DATABASE_URL` |

Frontend **tidak ada perubahan** sama sekali.

---

## Batasan In-Memory Mode

| Aspek | In-Memory | Dengan PostgreSQL |
|-------|-----------|-------------------|
| Setup | Langsung jalan | Perlu Docker/DB |
| Data saat restart | ❌ Hilang | ✅ Tersimpan |
| Performa banyak dokumen | Lambat (linear scan) | Cepat (vector index) |
| Cocok untuk | Testing, belajar | Production |

---

## Troubleshooting

**`ModuleNotFoundError: No module named 'fitz'`**
```bash
pip install PyMuPDF
```

**Ollama connection refused**
```bash
ollama serve   # pastikan Ollama berjalan
```

**CORS error di browser**
Pastikan backend berjalan di port 8000 dan frontend di port 3000.
