"""
Agent System — Multi-Agent Architecture for FolioML.

Each agent is a specialized AI with its own persona and system prompt.
Complex agents (contradiction, researcher, fact_checker, summarizer)
run as multi-step sequential workflows, where the output of each step
is streamed live to the frontend before the next step begins.

Workflow pattern (mirrors the TypeScript SDK approach):
  1. Triage / pre-condition check (Python, no LLM tokens spent)
  2. Step A Agent  →  stream output
  3. Step B Agent  →  stream output (receives context from Step A)
  4. ...
  5. Final synthesiser (if needed)
"""
import json
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional, AsyncGenerator
from rag.vector_store import get_chunks
from services.llm_service import stream_llm_response

router = APIRouter(prefix="/api/agents", tags=["Agents"])


# ─────────────────────────────────────────────────────────────
# Request model
# ─────────────────────────────────────────────────────────────

class AgentRequest(BaseModel):
    agent: str
    document_ids: Optional[List[int]] = None
    query: Optional[str] = None


# ─────────────────────────────────────────────────────────────
# Agent registry — metadata only (workflows live below)
# ─────────────────────────────────────────────────────────────

AGENTS = {
    "summarizer": {
        "name": "📋 Summarizer",
        "description": "Multi-step compression: extract → distil → synthesise insights",
    },
    "fact_checker": {
        "name": "🔍 Fact Checker",
        "description": "Claim extraction → evidence scoring → bias detection → verdict",
    },
    "contradiction_detector": {
        "name": "⚔️ Contradiction Detector",
        "description": "Find conflicts, inconsistencies, and contradictions across documents",
    },
    "researcher": {
        "name": "🔬 Deep Researcher",
        "description": "Research planning → evidence gathering → synthesis → gap analysis",
    },
    "timeline_builder": {
        "name": "📅 Timeline Builder",
        "description": "Extract dates, events, and milestones into a chronological timeline",
    },
    "code_explainer": {
        "name": "💻 Code Explainer",
        "description": "Analyze code and explain architecture, patterns, and logic",
    },
    "meeting_extractor": {
        "name": "📝 Meeting Extractor",
        "description": "Extract action items, decisions, and key points from meeting notes",
    },
    "spreadsheet_analyst": {
        "name": "📊 Spreadsheet Analyst",
        "description": "Analyze tabular data, find trends, and generate insights",
    },
    "academic_writer": {
        "name": "🎓 Academic Writer",
        "description": "Writes a highly comprehensive academic paper with citations",
    },
    "slide_generator": {
        "name": "📽️ Slide Generator",
        "description": "Creates structured presentation slides from documents",
    },
}


# ─────────────────────────────────────────────────────────────
# Shared helpers
# ─────────────────────────────────────────────────────────────

def _step_header(step: str, label: str) -> str:
    """Yield a visible step separator to the frontend."""
    return json.dumps({"type": "token", "content": f"\n\n---\n\n{step} **{label}**\n\n"}) + "\n"


async def _run_agent_step(
    prompt: str,
    persona: str,
    model: Optional[str] = None,
) -> AsyncGenerator[str, None]:
    """Run a single agent step and stream tokens, skipping the trailing 'done' event."""
    async for line in stream_llm_response(prompt, [], persona, model):
        data = json.loads(line)
        if data.get("type") == "token":
            yield line


async def _collect(gen: AsyncGenerator[str, None]) -> str:
    """Drain a streaming generator and return the concatenated text."""
    parts = []
    async for line in gen:
        data = json.loads(line)
        if data.get("type") == "token":
            parts.append(data["content"])
    return "".join(parts)


def _build_context(chunks: List[dict], max_chars: int = 32000) -> tuple[str, list]:
    """Build a context string from chunks and return (context_text, doc_names)."""
    context_text = ""
    doc_names: List[str] = []
    seen_docs: set = set()
    for chunk in chunks:
        section_prefix = f"[Section: {chunk.get('section', '')}] " if chunk.get("section") else ""
        entry = (
            f"--- Document: {chunk['document_name']} (Page {chunk.get('page', '?')}) ---\n"
            f"{section_prefix}{chunk['content']}\n\n"
        )
        if len(context_text) + len(entry) > max_chars:
            break
        context_text += entry
        if chunk["document_name"] not in seen_docs:
            doc_names.append(chunk["document_name"])
            seen_docs.add(chunk["document_name"])
    return context_text, doc_names


# ─────────────────────────────────────────────────────────────
# WORKFLOW: Summarizer  (3 agents)
#   Agent 1 — Content Extractor  : pull raw facts & data
#   Agent 2 — Key Point Distiller: distil into sharp bullets
#   Agent 3 — Insight Synthesiser: produce insights + takeaway
# ─────────────────────────────────────────────────────────────

