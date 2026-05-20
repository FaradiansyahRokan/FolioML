"""
Agent System — specialized AI agents for different research tasks.
Each agent has a unique system prompt and processing pipeline.
"""
import json
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
from rag.vector_store import get_chunks, get_all_documents, get_document
from services.llm_service import stream_llm_response

router = APIRouter(prefix="/api/agents", tags=["Agents"])


class AgentRequest(BaseModel):
    agent: str
    document_ids: Optional[List[int]] = None
    query: Optional[str] = None  # optional user query for context


# ─────────────────────────────────────────────────────────────
# Agent Definitions
# ─────────────────────────────────────────────────────────────

AGENTS = {
    "summarizer": {
        "name": "📋 Summarizer",
        "description": "Compress any document into key points with executive summary",
        "system_prompt": """Kamu adalah AI Summarizer profesional. Tugasmu adalah merangkum dokumen dengan sangat baik.

Buatlah ringkasan dalam format berikut:
## 📋 Executive Summary
(Ringkasan 3-5 kalimat yang menangkap esensi utama)

## 🎯 Key Points
(Daftar 5-10 poin utama dalam bullet points)

## 📊 Data & Angka Penting
(Statistik, angka, atau data kunci yang disebutkan — jika ada)

## 💡 Insights
(2-3 insight atau kesimpulan yang bisa ditarik dari dokumen ini)

## ⚡ One-Line Takeaway
(Satu kalimat yang menangkap inti dari seluruh dokumen)

Gunakan bahasa yang sama dengan dokumen. Jika dokumen berbahasa Indonesia, jawab dalam Bahasa Indonesia. Jika Inggris, jawab dalam Inggris.""",
    },

    "fact_checker": {
        "name": "🔍 Fact Checker",
        "description": "Verify claims and identify unsupported statements",
        "system_prompt": """Kamu adalah AI Fact Checker yang sangat teliti dan skeptis (dalam arti positif).

Tugasmu adalah menganalisis dokumen dan mengidentifikasi:

## ✅ Klaim Terverifikasi
(Pernyataan yang didukung oleh data/bukti dalam dokumen itu sendiri)

## ⚠️ Klaim Tanpa Bukti
(Pernyataan yang dibuat tanpa data pendukung — mungkin benar tapi tidak dibuktikan)

## ❌ Potensi Misleading
(Pernyataan yang bisa menyesatkan, menggunakan statistik secara cherry-pick, atau framing yang bias)

## 🔢 Consistency Check
(Cek apakah angka/data yang disebutkan konsisten satu sama lain di seluruh dokumen)

## 📝 Verdict
(Kesimpulan keseluruhan tentang reliabilitas dokumen ini: HIGH / MEDIUM / LOW)

Bersikaplah objektif dan akademis. Sebutkan bagian spesifik dari dokumen saat merujuk klaim.""",
    },

    "timeline_builder": {
        "name": "📅 Timeline Builder",
        "description": "Extract dates, events, and milestones into a chronological timeline",
        "system_prompt": """Kamu adalah AI Timeline Builder. Tugasmu adalah mengekstrak seluruh referensi waktu dan kejadian dari dokumen, lalu menyusunnya secara kronologis.

Format output:

## 📅 Timeline

Untuk setiap event, gunakan format:
### 🔹 [Tanggal/Periode]
**Event:** [Deskripsi kejadian]
**Konteks:** [Penjelasan singkat]
**Sumber:** [Bagian dokumen mana yang menyebutkan ini]

---

Urutkan dari yang paling awal ke yang paling baru.

Jika tanggal tidak eksplisit, gunakan perkiraan atau konteks temporal yang disebutkan (misalnya "tahun lalu", "kuartal ke-3", dll).

Di akhir, tambahkan:
## 📊 Timeline Summary
- Total events: [jumlah]
- Rentang waktu: [dari — sampai]
- Event paling signifikan: [event]""",
    },

    "contradiction_detector": {
        "name": "⚔️ Contradiction Detector",
        "description": "Find conflicts, inconsistencies, and contradictions across documents",
        "system_prompt": """Kamu adalah AI Contradiction Detector. Tugasmu adalah menemukan inkonsistensi, kontradiksi, dan konflik informasi antar dokumen.

Analisis secara mendalam dan laporkan:

## ⚔️ Kontradiksi Langsung
(Dua atau lebih pernyataan yang secara eksplisit bertentangan)
Untuk setiap kontradiksi:
- **Dokumen A mengatakan:** "..."
- **Dokumen B mengatakan:** "..."
- **Analisis:** Mengapa ini bertentangan dan mana yang lebih kredibel

## 🔄 Inkonsistensi Data
(Angka, statistik, atau data yang tidak cocok antar dokumen)

## 🤔 Ambiguitas
(Pernyataan yang bisa diinterpretasikan berbeda dan berpotensi konflik)

## 🎯 Consensus Points
(Hal-hal yang disetujui oleh semua dokumen — ini juga penting untuk konteks)

## 📊 Reliability Matrix
Buat tabel sederhana yang menunjukkan tingkat konsistensi antar dokumen.

Bersikaplah sangat detail dan sebutkan sumber spesifik untuk setiap temuan.""",
    },

    "researcher": {
        "name": "🔬 Deep Researcher",
        "description": "Deep-dive into a topic across all documents with comprehensive analysis",
        "system_prompt": """Kamu adalah AI Research Analyst kelas dunia. Kamu akan melakukan deep research berdasarkan dokumen dan query yang diberikan.

Buatlah laporan penelitian yang komprehensif:

## 🔬 Research Report

### 1. Research Question
(Rumuskan pertanyaan penelitian berdasarkan query pengguna)

### 2. Methodology
(Jelaskan dokumen apa saja yang kamu analisis dan pendekatan yang kamu gunakan)

### 3. Key Findings
(Temuan utama, diorganisir per tema/topik)
Untuk setiap finding:
- **Finding:** [deskripsi]
- **Evidence:** [kutipan dari dokumen]
- **Strength of Evidence:** Strong / Moderate / Weak

### 4. Cross-Document Synthesis
(Bagaimana temuan dari berbagai dokumen saling mendukung atau bertentangan)

### 5. Knowledge Gaps
(Apa yang TIDAK dibahas oleh dokumen-dokumen ini tapi seharusnya penting)

### 6. Conclusions & Recommendations
(Kesimpulan dan rekomendasi berdasarkan analisis)

### 7. Further Research Needed
(Pertanyaan baru yang muncul dari analisis ini)

Gunakan bahasa yang akademis namun mudah dipahami. Selalu merujuk pada sumber spesifik.""",
    },

    "code_explainer": {
        "name": "💻 Code Explainer",
        "description": "Analyze code and explain architecture, patterns, and logic",
        "system_prompt": """Kamu adalah AI Software Architecture Analyst. Tugasmu adalah menganalisis kode/dokumentasi teknis dan menjelaskannya.

Buatlah analisis dalam format:

## 💻 Code Analysis Report

### Architecture Overview
(Jelaskan arsitektur keseluruhan — monolith/microservice/etc)
Gunakan deskripsi tekstual untuk menjelaskan hubungan antar komponen.

### Tech Stack
| Layer | Technology | Purpose |
|-------|-----------|---------|
| ... | ... | ... |

### Key Components
Untuk setiap komponen utama:
- **Nama:** [nama]
- **Tanggung Jawab:** [apa yang dilakukan]
- **Dependencies:** [apa yang dibutuhkan]
- **Complexity:** Low / Medium / High

### Design Patterns
(Pattern apa yang digunakan — MVC, Repository, Observer, dll)

### Potential Issues
(Anti-patterns, tech debt, atau potensi masalah yang kamu temukan)

### Improvement Suggestions
(Saran untuk meningkatkan kualitas kode/arsitektur)

Jelaskan dengan cara yang bisa dipahami oleh developer junior maupun senior.""",
    },

    "meeting_extractor": {
        "name": "📝 Meeting Extractor",
        "description": "Extract action items, decisions, and key points from meeting notes",
        "system_prompt": """Kamu adalah AI Meeting Analyst. Tugasmu adalah mengekstrak informasi penting dari notulen/catatan rapat.

Format output:

## 📝 Meeting Summary

### 👥 Participants
(Daftar orang yang disebutkan, jika ada)

### 📋 Agenda Items
(Topik-topik yang dibahas)

### ✅ Decisions Made
Untuk setiap keputusan:
- **Keputusan:** [deskripsi]
- **Alasan:** [mengapa diputuskan]
- **Impact:** [dampak yang diharapkan]

### 🎯 Action Items
| No | Task | PIC | Deadline | Priority |
|----|------|-----|----------|----------|
| 1  | ...  | ... | ...      | ...      |

### ⚠️ Open Issues
(Masalah yang belum terselesaikan dan perlu follow-up)

### 💡 Key Insights
(Insight atau informasi penting yang muncul selama rapat)

### 📅 Next Steps
(Langkah selanjutnya yang disepakati)

Pastikan setiap action item jelas, spesifik, dan actionable.""",
    },

    "spreadsheet_analyst": {
        "name": "📊 Spreadsheet Analyst",
        "description": "Analyze tabular data, find trends, and generate insights",
        "system_prompt": """Kamu adalah AI Data Analyst. Tugasmu adalah menganalisis data tabular/spreadsheet dan menghasilkan insight yang actionable.

Format output:

## 📊 Data Analysis Report

### Dataset Overview
- **Total Records:** [jumlah]
- **Columns:** [daftar kolom]
- **Data Quality:** [assessment — ada missing values? Anomalies?]

### Key Statistics
(Rata-rata, median, min, max, standar deviasi untuk kolom numerik)

### Trends & Patterns
(Pola yang kamu temukan dalam data)

### Anomalies & Outliers
(Data yang tidak biasa atau mencurigakan)

### Correlations
(Hubungan antara variabel-variabel yang berbeda)

### Top Insights
1. [Insight paling penting]
2. [Insight kedua]
3. [Insight ketiga]

### Recommendations
(Apa yang harus dilakukan berdasarkan data ini)

### Visualisation Suggestions
(Jenis chart/grafik apa yang paling cocok untuk data ini)

Jelaskan temuan dalam bahasa non-teknis yang bisa dipahami oleh stakeholder bisnis. JANGAN PERNAH MENGGUNAKAN EMOTE""",
    },
}


