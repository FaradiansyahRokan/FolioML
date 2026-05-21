# Fast Research - Trusted Sources Web Search

## Fitur Baru: Fast Research

**Fast Research** adalah fitur untuk melakukan riset cepat dari sumber-sumber terpercaya di web **tanpa** mencari di dokumen lokal Anda.

## 🎯 Keunggulan

✅ **Hanya dari sumber terpercaya** — Wikipedia, berita terkenal, artikel akademik  
✅ **Tidak ada Instagram, YouTube, atau social media** — Hanya artikel dan konten berkualitas  
✅ **Kredibilitas score** — Setiap sumber diberi rating berdasarkan terpercaya-nya  
✅ **Kategori sumber jelas** — Tahu dari mana data berasal (news, academic, reference, dll)  
✅ **Streaming real-time** — Jawaban muncul sambil loading  

## 📚 Sumber yang Diizinkan

### 🔹 Reference & Encyclopedia
- Wikipedia (semua bahasa)
- Britannica

### 🔹 Berita Global
- BBC
- Reuters
- AP News
- The Guardian
- Bloomberg
- CNBC
- Al Jazeera

### 🔹 Berita Indonesia
- Kompas.com
- CNN Indonesia
- Tribun News
- Detik.com
- Liputan6.com
- Merdeka.com
- Tirto.id
- VOA Indonesia

### 🔹 Akademik & Penelitian
- ArXiv (preprint papers)
- Google Scholar
- ResearchGate
- JSTOR
- NCBI/PubMed
- Semantic Scholar

### 🔹 Sains & Kesehatan
- Science Daily
- Nature
- Science Magazine
- Mayo Clinic
- WebMD
- Healthline

### 🔹 Teknologi & Dokumentasi
- GitHub
- Stack Overflow
- Medium (artikel verified)
- Dev.to
- Official documentation (Python, Microsoft, etc)

### 🔹 Bisnis & Industri
- Forbes
- TechCrunch
- VentureBeat
- Business Insider
- The Verge

### 🔹 Government & Official
- Semua domain `.gov` (US government)
- Semua domain `.go.id` (Indonesian government)
- Semua domain `.edu` (universitas)

## 🚫 Sumber yang DIBLOKIR

❌ Instagram  
❌ TikTok  
❌ Facebook  
❌ Twitter/X  
❌ YouTube  
❌ Reddit  
❌ Threads  
❌ Pinterest  
❌ Quora  
❌ URL shorteners (bit.ly, tinyurl, dll)  
❌ Ad networks  

## 🔌 API Endpoints

### 1. Fast Research (Non-Streaming)
```
POST /api/research

Body:
{
  "query": "apa itu machine learning",
  "max_results": 5
}

Response:
{
  "answer": "...",
  "sources": [
    {
      "document_name": "[ACADEMIC] ArXiv - Machine Learning Paper",
      "content_preview": "...",
      "similarity": 0.9,
      "source_url": "https://arxiv.org/...",
      "credibility_score": 0.9
    }
  ]
}
```

### 2. Fast Research Streaming
```
POST /api/research/stream

Mengembalikan NDJSON stream dengan:
- type: "sources" — list sumber terpercaya
- type: "token" — token jawaban (per word/token)
- type: "done" — selesai
- type: "error" — error message
```

## 🎨 Frontend Usage

### Non-Streaming
```typescript
import { fastResearch } from "@/services/api";

const result = await fastResearch("siapa presiden Indonesia?", 5);
console.log(result.answer);
console.log(result.sources); // Array of SourceCitation
```

### Streaming
```typescript
import { streamFastResearch } from "@/services/api";

await streamFastResearch(
  "jelaskan quantum computing",
  5,
  (token) => console.log(token), // onToken
  (sources) => console.log(sources), // onSources
  () => console.log("Done!"), // onDone
  (error) => console.error(error) // onError
);
```

## 🔐 Credibility Scoring

Setiap sumber diberi score 0.0-1.0:

| Kategori | Score |
|----------|-------|
| Reference (Wikipedia) | 0.95 |
| Academic (ArXiv, Scholar) | 0.90 |
| Government Official | 0.90 |
| Science (Nature, Science Daily) | 0.85 |
| News (Reuters, BBC) | 0.80 |
| Tech Docs (GitHub, StackOF) | 0.75 |
| Business (Forbes, TechCrunch) | 0.70 |

Score lebih tinggi = sumber lebih terpercaya

## 📊 Implementasi Teknis

### Backend (`backend/utils/trusted_sources.py`)
- **`is_trusted_domain(url)`** — Check if domain is trusted
- **`filter_trusted_results(results)`** — Filter search results
- **`rank_by_credibility(results)`** — Sort by credibility score
- **`get_source_category(url)`** — Get category (news, academic, dll)

### Chat Routes (`backend/routes/chat.py`)
- **`_fetch_web_fallback()`** — Updated dengan trusted filtering
- **`POST /api/research`** — Fast research endpoint
- **`POST /api/research/stream`** — Streaming variant

### Frontend (`frontend/services/api.ts`)
- **`fastResearch(query, maxResults)`** — Non-streaming call
- **`streamFastResearch(...)`** — Streaming call

## 🔄 Workflow

```
User query di frontend
    ↓
Send ke /api/research atau /api/research/stream
    ↓
Backend search menggunakan DDGS (DuckDuckGo)
    ↓
Filter: Hanya sumber terpercaya yang lolos
    ↓
Rank: Sort berdasarkan credibility score
    ↓
Fetch content dari URL terpercaya
    ↓
Extract text & metadata
    ↓
Send ke LLM untuk generate answer
    ↓
Stream kembali ke frontend
```

## ⚙️ Customization

Untuk menambah sumber terpercaya baru, edit `backend/utils/trusted_sources.py`:

```python
TRUSTED_DOMAINS = {
    "category_name": [
        "domain.com",
        "another-domain.org",
    ],
    ...
}
```

Untuk mengubah credibility score:
```python
scores = {
    "your_category": 0.85,
    ...
}
```

## 📌 Notes

- Fast Research **tidak menyimpan** hasil search
- **Tidak ada memory** dengan dokumen lokal (terpisah)
- Setiap call fetch dari web fresh
- Timeout per URL: 5 detik
- Default max_results: 5 (bisa diatur)
- Support bahasa: Tergantung query (auto-detect)