async def _workflow_summarizer(
    context_text: str, doc_names: List[str], query: Optional[str], model: Optional[str]
) -> AsyncGenerator[str, None]:

    focus = f"\n\nFokus pengguna: {query}" if query else ""

    # ── Agent 1: Content Extractor ────────────────────────────
    yield _step_header("📥", "Agent 1 / 3 — Content Extractor")
    prompt_extract = f"""Kamu adalah **Content Extractor Agent**.
Tugasmu: baca seluruh dokumen dan ekstrak SEMUA fakta, data, angka, dan pernyataan penting secara mentah — jangan parafrase, kutip langsung.

Dokumen:
{context_text}{focus}

Format output:
## 📄 Raw Facts & Data Extracted
Untuk setiap dokumen, buat daftar bullet poin berisi:
- Fakta/pernyataan penting (dengan referensi dokumen & halaman)
- Angka, statistik, atau data kunci
- Terminologi kunci yang digunakan"""

    raw_facts = []
    async for line in _run_agent_step(prompt_extract, "Kamu adalah Content Extractor Agent yang sangat teliti. Jangan mengarang, hanya kutip dari teks.", model):
        data = json.loads(line)
        if data.get("type") == "token":
            raw_facts.append(data["content"])
            yield line
    raw_facts_text = "".join(raw_facts)

    # ── Agent 2: Key Point Distiller ─────────────────────────
    yield _step_header("🎯", "Agent 2 / 3 — Key Point Distiller")
    prompt_distil = f"""Kamu adalah **Key Point Distiller Agent**.
Kamu menerima daftar fakta mentah dari dokumen, dan tugasmu adalah mendistilasi menjadi poin-poin kunci yang tajam dan bermakna.

Fakta mentah yang diekstrak:
{raw_facts_text}

Format output:
## 🎯 Key Points
(7-12 bullet poin yang paling penting, padat, dan actionable)

## 📊 Data & Angka Kritis
(Statistik dan angka yang paling relevan dengan konteks)

## 🧩 Tema Utama
(2-4 tema besar yang mendominasi dokumen)"""

    distilled = []
    async for line in _run_agent_step(prompt_distil, "Kamu adalah Key Point Distiller Agent. Buat poin yang tajam, tidak bertele-tele.", model):
        data = json.loads(line)
        if data.get("type") == "token":
            distilled.append(data["content"])
            yield line
    distilled_text = "".join(distilled)

    # ── Agent 3: Insight Synthesiser ─────────────────────────
    yield _step_header("💡", "Agent 3 / 3 — Insight Synthesiser")
    prompt_insight = f"""Kamu adalah **Insight Synthesiser Agent**.
Kamu menerima fakta mentah dan poin kunci dari dokumen. Tugasmu: hasilkan insight mendalam dan executive summary yang powerful.

Poin kunci yang sudah didistilasi:
{distilled_text}

Format output:
## 📋 Executive Summary
(3-5 kalimat padat yang menangkap esensi seluruh dokumen — tulis seperti briefing eksekutif)

## 💡 Deep Insights
(3-5 insight non-obvious yang bisa ditarik dari data — lebih dari sekadar ringkasan)

## ⚡ One-Line Takeaway
(Satu kalimat yang paling penting dari seluruh analisis)

## 🔮 Implikasi & Rekomendasi
(Apa yang harus diperhatikan atau dilakukan berdasarkan dokumen ini)"""

    async for line in _run_agent_step(prompt_insight, "Kamu adalah Insight Synthesiser Agent kelas dunia. Hasilkan insight yang tajam dan tidak klise.", model):
        yield line

    yield json.dumps({"type": "done"}) + "\n"


# ─────────────────────────────────────────────────────────────
# WORKFLOW: Fact Checker  (3 agents)
#   Agent 1 — Claim Extractor     : identify all verifiable claims
#   Agent 2 — Evidence Scorer     : score each claim's support
#   Agent 3 — Bias & Verdict      : detect framing bias + final verdict
# ─────────────────────────────────────────────────────────────