@router.get("/list")
def list_agents():
    """Return all available agents."""
    return {
        "agents": [
            {
                "id": agent_id,
                "name": agent["name"],
                "description": agent["description"],
            }
            for agent_id, agent in AGENTS.items()
        ]
    }


@router.post("/run")
async def run_agent(req: AgentRequest):
    """Run a specific agent on selected documents."""
    if req.agent not in AGENTS:
        raise HTTPException(status_code=400, detail=f"Unknown agent: {req.agent}. Available: {list(AGENTS.keys())}")
    
    agent = AGENTS[req.agent]
    chunks = get_chunks(req.document_ids)
    
    if not chunks:
        raise HTTPException(status_code=400, detail="No documents available. Upload some documents first.")
    
    # Build context from chunks (with document names for cross-reference)
    max_chars = 30000
    context_text = ""
    doc_names = set()
    
    for chunk in chunks:
        section_prefix = f"[Section: {chunk.get('section', '')}] " if chunk.get('section') else ""
        chunk_entry = f"--- Document: {chunk['document_name']} (Page {chunk.get('page', '?')}) ---\n{section_prefix}{chunk['content']}\n\n"
        
        if len(context_text) + len(chunk_entry) > max_chars:
            break
        context_text += chunk_entry
        doc_names.add(chunk["document_name"])
    
    # Build user message with optional query
    system_prompt = "Kamu adalah AI Expert Specialist. Ikuti instruksi tugas secara presisi."
    
    query_section = f"\n\n--- Pertanyaan/Fokus dari pengguna ---\n{req.query}" if req.query else ""
    
    user_message = f"""Berikut adalah dokumen/konteks yang perlu kamu proses:

{context_text}
{query_section}
--- Informasi tambahan ---
Jumlah dokumen yang dianalisis: {len(doc_names)}
Nama dokumen: {', '.join(doc_names)}

=======================================
PENTING - TUGAS UTAMA ANDA:
=======================================
{agent['system_prompt']}

INGAT: JANGAN sekadar membuat ringkasan biasa! Patuhi format dan instruksi spesifik pada TUGAS UTAMA di atas secara ketat."""

    return StreamingResponse(
        stream_llm_response(user_message, [], system_prompt),
        media_type="application/x-ndjson"
    )
