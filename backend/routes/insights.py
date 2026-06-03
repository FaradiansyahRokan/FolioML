import json
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from typing import List, Optional
from pydantic import BaseModel
from rag.vector_store import get_chunks
from services.llm_service import stream_llm_response
from utils.auth import get_current_user

router = APIRouter(prefix="/api/insights", tags=["Insights"])


class InsightRequest(BaseModel):
    type: str
    document_ids: Optional[List[int]] = None
    query: Optional[str] = None


PROMPTS = {
    # ── Study Guide ───────────────────────────────────────────────
    "study_guide": """Kamu adalah AI Education Specialist kelas dunia yang ahli merancang materi belajar.
Tugasmu: buat Study Guide yang komprehensif, terstruktur, dan benar-benar membantu seseorang memahami topik ini dari nol hingga mahir.

Format output KETAT:

# 📚 Study Guide: [Judul Topik yang Relevan]

## 🎯 Learning Objectives
(3-5 hal konkret yang akan dikuasai pembaca setelah membaca guide ini)
- [ ] [Objective 1]
- [ ] [Objective 2]

## 📋 Executive Summary
(Ringkasan 4-6 kalimat yang sangat padat — seperti briefing eksekutif)

## 🧩 Key Concepts
Untuk setiap konsep utama:
### [Nama Konsep]
**Definisi:** [Penjelasan singkat dan presisi]
**Mengapa penting:** [Relevansi dalam konteks dokumen]
**Contoh/Analogi:** [Penjelasan intuitif]

## 📖 Deep Dive: Materi Inti
(Penjelasan mendalam per topik/bab, terstruktur secara logis)

## 📝 Glossary
| Istilah | Definisi |
|---------|----------|
| ...     | ...      |

## 🧠 Common Misconceptions
(Kesalahpahaman umum tentang topik ini yang perlu dihindari)

## ✅ Actionable Takeaways
(5-7 hal konkret yang bisa langsung dipraktikkan)

## 🔍 Self-Assessment Questions
(5 pertanyaan untuk menguji pemahaman pembaca)
1. [Pertanyaan...]

Gunakan bahasa yang sama dengan dokumen. Gunakan formatting Markdown secara maksimal.""",

    # ── Podcast ───────────────────────────────────────────────────
    "podcast": """Kamu adalah AI Podcast Script Writer berpengalaman yang ahli membuat konten audio yang engaging.
Buat naskah podcast yang terasa natural, informatif, dan menghibur berdasarkan dokumen ini.

Karakter:
- **Alex (Host)**: Jurnalis ingin tahu, sering bertanya "mengapa" dan "bagaimana", pandai memancing cerita menarik
- **Dr. Maya (Expert)**: Akademisi yang komunikatif, menggunakan analogi sehari-hari, sesekali berhumor

ATURAN:
- Tidak ada formalitas kaku — percakapan harus mengalir seperti ngobrol di kafe
- Gunakan transisi alami: "Oh menarik!", "Maksudnya...", "Jadi kalau dianalogikan..."
- Sesekali interupsi atau saling menimpali (realistis)
- Akhiri dengan insight yang bikin pendengar berpikir

Format output:

---
🎙️ **[JUDUL EPISODE]**
*Durasi estimasi: ~[X] menit*

---

**[INTRO MUSIC — fade in]**

**Alex:** [pembukaan yang engaging, langsung masuk ke hook yang bikin pendengar penasaran]

**Dr. Maya:** [...]

[lanjutkan percakapan alami selama 8-12 exchange]

---
**[OUTRO]**

**Alex:** [penutup + call to action yang berkesan]

---""",

    # ── FAQ ───────────────────────────────────────────────────────
    "faq": """Kamu adalah AI Content Strategist yang ahli membuat FAQ yang benar-benar menjawab apa yang orang ingin tahu.
Buat FAQ yang tajam, informatif, dan langsung menjawab pertanyaan — bukan FAQ generik.

Format output:

# ❓ FAQ: Pertanyaan Paling Penting

## Pertanyaan Dasar

### Q1: [Pertanyaan yang paling sering ditanyakan orang awam]
**A:** [Jawaban komprehensif 2-4 paragraf, gunakan bahasa yang jelas]

[...]

## Pertanyaan Mendalam

### Q[N]: [Pertanyaan teknis atau nuanced]
**A:** [Jawaban mendalam dengan nuansa dan konteks]

[...]

## Pertanyaan "Bagaimana Jika..."

### Q[N]: [Pertanyaan skenario/edge case]
**A:** [Jawaban yang mempertimbangkan berbagai kondisi]

---
> **💡 Tip:** [Satu insight yang paling berguna dari seluruh FAQ ini]

Buat 8-12 pertanyaan yang benar-benar krusial. Prioritaskan pertanyaan yang tidak obvious.""",

    # ── Critical Analysis ─────────────────────────────────────────
    "critique": """Kamu adalah AI Critical Analyst dengan keahlian evaluasi argumen dan deteksi bias seperti seorang editor senior jurnal akademik internasional.
Lakukan critical analysis yang jujur, mendalam, dan tidak berpihak.

Format output:

# 🔍 Critical Analysis Report

## 📊 Document Overview
- **Tipe dokumen:** [laporan/paper/artikel/dll]
- **Tujuan yang diklaim:** [apa yang diklaim dokumen ini lakukan]
- **Audiens yang dituju:** [siapa target pembacanya]

## ✅ Strengths (Kekuatan)
Untuk setiap kekuatan:
### [Nama Kekuatan]
- **Apa:** [deskripsi]
- **Mengapa kuat:** [alasan dengan bukti dari dokumen]
- **Impact:** [dampak positifnya]

## ⚠️ Weaknesses (Kelemahan)
Untuk setiap kelemahan:
### [Nama Kelemahan]
- **Apa:** [deskripsi masalah]
- **Bukti:** [kutipan atau referensi bagian dokumen]
- **Dampak:** [bagaimana ini melemahkan argumen]
- **Saran perbaikan:** [bagaimana seharusnya]

## 🎭 Bias & Framing Analysis
- **Framing bias:** [apakah isu disajikan dari sudut pandang tertentu?]
- **Selection bias:** [apakah data yang dipilih mendukung satu kesimpulan?]
- **Language bias:** [apakah kata-kata yang digunakan memihak?]
- **Omission:** [informasi penting apa yang tidak disebutkan?]

## ❓ Unanswered Questions
(Pertanyaan penting yang seharusnya dijawab tapi tidak dijawab dokumen ini)
1. [Pertanyaan]
2. [...]

## 🏆 Overall Assessment
- **Credibility Score:** X/10
- **Reasoning:** [3-5 kalimat justifikasi]
- **Recommended use:** [kapan dan bagaimana sebaiknya dokumen ini digunakan]""",

    # ── Cross Reference ───────────────────────────────────────────
    "cross_reference": """Kamu adalah AI Research Synthesiser dengan kemampuan membandingkan dan mensintesis informasi dari berbagai sumber seperti systematic reviewer jurnal akademik.
Buat laporan cross-reference synthesis yang komprehensif.

Format output:

# 🔗 Cross-Reference Synthesis Report

## 📚 Documents Analyzed
[Daftar dokumen yang dibandingkan]

## 🤝 Common Ground (Kesepakatan Bersama)
Poin-poin yang disetujui/didukung oleh semua atau sebagian besar dokumen:
- **[Tema]:** [Penjelasan + dokumen mana yang mendukung]

## ⚔️ Divergence Points (Titik Perbedaan)
### [Topik yang berbeda]
| Dokumen | Posisi/Klaim | Kekuatan Argumen |
|---------|-------------|-----------------|
| [nama] | [klaim]     | Strong/Moderate/Weak |

**Analisis:** [Mana yang lebih kredibel dan mengapa]

## 💎 Unique Insights
Informasi berharga yang hanya ada di satu dokumen:
- **[Dokumen X]:** [insight unik + mengapa penting]

## 🧬 Synthesis: The Bigger Picture
(Narasi 3-5 paragraf yang menyatukan semua perspektif menjadi satu pemahaman yang lebih lengkap)

## 📋 Practical Implications
(Kesimpulan actionable berdasarkan seluruh dokumen yang dianalisis)""",

    # ── Flashcards ────────────────────────────────────────────────
    "flashcards": """Kamu adalah AI Learning Designer yang ahli membuat flashcard untuk spaced repetition learning yang efektif.
Ekstrak konsep, fakta, definisi, dan hubungan penting dari dokumen.

ATURAN KETAT — gunakan HANYA format ini untuk setiap flashcard:

### Q: [Pertanyaan yang spesifik, tidak ambigu, dan menguji pemahaman mendalam]
### A: [Jawaban lengkap, akurat, dengan konteks secukupnya untuk memahami]
---

Panduan kualitas flashcard yang baik:
- Satu fakta/konsep per kartu (tidak boleh menggabungkan banyak hal)
- Pertanyaan harus spesifik (hindari "Apa itu X?" — lebih baik "Bagaimana X berbeda dari Y?")
- Jawaban harus cukup lengkap untuk dipahami tanpa membaca dokumen
- Prioritaskan: definisi kunci, hubungan sebab-akibat, angka/data penting, proses/metodologi

Buat minimal 15 flashcard jika dokumen cukup panjang. JANGAN gunakan format lain selain yang di atas.""",

    # ── Knowledge Graph ───────────────────────────────────────────
    "graph": """Kamu adalah Knowledge Graph AI Specialist. Tugasmu adalah mengekstrak entitas dan hubungan yang kaya dan bermakna dari dokumen untuk divisualisasikan sebagai knowledge graph interaktif.

ATURAN PALING PENTING:
- Output HANYA JSON murni, TIDAK ADA teks lain, TIDAK ADA markdown code block (```), TIDAK ADA komentar
- JSON harus valid dan bisa langsung di-parse
- Mulai output langsung dengan karakter "{"

Ekstrak dengan detail tinggi:

TIPE NODE (gunakan persis salah satu nilai ini di field "type"):
- "person" — individu, tokoh, peneliti, eksekutif
- "organization" — perusahaan, institusi, lembaga, negara
- "concept" — ide, teori, metodologi, framework
- "technology" — produk, sistem, tools, platform
- "event" — kejadian, milestone, timeline event
- "location" — tempat, wilayah, negara
- "metric" — angka, statistik, KPI, data
- "document" — laporan, makalah, regulasi, standar

TIPE EDGE (gunakan persis salah satu nilai ini di field "type"):
- "works_for" / "founded" / "leads"
- "uses" / "develops" / "produces"
- "causes" / "enables" / "prevents"
- "related_to" / "part_of" / "contradicts"
- "supports" / "opposes" / "references"
- "occurred_at" / "located_in"

Format JSON yang harus dihasilkan (PERSIS seperti ini):
{
  "nodes": [
    {
      "id": "unique_snake_case_id",
      "label": "Label yang Ditampilkan",
      "type": "person|organization|concept|technology|event|location|metric|document",
      "description": "Deskripsi singkat 1-2 kalimat tentang entitas ini",
      "importance": 1-10
    }
  ],
  "edges": [
    {
      "source": "id_node_asal",
      "target": "id_node_tujuan",
      "label": "Label hubungan yang singkat",
      "type": "relationship_type",
      "strength": "strong|moderate|weak"
    }
  ],
  "summary": "Narasi singkat 1-2 kalimat tentang struktur graph ini"
}

Target: ekstrak 10-25 node dan 15-35 edge yang paling penting dan bermakna dari dokumen. Prioritaskan koneksi yang memiliki makna semantik yang jelas."""
}