async def _workflow_fact_checker(
    context_text: str, doc_names: List[str], query: Optional[str], model: Optional[str]
) -> AsyncGenerator[str, None]:

    focus = f"\n\nFokus verifikasi pengguna: {query}" if query else ""

    # ── Agent 1: Claim Extractor ──────────────────────────────
    yield _step_header("🔎", "Agent 1 / 3 — Claim Extractor")
    prompt_extract = f"""Kamu adalah **Claim Extractor Agent**.
Tugasmu: identifikasi dan daftarkan SEMUA klaim yang bisa diverifikasi dalam dokumen.

Dokumen:
{context_text}{focus}

Format output:
## 📋 Daftar Klaim yang Diidentifikasi

Untuk setiap klaim, gunakan format:
**Klaim [N]:** [pernyataan klaim]
- **Sumber:** [dokumen & halaman]
- **Tipe:** Factual / Statistical / Causal / Normative
- **Verifiability:** High / Medium / Low (apakah bisa dicek dari dalam dokumen?)"""

    claims = []
    async for line in _run_agent_step(prompt_extract, "Kamu adalah Claim Extractor Agent yang sangat presisi. Identifikasi klaim secara exhaustif.", model):
        data = json.loads(line)
        if data.get("type") == "token":
            claims.append(data["content"])
            yield line
    claims_text = "".join(claims)

    # ── Agent 2: Evidence Scorer ──────────────────────────────
    yield _step_header("⚖️", "Agent 2 / 3 — Evidence Scorer")
    prompt_score = f"""Kamu adalah **Evidence Scorer Agent**.
Kamu menerima daftar klaim dari dokumen. Tugasmu: evaluasi setiap klaim berdasarkan bukti yang tersedia DI DALAM dokumen itu sendiri.

Klaim yang perlu dievaluasi:
{claims_text}

Dokumen asli untuk referensi:
{context_text}

Format output:
## ✅ Klaim Terverifikasi (Didukung Bukti Kuat)
(Klaim yang didukung data/fakta spesifik dalam dokumen)

## ⚠️ Klaim Lemah (Bukti Tidak Memadai)
(Klaim yang dibuat tapi tidak didukung data di dalam dokumen)

## ❌ Klaim Bermasalah (Tidak Konsisten / Kontradiktif)
(Klaim yang bertentangan dengan data lain di dokumen, atau menggunakan statistik secara cherry-pick)

## 🔢 Konsistensi Numerik
(Cek apakah angka dan statistik konsisten satu sama lain)"""

    scored = []
    async for line in _run_agent_step(prompt_score, "Kamu adalah Evidence Scorer Agent. Bersikap skeptis dan berbasis bukti.", model):
        data = json.loads(line)
        if data.get("type") == "token":
            scored.append(data["content"])
            yield line
    scored_text = "".join(scored)

    # ── Agent 3: Bias Detector & Final Verdict ────────────────
    yield _step_header("🧠", "Agent 3 / 3 — Bias Detector & Final Verdict")
    prompt_verdict = f"""Kamu adalah **Bias Detector & Verdict Agent**.
Kamu menerima hasil evaluasi klaim. Tugasmu: deteksi pola bias dan berikan verdict final keandalan dokumen.

Hasil evaluasi klaim:
{scored_text}

Format output:
## 🔍 Deteksi Pola Bias
- **Framing bias:** Apakah bahasa yang digunakan cenderung memihak satu sudut pandang?
- **Selection bias:** Apakah data dipilih secara cherry-pick?
- **Confirmation bias:** Apakah kesimpulan sudah ditentukan sebelum data dianalisis?
- **Omission bias:** Apakah ada informasi penting yang sengaja dihilangkan?

## 📊 Reliability Score per Dokumen
Untuk setiap dokumen: [Nama] — Score: X/10 — Alasan singkat

## 📝 Final Verdict
**Overall Reliability:** TINGGI / SEDANG / RENDAH
**Reasoning:** (3-5 kalimat mengapa)
**Rekomendasi:** (Apa yang harus diperhatikan pembaca saat menggunakan dokumen ini)"""

    async for line in _run_agent_step(prompt_verdict, "Kamu adalah Bias Detector Agent. Bersikap objektif, kritis, dan akademis.", model):
        yield line

    yield json.dumps({"type": "done"}) + "\n"


# ─────────────────────────────────────────────────────────────
# WORKFLOW: Contradiction Detector  (3 agents + triage)
#   Triage                         : doc count check (no LLM)
#   Agent 1 — Internal Auditor     : per-doc internal inconsistencies
#   Agent 2 — Cross-Doc Comparator : conflicts between documents
#   Agent 3 — Consensus & Reliability: agreements + trust matrix
#   [branch] Specific Claim Checker: if user provided a query
# ─────────────────────────────────────────────────────────────

