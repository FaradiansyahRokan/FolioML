import json
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from typing import List, Optional
from pydantic import BaseModel
from rag.vector_store import get_chunks
from services.llm_service import stream_llm_response

router = APIRouter(prefix="/api/insights", tags=["Insights"])

class InsightRequest(BaseModel):
    type: str  # "study_guide", "podcast", "faq", "critique", "cross_reference"
    document_ids: Optional[List[int]] = None
    query: Optional[str] = None

    
PROMPTS = {
    "study_guide": """Buatlah sebuah Study Guide (Panduan Belajar) yang komprehensif berdasarkan dokumen berikut.
Gunakan format Markdown dengan struktur:
1. **Executive Summary**: Ringkasan singkat padat.
2. **Key Concepts**: Konsep-konsep utama yang dibahas beserta penjelasannya.
3. **Glossary**: Daftar istilah penting dan definisinya.
4. **Actionable Takeaways**: Hal-hal praktis yang bisa diterapkan.

Gunakan bahasa yang profesional namun mudah dipahami.""",

    "podcast": """Buatlah sebuah naskah Podcast (Audio Overview) yang interaktif dan menarik berdasarkan dokumen berikut.
Gunakan format percakapan antara 2 orang:
- **Host (Alex)**: Antusias, sering bertanya, dan memandu acara.
- **Expert (Dr. Sarah)**: Sangat paham dokumen, memberikan penjelasan dengan analogi yang mudah dimengerti.

Buat percakapannya mengalir, tidak kaku, dan sesekali bercanda. Fokus pada poin-poin paling menarik dari dokumen.""",

    "faq": """Buatlah daftar Frequently Asked Questions (FAQ) beserta jawabannya berdasarkan dokumen berikut.
Ekstrak 5-7 pertanyaan paling krusial yang mungkin ditanyakan orang setelah membaca dokumen ini.
Berikan jawaban yang detail, jelas, dan langsung menjawab pertanyaan.""",

    "critique": """Bertindaklah sebagai seorang analis kritis yang tajam. Evaluasi dokumen berikut dan buat laporan Critical Analysis:
1. **Strengths**: Kekuatan argumen atau data dalam dokumen.
2. **Weaknesses**: Kelemahan, celah logika, atau informasi yang kurang.
3. **Hidden Bias**: Potensi bias atau sudut pandang sepihak (jika ada).
4. **Unanswered Questions**: Pertanyaan penting yang gagal dijawab oleh dokumen ini.

Berikan analisis yang objektif, mendalam, dan tidak bias.""",

    "cross_reference": """Bertindaklah sebagai peneliti akademis. Tugasmu adalah membandingkan dan mencari benang merah dari dokumen-dokumen berikut.
Buatlah laporan Cross-Reference Synthesis:
1. **Common Themes**: Tema atau kesimpulan yang disetujui bersama oleh dokumen-dokumen tersebut.
2. **Contradictions / Differences**: Titik perdebatan, kontradiksi, atau perbedaan perspektif antar dokumen.
3. **Unique Insights**: Informasi unik yang hanya ada di satu dokumen tapi sangat penting.
4. **Overall Synthesis**: Kesimpulan akhir yang menggabungkan seluruh perspektif.

Gunakan format Markdown yang rapi dan sebutkan nama dokumen saat merujuk informasi tertentu. JANGAN PERNAH MENGGUNAKAN EMOTE""",

    "flashcards": """Buatlah Flashcards pembelajaran (Tanya-Jawab) dari dokumen berikut.
Ekstrak konsep-konsep kunci, fakta, dan definisi.
Gunakan format Markdown ini SECARA KETAT untuk setiap flashcard:

### Q: [Pertanyaan atau Konsep]
### A: [Jawaban atau Penjelasan detail]
---

Buat sebanyak mungkin flashcard yang relevan (minimal 10 jika dokumen cukup panjang). JANGAN gunakan format lain""",
    "graph": """Bertindaklah sebagai Knowledge Graph Extractor. Ekstrak entitas dan hubungan antar entitas dari teks berikut.
Gunakan format JSON murni TANPA markdown block. Array of nodes dan edges.
Format:
{
  "nodes": [{"id": "Entitas1", "label": "Entitas 1", "group": "Person/Concept/Org"}],
  "edges": [{"source": "Entitas1", "target": "Entitas2", "label": "Hubungan"}],
  "message": "Opsional pesan singkat"
}"""
}

from utils.auth import get_current_user
from fastapi import Depends

@router.post("/generate")
async def generate_insight(req: InsightRequest, user_id: str = Depends(get_current_user)):
    if req.type not in PROMPTS:
        raise HTTPException(status_code=400, detail="Invalid insight type")
        
    chunks = get_chunks(req.document_ids, user_id=user_id)
    if not chunks:
        raise HTTPException(status_code=400, detail="No documents available in the knowledge base.")
        
    # Ambil teks dari dokumen sampai batas tertentu (misal: 25.000 karakter ~ 6-8k token)
    # untuk memastikan tidak melebihi konteks LLM lokal (8k context window Llama 3)
    max_chars = 25000
    context_text = ""
    for chunk in chunks:
        if len(context_text) + len(chunk["content"]) > max_chars:
            break
        context_text += f"--- Document: {chunk['document_name']} ---\n{chunk['content']}\n\n"
        
    system_prompt = "Kamu adalah AI Knowledge Analyst profesional. Lakukan tugas sesuai permintaan secara tepat dan akurat."
    query_section = f"\n\n--- Instruksi Khusus Tambahan ---\n{req.query}" if req.query else ""
    user_message = f"""Berikut adalah dokumen/konteks yang perlu kamu analisis:

{context_text}
{query_section}
=======================================
PENTING - TUGAS UTAMA ANDA:
=======================================
{PROMPTS[req.type]}

INGAT: JANGAN sekadar membuat ringkasan biasa! Patuhi format dan instruksi spesifik pada TUGAS UTAMA di atas secara ketat."""
    return StreamingResponse(
        stream_llm_response(user_message, [], system_prompt),
        media_type="application/x-ndjson"
    )
