import os
import json
from typing import List, Dict, AsyncGenerator
import httpx
from dotenv import load_dotenv

load_dotenv()

AI_PROVIDER = os.getenv("AI_PROVIDER", "ollama")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_CHAT_MODEL = os.getenv("OPENAI_CHAT_MODEL", "gpt-4o-mini")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_CHAT_MODEL = os.getenv("OLLAMA_CHAT_MODEL", "qwen2.5:7b-instruct-q4_K_M")

SYSTEM_PROMPT = """
Kamu adalah AI Document Assistant yang sangat cerdas, natural, komunikatif, dan membantu.

Tugas utama kamu adalah menjawab pertanyaan berdasarkan isi dokumen yang diberikan oleh sistem retrieval (RAG).

# TUJUAN UTAMA
Berikan jawaban yang:
- akurat
- jelas
- natural
- enak dibaca
- terasa seperti percakapan dengan AI premium modern
- tetap profesional dan informatif

Jawaban harus terasa hidup dan manusiawi, bukan seperti bot FAQ yang kaku.

---

# ATURAN PENTING

1. Gunakan HANYA informasi yang tersedia di dokumen.
2. Jangan mengarang informasi yang tidak disebutkan di dokumen.
3. Jangan menambahkan asumsi pribadi.
4. Jika informasi tidak tersedia, katakan dengan jujur dan natural:

"Saya tidak menemukan informasi tersebut di dokumen yang tersedia."

atau

"Dokumen yang diberikan belum menjelaskan hal tersebut secara spesifik."

5. Jangan berpura-pura tahu.

---

# GAYA MENJAWAB

- Gunakan bahasa yang natural dan conversational
- Tetap profesional dan rapih
- Hindari jawaban yang terlalu pendek dan dingin
- Hindari bahasa yang terlalu formal seperti robot hukum
- Jelaskan konteks jika diperlukan
- Buat jawaban mudah dipahami orang awam
- Jika ada istilah teknis, jelaskan secara sederhana
- Susun jawaban dengan struktur yang rapih
- Gunakan bullet points jika membantu keterbacaan

---

# PERILAKU YANG DIINGINKAN

Saat menjawab:
- pahami dulu inti pertanyaan user
- cari informasi paling relevan dari dokumen
- gabungkan informasi menjadi jawaban yang natural
- jangan sekadar copy-paste isi dokumen
- lakukan paraphrasing yang baik
- tetap setia pada fakta di dokumen

Jawaban harus terasa seperti:
- AI yang benar-benar memahami isi dokumen
- bukan sekadar search engine

---

# TONE

Tone harus:
- tenang
- cerdas
- membantu
- hangat
- percaya diri
- tidak berlebihan
- tidak terlalu santai
- tidak terlalu corporate

---

# FORMAT JAWABAN

Jika jawaban panjang:
- gunakan section
- gunakan bullet points
- gunakan spacing yang nyaman dibaca

Jika pertanyaan sederhana:
- jawab langsung dengan natural tanpa terlalu verbose

---

# KUTIPAN SUMBER (CITATIONS)
- Setiap kali Anda menggunakan informasi dari context, Anda WAJIB menambahkan kutipan sumber di akhir kalimat menggunakan format angka dalam kurung siku, contoh: [1], [2].
- Angka kutipan harus sesuai dengan nomor "Source [X]" dari konteks yang diberikan.
- Jangan sebutkan nama file secara manual (misal: "Menurut file.docx..."), cukup gunakan kutipan angka seperti gaya makalah akademik.

---

# BAHASA

Selalu jawab menggunakan bahasa yang sama dengan pertanyaan user.
Jika user bertanya dalam Bahasa Indonesia, jawab dalam Bahasa Indonesia.
Jika user bertanya dalam English, jawab dalam English.

"""


def build_rag_prompt(question: str, context_chunks: List[Dict]) -> str:
    """Build the user message combining context and question."""
    context_text_parts = []
    for i, chunk in enumerate(context_chunks):
        source_idx = i + 1
        page_info = chunk.get('page', '?')
        doc_name = chunk['document_name']
        context_text_parts.append(f"Source [{source_idx}] - {doc_name}, Hal. {page_info}:\n{chunk['content']}")
    
    context_text = "\n\n---\n\n".join(context_text_parts)

    return f"""Berikut adalah isi dari dokumen yang relevan:

{context_text}

---

Pertanyaan: {question}

Berikan jawaban yang lengkap, jelas, dan informatif berdasarkan dokumen di atas. Jelaskan dengan baik agar mudah dipahami:"""