async def _workflow_contradiction(
    context_text: str, doc_names: List[str], query: Optional[str], model: Optional[str]
) -> AsyncGenerator[str, None]:

    # ── Triage: require ≥ 2 documents ────────────────────────
    if len(doc_names) < 2:
        yield json.dumps({
            "type": "token",
            "content": (
                "⚠️ **Dokumen Tidak Mencukupi**\n\n"
                "Untuk menjalankan analisis deteksi kontradiksi, kamu harus memilih minimal "
                "**2 dokumen**.\n\n"
                "Gunakan panel dokumen di sebelah kiri untuk memilih dokumen yang ingin dibandingkan."
            )
        }) + "\n"
        yield json.dumps({"type": "done"}) + "\n"
        return

    doc_list = "\n".join(f"- {d}" for d in doc_names)

    # ── Branch: Specific claim query ─────────────────────────
    if query:
        yield _step_header("🕵️", f"Claim Checker — Memverifikasi klaim: \"{query}\"")
        prompt_claim = f"""Kamu adalah **Specific Claim Checker Agent**.
Pengguna ingin memverifikasi klaim atau pertanyaan spesifik berikut terhadap semua dokumen:

Klaim/Pertanyaan: "{query}"

Dokumen yang tersedia:
{context_text}

Analisis secara mendalam:
1. Apakah dokumen-dokumen mendukung, membantah, atau diam (silent) terhadap klaim ini?
2. Apakah ada kontradiksi antar dokumen terkait klaim ini?
3. Dokumen mana yang paling kredibel untuk menjawab klaim ini dan mengapa?

Format output:
## 🔍 Verifikasi Klaim: "{query}"

### Posisi Setiap Dokumen
Untuk setiap dokumen:
**[Nama Dokumen]**
- **Posisi:** Mendukung / Membantah / Silent
- **Evidence:** [kutipan langsung dari dokumen]
- **Kekuatan Bukti:** Strong / Moderate / Weak

### ⚔️ Kontradiksi Antar Dokumen (jika ada)
[Jelaskan konflik spesifik terkait klaim ini]

### ✅ Verdict Final
[Kesimpulan berdasarkan seluruh bukti: apakah klaim terbukti, terbantah, atau tidak bisa disimpulkan]"""

        async for line in _run_agent_step(prompt_claim, "Kamu adalah Specific Claim Checker Agent yang sangat objektif dan berbasis bukti.", model):
            yield line
        yield json.dumps({"type": "done"}) + "\n"
        return

    # ── Agent 1: Internal Auditor ─────────────────────────────
    yield _step_header("🔬", "Agent 1 / 3 — Internal Auditor (analisis per dokumen)")
    prompt_internal = f"""Kamu adalah **Internal Auditor Agent**.
Tugasmu: periksa setiap dokumen secara independen dan temukan inkonsistensi INTERNAL di dalam dokumen itu sendiri.

Dokumen yang akan diaudit:
{doc_list}

Konten dokumen:
{context_text}

Untuk setiap dokumen, cari:
- Kontradiksi internal (klaim yang bertentangan satu sama lain dalam dokumen yang sama)
- Kesalahan matematis atau kalkulasi yang tidak cocok
- Data vs narasi mismatch (angka di tabel berbeda dengan narasi)
- Statistik vs interpretasi mismatch (interpretasi yang tidak sesuai dengan data)
- Perubahan definisi atau terminologi yang tidak konsisten
- Metodologi yang bertentangan antar bagian

Format output:
## 🔬 Audit Internal per Dokumen

Untuk setiap dokumen:
### 📄 [Nama Dokumen]
**Temuan Internal:**
- Jenis: [Internal Contradiction / Numerical Error / Data-Narrative Mismatch / Statistical Inconsistency / Methodological Conflict]
- Severity: Critical / High / Medium / Low
- Evidence: "[kutipan bagian yang bermasalah]"
- Penjelasan: [mengapa ini merupakan inkonsistensi]

Jika tidak ada temuan, nyatakan dengan jelas: "✅ Tidak ditemukan inkonsistensi internal."""

    internal_findings = []
    async for line in _run_agent_step(prompt_internal, "Kamu adalah Internal Auditor Agent yang sangat teliti dan analitis. Temukan inkonsistensi tersembunyi.", model):
        data = json.loads(line)
        if data.get("type") == "token":
            internal_findings.append(data["content"])
            yield line
    internal_text = "".join(internal_findings)

    # ── Agent 2: Cross-Document Comparator ───────────────────
    yield _step_header("⚔️", "Agent 2 / 3 — Cross-Document Comparator (konflik antar dokumen)")
    prompt_cross = f"""Kamu adalah **Cross-Document Comparator Agent**.
Kamu menerima hasil audit internal, dan kini tugasmu adalah membandingkan klaim ANTAR dokumen.

Hasil audit internal:
{internal_text}

Konten lengkap semua dokumen:
{context_text}

Bandingkan setiap dokumen satu sama lain. Cari:
- Klaim faktual yang saling bertentangan
- Angka atau statistik yang berbeda untuk hal yang sama
- Kesimpulan yang berlawanan
- Metodologi yang saling bertentangan
- Perbedaan interpretasi atas data yang sama

Format output:
## ⚔️ Kontradiksi Antar Dokumen

Untuk setiap konflik:
---
**Konflik [N]**
- **Topik:** [deskripsi topik yang berkonflik]
- **Jenis:** Cross-Document Contradiction / Conflicting Statistics / Opposing Conclusions / Methodological Conflict
- **Severity:** Critical / High / Medium / Low
- **Dokumen A ([nama]):** "[kutipan pernyataan]"
- **Dokumen B ([nama]):** "[kutipan pernyataan yang bertentangan]"
- **Analisis:** [mana yang lebih kredibel dan mengapa]
---

Jika tidak ada konflik antar dokumen, nyatakan: "✅ Tidak ditemukan kontradiksi langsung antar dokumen.\""""

    cross_findings = []
    async for line in _run_agent_step(prompt_cross, "Kamu adalah Cross-Document Comparator Agent. Jadilah sangat spesifik dan berbasis bukti.", model):
        data = json.loads(line)
        if data.get("type") == "token":
            cross_findings.append(data["content"])
            yield line
    cross_text = "".join(cross_findings)

    # ── Agent 3: Consensus & Reliability Matrix ───────────────
    yield _step_header("🤝", "Agent 3 / 3 — Consensus & Reliability Matrix")
    prompt_consensus = f"""Kamu adalah **Consensus & Reliability Agent**.
Kamu menerima laporan konflik internal dan antar dokumen. Tugasmu: temukan konsensus dan buat reliability matrix final.

Laporan konflik internal:
{internal_text}

Laporan konflik antar dokumen:
{cross_text}

Format output:
## 🤝 Poin Konsensus
(Klaim-klaim yang disetujui dan konsisten di semua dokumen)
- [Poin konsensus dengan referensi dokumen]

## 🧩 Ambiguitas (Tidak Konflik, Tapi Tidak Jelas)
(Pernyataan yang bisa diinterpretasikan berbeda di masing-masing dokumen)

## 📊 Reliability Matrix

| Dokumen | Internal Consistency | Evidence Quality | Methodology | Overall Score |
|---------|---------------------|-----------------|-------------|---------------|
| [nama]  | X/10               | X/10            | X/10        | X/10          |

**Catatan:** [Penjelasan singkat per skor]

## 🏁 Kesimpulan Analisis
[3-5 kalimat ringkasan temuan paling penting dan rekomendasi untuk pembaca]"""

    async for line in _run_agent_step(prompt_consensus, "Kamu adalah Consensus & Reliability Agent. Bersikap adil, sistematis, dan berbasis data.", model):
        yield line

    yield json.dumps({"type": "done"}) + "\n"