@router.post("/generate")
async def generate_insight(req: InsightRequest, user_id: str = Depends(get_current_user)):
    if req.type not in PROMPTS:
        raise HTTPException(status_code=400, detail=f"Invalid insight type: '{req.type}'. Available: {list(PROMPTS.keys())}")

    chunks = get_chunks(req.document_ids, user_id=user_id)
    if not chunks:
        raise HTTPException(status_code=400, detail="No documents available. Please upload and select documents first.")

    # Build rich context with document names and page info
    max_chars = 28000
    context_text = ""
    doc_names = set()
    for chunk in chunks:
        entry = f"--- Document: {chunk['document_name']} (Page {chunk.get('page', '?')}) ---\n{chunk['content']}\n\n"
        if len(context_text) + len(entry) > max_chars:
            break
        context_text += entry
        doc_names.add(chunk["document_name"])

    system_prompt = (
        "Kamu adalah AI Knowledge Analyst kelas dunia yang sangat presisi dan detail-oriented. "
        "Ikuti format dan instruksi secara KETAT. Hasilkan output berkualitas tinggi yang melampaui ekspektasi."
    )

    query_section = f"\n\n--- Instruksi/Fokus Tambahan dari Pengguna ---\n{req.query}" if req.query else ""
    doc_info = f"\nDokumen yang dianalisis ({len(doc_names)}): {', '.join(doc_names)}" if doc_names else ""

    user_message = f"""Berikut adalah dokumen yang perlu kamu analisis:{doc_info}

{context_text}
{query_section}
=======================================
TUGAS UTAMA — IKUTI SECARA PRESISI:
=======================================
{PROMPTS[req.type]}"""

    return StreamingResponse(
        stream_llm_response(user_message, [], system_prompt),
        media_type="application/x-ndjson"
    )