def _build_messages(prompt: str, history: List[Dict] = None) -> List[Dict]:
    """Build message list with optional conversation history for context."""
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    if history:
        for msg in history[-10:]:  # Last 10 messages for context
            messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": prompt})
    return messages


async def generate_answer(question: str, context_chunks: List[Dict], history: List[Dict] = None) -> str:
    """Generate an answer using the configured LLM provider (non-streaming)."""
    prompt = build_rag_prompt(question, context_chunks)
    messages = _build_messages(prompt, history)

    if AI_PROVIDER == "openai":
        return await _openai_chat(messages)
    elif AI_PROVIDER == "ollama":
        return await _ollama_chat(messages)
    else:
        raise ValueError(f"Unknown AI_PROVIDER: {AI_PROVIDER}")


async def stream_answer(question: str, context_chunks: List[Dict], history: List[Dict] = None) -> AsyncGenerator[str, None]:
    """Stream an answer token by token. Yields NDJSON lines."""
    prompt = build_rag_prompt(question, context_chunks)
    messages = _build_messages(prompt, history)

    if AI_PROVIDER == "openai":
        async for token in _openai_stream(messages):
            yield token
    elif AI_PROVIDER == "ollama":
        async for token in _ollama_stream(messages):
            yield token
    else:
        raise ValueError(f"Unknown AI_PROVIDER: {AI_PROVIDER}")

async def stream_llm_response(prompt: str, history: List[Dict] = None, system_prompt: str = SYSTEM_PROMPT, model: str = None) -> AsyncGenerator[str, None]:
    """Stream an answer generically given a prompt, history, custom system prompt, and optional model."""
    messages = [{"role": "system", "content": system_prompt}]
    if history:
        for msg in history[-10:]:
            messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": prompt})

    if AI_PROVIDER == "openai":
        async for token in _openai_stream(messages, model):
            yield json.dumps({"type": "token", "content": token}) + "\n"
    elif AI_PROVIDER == "ollama":
        async for token in _ollama_stream(messages, model):
            yield json.dumps({"type": "token", "content": token}) + "\n"
    else:
        yield json.dumps({"type": "error", "message": f"Unknown AI_PROVIDER: {AI_PROVIDER}"}) + "\n"
    
    yield json.dumps({"type": "done"}) + "\n"


async def _openai_chat(messages: List[Dict]) -> str:
    """Call OpenAI Chat Completions API (non-streaming)."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": OPENAI_CHAT_MODEL,
                "messages": messages,
                "temperature": 0.3,
                "max_tokens": 8192,
            },
            timeout=60.0,
        )
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"]


async def _ollama_chat(messages: List[Dict]) -> str:
    """Call Ollama Chat API (non-streaming)."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{OLLAMA_BASE_URL}/api/chat",
            json={
                "model": OLLAMA_CHAT_MODEL,
                "messages": messages,
                "stream": False,
                "options": {
                    "temperature": 0.3,
                    "num_predict": 8192,
                },
            },
            timeout=120.0,
        )
        response.raise_for_status()
        data = response.json()
        return data["message"]["content"]


async def _openai_stream(messages: List[Dict], model: str = None) -> AsyncGenerator[str, None]:
    """Stream from OpenAI Chat Completions API."""
    actual_model = model if model else OPENAI_CHAT_MODEL
    async with httpx.AsyncClient() as client:
        async with client.stream(
            "POST",
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": actual_model,
                "messages": messages,
                "temperature": 0.3,
                "max_tokens": 8192,
                "stream": True,
            },
            timeout=120.0,
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if line.startswith("data: ") and line != "data: [DONE]":
                    try:
                        data = json.loads(line[6:])
                        delta = data["choices"][0].get("delta", {})
                        content = delta.get("content", "")
                        if content:
                            yield content
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue


async def _ollama_stream(messages: List[Dict], model: str = None) -> AsyncGenerator[str, None]:
    """Stream from Ollama Chat API."""
    actual_model = model if model else OLLAMA_CHAT_MODEL
    async with httpx.AsyncClient() as client:
        async with client.stream(
            "POST",
            f"{OLLAMA_BASE_URL}/api/chat",
            json={
                "model": actual_model,
                "messages": messages,
                "stream": True,
                "options": {
                    "temperature": 0.3,
                    "num_predict": 8192,
                },
            },
            timeout=120.0,
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line.strip():
                    continue
                try:
                    data = json.loads(line)
                    content = data.get("message", {}).get("content", "")
                    if content:
                        yield content
                except json.JSONDecodeError:
                    continue