# ─────────────────────────────────────────────────────────────
# WORKFLOW: Deep Researcher  (4 agents)
#   Agent 1 — Research Planner    : define scope & questions
#   Agent 2 — Evidence Gatherer   : extract evidence per question
#   Agent 3 — Cross Synthesiser   : synthesise cross-doc findings
#   Agent 4 — Gap & Report Writer : identify gaps + write report
# ─────────────────────────────────────────────────────────────

async def _workflow_researcher(
    context_text: str, doc_names: List[str], query: Optional[str], model: Optional[str]
) -> AsyncGenerator[str, None]:

    research_question = query or "Lakukan analisis mendalam dan komprehensif terhadap seluruh dokumen"

    # ── Agent 1: Research Planner ─────────────────────────────
    yield _step_header("📐", "Agent 1 / 4 — Research Planner")
    prompt_plan = f"""Kamu adalah **Research Planner Agent**.
Kamu akan memimpin sebuah riset mendalam. Pertama, rumuskan rencana riset yang terstruktur.

Pertanyaan/Tujuan Riset: {research_question}

Dokumen yang tersedia:
{chr(10).join(f"- {d}" for d in doc_names)}

Konten dokumen (preview):
{context_text[:4000]}...

Format output:
## 📐 Research Plan

### Research Question
[Rumuskan pertanyaan penelitian yang tajam dan spesifik]

### Research Scope
[Apa yang akan dan tidak akan dibahas]

### Sub-Questions to Investigate
1. [Sub-pertanyaan 1]
2. [Sub-pertanyaan 2]
3. [Sub-pertanyaan 3]
(dst.)

### Methodology
[Pendekatan analisis yang akan digunakan: tematik, komparatif, kronologis, dll.]

### Hipotesis Awal
[Hipotesis atau dugaan awal berdasarkan judul/konteks dokumen]"""

    plan = []
    async for line in _run_agent_step(prompt_plan, "Kamu adalah Research Planner Agent yang berpengalaman. Buat rencana riset yang tajam dan terstruktur.", model):
        data = json.loads(line)
        if data.get("type") == "token":
            plan.append(data["content"])
            yield line
    plan_text = "".join(plan)

    # ── Agent 2: Evidence Gatherer ────────────────────────────
    yield _step_header("🗂️", "Agent 2 / 4 — Evidence Gatherer")
    prompt_evidence = f"""Kamu adalah **Evidence Gatherer Agent**.
Kamu menerima rencana riset dan harus mengumpulkan bukti dari semua dokumen untuk menjawab setiap sub-pertanyaan.

Rencana riset:
{plan_text}

Konten lengkap dokumen:
{context_text}

Format output:
## 🗂️ Evidence per Sub-Question

Untuk setiap sub-pertanyaan dari rencana riset:
### Sub-Question [N]: [pertanyaan]
**Evidence dari [Nama Dokumen]:**
- "[kutipan langsung]" — Hal. X
- Kekuatan bukti: Strong / Moderate / Weak

**Synthesis mini:** [Apa yang bisa disimpulkan dari bukti ini saja]"""

    evidence = []
    async for line in _run_agent_step(prompt_evidence, "Kamu adalah Evidence Gatherer Agent. Kutip secara akurat dan jangan mengarang.", model):
        data = json.loads(line)
        if data.get("type") == "token":
            evidence.append(data["content"])
            yield line
    evidence_text = "".join(evidence)

    # ── Agent 3: Cross-Document Synthesiser ──────────────────
    yield _step_header("🔗", "Agent 3 / 4 — Cross-Document Synthesiser")
    prompt_synth = f"""Kamu adalah **Cross-Document Synthesiser Agent**.
Kamu menerima bukti dari berbagai dokumen. Tugasmu: sintesiskan temuan lintas dokumen.

Bukti yang dikumpulkan:
{evidence_text}

Format output:
## 🔗 Cross-Document Synthesis

### Pola yang Muncul
[Tema atau pola yang konsisten muncul di beberapa dokumen]

### Temuan yang Saling Mendukung
[Poin-poin yang diperkuat oleh beberapa sumber]

### Temuan yang Saling Bertentangan
[Poin-poin yang berbeda antar sumber, dengan analisis mana yang lebih kuat]

### Strength of Evidence Summary
| Temuan | Sumber | Kekuatan |
|--------|--------|----------|
| ...    | ...    | ...      |"""

    synth = []
    async for line in _run_agent_step(prompt_synth, "Kamu adalah Cross-Document Synthesiser Agent. Hubungkan temuan secara kritis dan koheren.", model):
        data = json.loads(line)
        if data.get("type") == "token":
            synth.append(data["content"])
            yield line
    synth_text = "".join(synth)

    # ── Agent 4: Gap Analyst & Report Writer ─────────────────
    yield _step_header("📝", "Agent 4 / 4 — Final Report Writer")
    prompt_report = f"""Kamu adalah **Research Report Writer Agent**.
Kamu menerima semua hasil riset. Tugasmu: tulis laporan riset final yang komprehensif.

Rencana riset:
{plan_text}

Sintesis lintas dokumen:
{synth_text}

Format output:
## 🔬 Research Report Final

### 1. Research Question & Scope
[Rumuskan ulang secara ringkas]

### 2. Key Findings
[5-10 temuan terpenting, diurutkan dari yang paling signifikan]
Untuk setiap finding:
- **Finding:** [deskripsi]
- **Evidence:** [referensi dokumen]
- **Significance:** Mengapa ini penting

### 3. Conclusions & Recommendations
[Kesimpulan berdasarkan seluruh analisis + rekomendasi actionable]

### 4. Knowledge Gaps
[Apa yang TIDAK dibahas tapi seharusnya penting untuk diteliti lebih lanjut]

### 5. Further Research Questions
[Pertanyaan baru yang muncul dari riset ini]"""

    async for line in _run_agent_step(prompt_report, "Kamu adalah Research Report Writer Agent kelas dunia. Tulis laporan yang tajam, akurat, dan berdampak.", model):
        yield line

    yield json.dumps({"type": "done"}) + "\n"


