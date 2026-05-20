# DocChat — AI Knowledge Studio
### Technical System Overview

---

## 🧠 What Is This System?

**DocChat** adalah *enterprise-grade AI Knowledge OS* — sebuah sistem tanya-jawab berbasis dokumen yang dibangun di atas arsitektur **RAG (Retrieval-Augmented Generation)**. Alih-alih mengandalkan pengetahuan bawaan model AI (yang bisa kadaluarsa atau tidak akurat), sistem ini memaksa AI untuk **menjawab HANYA dari dokumen yang Anda upload**, dan menyertakan kutipan sumber yang presisi seperti paper akademik.

---

## 🏗️ Arsitektur Sistem (3-Layer)

```
┌──────────────────────────────────────────────────────────┐
│                   FRONTEND (Next.js 14)                  │
│   Left Sidebar (Chat & Files)  │  Chat Room  │  Studio   │
└──────────────────┬───────────────────────────────────────┘
                   │ REST API + Streaming (NDJSON)
┌──────────────────▼───────────────────────────────────────┐
│                  BACKEND (FastAPI + Python)               │
│   Document Routes  │  Chat Routes  │  Agent & Insight     │
└──────────────────┬───────────────────────────────────────┘
                   │
┌──────────────────▼───────────────────────────────────────┐
│           DATA LAYER (SQLite + In-Memory Vector Index)    │
│        Documents Table  │  Chunks Table (+ Embeddings)    │
└──────────────────────────────────────────────────────────┘
```

---

## 📄 1. Document Processing Pipeline

Ketika Anda mengupload sebuah file, sistem menjalankan **5 tahap proses secara otomatis**:

### Tahap 1 — Format Detection & Multi-Parser
File diidentifikasi berdasarkan ekstensi, lalu diproses oleh parser khusus:

| Format | Parser | Kemampuan Khusus |
|--------|--------|-----------------|
| `.pdf` | PyMuPDF (fitz) | Deteksi heading via font-size, ekstraksi tabel otomatis |
| `.docx` | python-docx | Deteksi Heading 1/2/3 dari style Word, ekstraksi tabel |
| `.txt` | Built-in | Deteksi heading dari teks UPPERCASE |
| `.md` | Regex-based | Deteksi heading `#`, blok kode ` ``` `, dan tabel |
| `.csv` | csv module | Konversi ke Markdown table + ringkasan kolom |
| `URL` | httpx scraper | Scraping konten web, stripping HTML |

### Tahap 2 — Structured Document Parsing
Setelah parsing, dokumen tidak disimpan sebagai teks mentah. Sistem membangun **model dokumen terstruktur (`StructuredDocument`)** yang menyimpan:
- Hirarki heading (level 1, 2, 3...)
- Blok teks per section
- Tabel (disimpan dalam format Markdown)
- Blok kode (dijaga keutuhannya)
- Metadata posisi halaman setiap section

### Tahap 3 — Semantic Chunking (Bukan Sekedar Potong-Potong)

Ini adalah salah satu bagian terpintar dari sistem. Dokumen tidak dipotong secara naif per N karakter. Sistem menggunakan **Semantic Chunking**:

- 🔒 **Tabel & kode selalu dijaga utuh** (tidak pernah dipotong di tengah)
- 📑 **Potongan teks mengikuti batas heading** (section-aware chunking)
- 📖 **Teks panjang dipotong di batas paragraf** (bukan di tengah kalimat)
- 🔁 **Fallback ke sliding-window** dengan overlap 200 karakter jika struktur tidak terdeteksi

Setiap chunk menyimpan metadata: nama dokumen, nomor halaman, nama section, dan tipe konten.

### Tahap 4 — Embedding Generation
Setiap chunk dikonversi menjadi **vector numerik berdimensi 1536** (representasi matematis makna teks) menggunakan:
- **OpenAI** → `text-embedding-3-small` 
- **Ollama (lokal)** → `nomic-embed-text` 

Sistem kompatibel dengan keduanya — bisa berjalan **100% offline** menggunakan Ollama.

### Tahap 5 — Dual Persistence
Setiap dokumen dan chunk disimpan di dua tempat:
1. **SQLite Database** → persisten di disk, dimuat ulang saat server restart
2. **In-Memory Vector Index** → untuk operasi pencarian yang sangat cepat

---

## 🔍 2. Hybrid Retrieval System

Ketika Anda bertanya, sistem mencari jawaban menggunakan **dua algoritma sekaligus** yang hasilnya digabungkan:

### Semantic Search (Cosine Similarity)
Pertanyaan Anda diembedd menjadi vektor, lalu dicari chunk yang vektornya paling "dekat" secara matematis (cosine similarity). Ini sangat efektif untuk pertanyaan yang **berbeda kata tapi sama maknanya**.

$$\text{similarity}(A, B) = \frac{A \cdot B}{\|A\| \cdot \|B\|}$$

### BM25 (Keyword-based Ranking)
Algoritma klasik dari mesin pencari (setara dengan apa yang digunakan Google generasi awal). Sangat efektif untuk **nama spesifik, istilah teknis, dan angka** yang mungkin tidak ditangkap dengan baik oleh embedding.

$$\text{BM25}(q, d) = \sum_{i=1}^{n} \text{IDF}(q_i) \cdot \frac{f(q_i, d) \cdot (k_1 + 1)}{f(q_i, d) + k_1 \cdot (1 - b + b \cdot \frac{|d|}{\text{avgdl}})}$$

### Score Fusion (Hybrid)
Kedua skor dinormalisasi lalu digabungkan dengan bobot:
- Semantic: **60%**
- BM25: **40%**

Sistem kemudian mengambil **top-K chunk terbaik** (default 5) yang melampaui threshold similarity `0.15`, lalu menyajikannya sebagai konteks ke LLM.

> Dengan pendekatan hybrid ini, sistem mampu menemukan jawaban yang relevan bahkan ketika user menggunakan kata-kata yang berbeda dari yang ada di dokumen, sekaligus tetap presisi untuk keyword spesifik.

---

## 💬 3. Chat & Streaming Response

### Conversation Memory
Sistem menyimpan **10 pesan terakhir** dari setiap percakapan sebagai konteks historis yang dikirim ke LLM bersama pertanyaan baru. Ini memungkinkan percakapan multi-turn yang natural (AI "ingat" apa yang dibahas sebelumnya).

### Streaming Token-by-Token
Respon AI dikirim ke browser **karakter demi karakter secara real-time** menggunakan **NDJSON streaming** (Newline-Delimited JSON). Artinya Anda langsung melihat jawaban terbentuk tanpa perlu menunggu seluruh respon selesai diproses.

### Citation System
Setiap chunk yang digunakan sebagai konteks diberi nomor `[1]`, `[2]`, dst. AI diwajibkan (melalui system prompt) untuk mencantumkan nomor kutipan di akhir setiap pernyataan — persis seperti gaya paper akademik.

---

## 🤖 4. AI Agent System (8 Specialized Agents)

Di AI Knowledge Studio (sidebar kanan), tersedia **8 agen AI khusus** yang masing-masing memiliki *system prompt* yang sangat spesifik:

| Agent | Fungsi |
|-------|--------|
| **Summarizer** | Executive summary + key points dari seluruh dokumen |
| **Fact Checker** | Verifikasi klaim, identifikasi pernyataan tanpa bukti |
| **Timeline Builder** | Susun kronologi event berdasarkan tanggal dalam dokumen |
| **Contradiction Detector** | Temukan inkonsistensi & kontradiksi antar dokumen |
| **Deep Researcher** | Laporan penelitian akademis lintas dokumen |
| **Code Explainer** | Analisis arsitektur kode & penjelasan teknis |
| **Meeting Extractor** | Action items, keputusan, dan next steps dari notulen |
| **Spreadsheet Analyst** | Tren, anomali, dan insight dari data tabular |

---

## ✨ 5. Insight Generator (5 Format Analisis)

Berbeda dari agent yang lebih berbasis query, Insight Generator langsung memproses **seluruh dokumen aktif** dan menghasilkan output dalam format yang sudah ditentukan:

| Insight | Output |
|---------|--------|
| **Study Guide** | Executive summary, key concepts, glossary, takeaways |
| **Podcast Script** | Naskah percakapan Host vs Expert yang natural |
| **FAQ Generator** | 5-7 pertanyaan krusial beserta jawaban detailnya |
| **Critical Analysis** | Strengths, weaknesses, hidden bias, unanswered questions |
| **Cross-Reference** | Benang merah, kontradiksi, dan sintesis antar dokumen |

---

## 🛠️ 6. Full Technology Stack

### Frontend
| Teknologi | Versi | Peran |
|-----------|-------|-------|
| **Next.js** | 14.2.5 | React framework + App Router |
| **TypeScript** | 5.x | Type-safe development |
| **Tailwind CSS** | 3.4.7 | Utility-first styling |
| **react-markdown** | 10.x | Render Markdown dari AI |
| **remark-gfm** | 4.x | GitHub Flavored Markdown (tabel, checklist) |
| **remark-math** | latest | Parse syntax LaTeX matematika |
| **rehype-katex** | latest | Render formula LaTeX ke HTML |
| **lucide-react** | 1.x | Icon library yang clean |

### Backend
| Teknologi | Versi | Peran |
|-----------|-------|-------|
| **FastAPI** | latest | High-performance async API framework |
| **Python** | 3.10+ | Backend language |
| **PyMuPDF (fitz)** | latest | PDF parsing & extraction |
| **python-docx** | latest | DOCX parsing |
| **httpx** | latest | Async HTTP client (untuk LLM API & scraping) |
| **SQLite** | built-in | Persistent document & chunk storage |

### AI / LLM Layer
| Mode | Provider | Model LLM | Model Embedding |
|------|----------|-----------|-----------------|
| **Cloud** | OpenAI | GPT-4o-mini | text-embedding-3-small |
| **Local / Offline** | Ollama | Qwen 2.5 7B Instruct | nomic-embed-text |

---

## 🔐 7. Key Design Decisions

### Kenapa Tidak Pakai Vector Database Eksternal (Pinecone, Weaviate)?
Proyek ini menggunakan **SQLite + In-Memory index** yang diload ulang saat startup. Ini disengaja untuk kesederhanaan deployment — tidak ada dependency eksternal, tidak ada biaya tambahan, dan performa cukup untuk ribuan chunk. Untuk skala enterprise, tinggal swap dengan pgvector atau Pinecone.

### Kenapa Hybrid Retrieval (Bukan Hanya Semantic)?
Pure semantic search sering gagal untuk:
- Nama orang/perusahaan yang spesifik
- Angka, kode, atau ID unik
- Istilah teknis yang jarang muncul dalam data training embedding

BM25 mengisi celah ini dengan matching berbasis kata kunci yang presisi.

### Kenapa Streaming NDJSON, Bukan WebSocket?
NDJSON streaming via HTTP lebih sederhana dalam deployment, tidak memerlukan persistent connection, dan bekerja dengan baik melalui proxy/CDN. Tradeoff: tidak bisa mengirim data dua arah, tapi untuk use case chat ini tidak diperlukan.

---

## 🚀 8. Data Flow — End to End

```
User types question
        │
        ▼
[Frontend] Question → API POST /api/chat
        │
        ▼
[Backend] embed(question) → 1536-dim vector
        │
        ▼
[Vector Store] Hybrid Search
  ├── Cosine Similarity (semantic, 60%)
  └── BM25 Score (keyword, 40%)
        │
        ▼
Top-5 chunks retrieved (dengan filter threshold 0.15)
        │
        ▼
Build prompt: [System Prompt] + [History 10 msg] + [Context chunks] + [Question]
        │
        ▼
Stream to LLM (OpenAI / Ollama)
        │
        ▼
[Backend] token-by-token → NDJSON stream → [Frontend]
        │
        ▼
ReactMarkdown + KaTeX renders response in real-time
(dengan citation numbers [1][2] yang bisa diklik)
```

---

*Built with ❤️ using RAG architecture, hybrid retrieval, semantic chunking, and streaming AI responses.*