# ─────────────────────────────────────────────────────────────
# SINGLE-STEP AGENTS — with rich dedicated personas
# (timeline, code, meeting, spreadsheet, academic, slides)
# ─────────────────────────────────────────────────────────────

SINGLE_STEP_AGENTS = {
    "timeline_builder": {
        "persona": "Kamu adalah AI Timeline Archaeologist — spesialis mengekstrak dan menyusun peristiwa secara kronologis dari dokumen. Kamu tidak pernah melewatkan tanggal, periode, atau referensi temporal. Kamu menyajikan timeline dengan konteks dan signifikansi setiap event.",
        "prompt_template": """Tugas: bangun timeline lengkap dari dokumen berikut.

Dokumen:
{context_text}

{query_section}

Format output KETAT:
## 📅 Timeline Kronologis

Untuk setiap event:
### 🔹 [Tanggal / Periode]
**Event:** [Deskripsi kejadian]
**Konteks:** [Mengapa ini penting]
**Sumber:** [Dokumen & halaman]

---

Urutkan dari paling awal ke paling baru.
Jika tanggal tidak eksplisit, gunakan konteks temporal ("Q3 2023", "dua tahun lalu", dst.).

## 📊 Timeline Summary
- **Total events:** [N]
- **Rentang waktu:** [dari — sampai]
- **Event paling signifikan:** [event]
- **Tren yang terlihat:** [pola temporal]""",
    },

    "code_explainer": {
        "persona": "Kamu adalah AI Software Architect Senior dengan 15 tahun pengalaman. Kamu menganalisis kode dan sistem teknis dengan kedalaman seorang CTO, tapi menjelaskannya dengan kejelasan seorang tech writer terbaik. Kamu melihat arsitektur, pola desain, potensi masalah, dan peluang perbaikan.",
        "prompt_template": """Tugas: analisis arsitektur dan kode dari dokumen berikut.

Dokumen:
{context_text}

{query_section}

Format output:
## 💻 Code Architecture Analysis

### 🏗️ Architecture Overview
[Jelaskan arsitektur keseluruhan: monolith/microservice/serverless/etc — dengan deskripsi hubungan antar komponen]

### 🛠️ Tech Stack
| Layer | Technology | Versi | Tujuan |
|-------|-----------|-------|--------|
| ...   | ...       | ...   | ...    |

### 🧩 Key Components
Untuk setiap komponen:
- **Nama:** [nama]
- **Tanggung Jawab:** [apa yang dilakukan]
- **Dependencies:** [apa yang dibutuhkan]
- **Kompleksitas:** Low / Medium / High
- **Catatan:** [observasi penting]

### 🎨 Design Patterns
[Pattern yang digunakan: MVC, Repository, Observer, Factory, dll — dengan penjelasan implementasinya]

### ⚠️ Potential Issues & Tech Debt
[Anti-patterns, bottlenecks, atau risiko teknis yang teridentifikasi]

### 🚀 Improvement Suggestions
[Rekomendasi konkret untuk meningkatkan kualitas, performa, atau maintainability]""",
    },

    "meeting_extractor": {
        "persona": "Kamu adalah AI Meeting Intelligence Specialist — spesialis mengubah catatan rapat yang berantakan menjadi dokumen tindak lanjut yang terstruktur dan actionable. Kamu tidak melewatkan satu pun keputusan atau action item.",
        "prompt_template": """Tugas: ekstrak semua informasi penting dari catatan rapat berikut.

Dokumen:
{context_text}

{query_section}

Format output:
## 📝 Meeting Intelligence Report

### 👥 Participants
[Daftar peserta yang disebutkan]

### 📋 Agenda & Topics Discussed
[Topik-topik yang dibahas, diurutkan]

### ✅ Decisions Made
Untuk setiap keputusan:
- **Keputusan:** [deskripsi]
- **Alasan:** [konteks mengapa diputuskan]
- **Impact:** [dampak yang diharapkan]
- **Approved by:** [siapa yang menyetujui, jika disebutkan]

### 🎯 Action Items
| # | Task | PIC | Deadline | Priority | Status |
|---|------|-----|----------|----------|--------|
| 1 | ...  | ... | ...      | High/Med/Low | Open |

### ⚠️ Open Issues & Blockers
[Masalah yang belum terselesaikan]

### 💡 Key Insights & Subtext
[Insight penting, ketegangan, atau hal yang tidak dikatakan secara eksplisit tapi tersirat]

### 📅 Follow-up Schedule
[Kapan tindak lanjut dijadwalkan]""",
    },

    "spreadsheet_analyst": {
        "persona": "Kamu adalah AI Data Scientist dengan keahlian statistik dan business intelligence. Kamu menganalisis data tabular dengan presisi matematis dan menghasilkan insight yang langsung actionable untuk pengambil keputusan bisnis.",
        "prompt_template": """Tugas: analisis data tabular/spreadsheet dari dokumen berikut secara mendalam.

Dokumen:
{context_text}

{query_section}

Format output:
## 📊 Data Analysis Report

### Dataset Overview
- **Total Records:** [N]
- **Columns/Variables:** [daftar]
- **Time Period:** [jika relevan]
- **Data Quality Assessment:** [completeness, accuracy, consistency]

### Key Statistics
[Untuk kolom numerik: min, max, rata-rata, median, distribusi]

### Trends & Patterns
[Pola yang ditemukan dalam data — tren naik/turun, musiman, siklikal]

### Anomalies & Outliers
[Data yang tidak biasa atau mencurigakan — dengan nilai spesifik]

### Correlations & Relationships
[Hubungan antar variabel]

### Top 5 Business Insights
1. [Insight paling penting dengan implikasi bisnis]
2. [...]
3. [...]
4. [...]
5. [...]

### Recommendations
[Rekomendasi tindakan konkret berbasis data]

### Visualization Suggestions
[Chart/grafik yang paling cocok untuk data ini dan mengapa]""",
    },

    "academic_writer": {
        "persona": "Kamu adalah Profesor Riset Senior dengan track record publikasi di jurnal internasional tier-1. Kamu menulis karya ilmiah yang ketat secara metodologis, mendalam dalam analisis, dan bebas dari halusinasi. Setiap klaim HARUS didukung fakta dari dokumen sumber.",
        "prompt_template": """Tugas: tulis karya ilmiah akademik komprehensif berdasarkan dokumen berikut.

Dokumen sumber:
{context_text}

{query_section}

ATURAN KETAT:
- DILARANG mengarang fakta yang tidak ada di dokumen
- Gunakan format kutipan [1], [2] sesuai nomor dokumen
- Minimal 1500 kata
- Jangan potong penjelasan dengan "..."
- Gunakan bahasa akademis baku

Format output:
# [Judul Makalah yang Relevan dan Akademik]

**Abstrak**
[200-300 kata merangkum latar belakang, metode, temuan, dan implikasi]

## 1. Pendahuluan
[Latar belakang masalah, rumusan masalah, tujuan — sangat mendetail]

## 2. Tinjauan Pustaka
[Sintesis teori dari dokumen sumber — paragraf naratif yang menghubungkan antar dokumen, bukan sekadar list]

## 3. Metodologi
[Data dan sumber yang dianalisis, pendekatan yang digunakan]

## 4. Pembahasan dan Analisis
[BAGIAN TERPANJANG — analisis mendalam dengan kutipan [N] untuk setiap klaim]

## 5. Kesimpulan
[Ringkasan temuan dan implikasi teoritis/praktis]

## Daftar Pustaka
[Daftar semua dokumen sumber]""",
    },

    "slide_generator": {
        "persona": "Kamu adalah AI Presentation Strategist — spesialis mengubah dokumen kompleks menjadi slide presentasi yang compelling, terstruktur, dan mudah dipahami. Kamu tahu cara menyederhanakan tanpa kehilangan substansi.",
        "prompt_template": """Tugas: buat slide presentasi dari dokumen berikut.

Dokumen:
{context_text}

{query_section}

Format output KETAT (jangan tambahkan teks di luar format ini):

--- Slide 1 ---
Title: [Judul Presentasi Utama]
Subtitle: [Subjudul singkat]
Speaker Notes: [Apa yang harus dikatakan presenter]

--- Slide 2 ---
Title: [Latar Belakang]
Bullet points:
- [Poin 1]
- [Poin 2]
- [Poin 3]
Speaker Notes: [...]

[Lanjutkan 5-10 slide mencakup seluruh isi dokumen]

--- Slide Penutup ---
Title: [Kesimpulan / Call to Action]
Bullet points:
- [Key takeaway 1]
- [Key takeaway 2]
Speaker Notes: [Penutup yang kuat]""",
    },
}


# ─────────────────────────────────────────────────────────────
# Router endpoints
# ─────────────────────────────────────────────────────────────

@router.get("/list")
def list_agents():
    """Return all available agents with metadata."""
    return {
        "agents": [
            {"id": agent_id, "name": meta["name"], "description": meta["description"]}
            for agent_id, meta in AGENTS.items()
        ]
    }


@router.post("/run")
async def run_agent(req: AgentRequest):
    """
    Dispatch the request to the correct agent workflow.
    Multi-step agents stream step headers + content sequentially.
    Single-step agents stream their output directly.
    """
    if req.agent not in AGENTS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown agent: '{req.agent}'. Available: {list(AGENTS.keys())}"
        )

    chunks = get_chunks(req.document_ids)
    if not chunks:
        raise HTTPException(
            status_code=400,
            detail="No documents found. Please upload and select at least one document first."
        )

    context_text, doc_names = _build_context(chunks)

    # ── Multi-step workflow agents ────────────────────────────
    if req.agent == "summarizer":
        return StreamingResponse(
            _workflow_summarizer(context_text, doc_names, req.query, model=None),
            media_type="application/x-ndjson"
        )

    if req.agent == "fact_checker":
        return StreamingResponse(
            _workflow_fact_checker(context_text, doc_names, req.query, model=None),
            media_type="application/x-ndjson"
        )

    if req.agent == "contradiction_detector":
        return StreamingResponse(
            _workflow_contradiction(context_text, doc_names, req.query, model=None),
            media_type="application/x-ndjson"
        )

    if req.agent == "researcher":
        return StreamingResponse(
            _workflow_researcher(context_text, doc_names, req.query, model=None),
            media_type="application/x-ndjson"
        )

    # ── Single-step specialized agents ───────────────────────
    if req.agent in SINGLE_STEP_AGENTS:
        spec = SINGLE_STEP_AGENTS[req.agent]
        query_section = f"Fokus/Query dari pengguna: {req.query}" if req.query else ""
        prompt = spec["prompt_template"].format(
            context_text=context_text,
            query_section=query_section,
            doc_names=", ".join(doc_names),
        )
        return StreamingResponse(
            stream_llm_response(prompt, [], spec["persona"], model=None),
            media_type="application/x-ndjson"
        )

    # Fallback (should not reach here)
    raise HTTPException(status_code=500, detail=f"Agent '{req.agent}' has no workflow defined.")
