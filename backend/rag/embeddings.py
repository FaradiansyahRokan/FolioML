import os
from typing import List
import httpx
from dotenv import load_dotenv

load_dotenv()

AI_PROVIDER = os.getenv("AI_PROVIDER", "openai")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_EMBEDDING_MODEL = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_EMBEDDING_MODEL = os.getenv("OLLAMA_EMBEDDING_MODEL", "nomic-embed-text")

EMBEDDING_DIM = 1536


async def get_embedding(text: str) -> List[float]:
    """Generate embedding for a single text string."""
    if AI_PROVIDER == "openai":
        return await _openai_embedding(text)
    elif AI_PROVIDER == "ollama":
        return await _ollama_embedding(text)
    else:
        raise ValueError(f"Unknown AI_PROVIDER: {AI_PROVIDER}")


async def get_embeddings_batch(texts: List[str]) -> List[List[float]]:
    """Generate embeddings for a list of texts. Skips failed chunks with a zero vector."""
    embeddings = []
    for i, text in enumerate(texts):
        if not text or not text.strip():
            embeddings.append([0.0] * EMBEDDING_DIM)
            continue
        try:
            emb = await get_embedding(text)
            embeddings.append(emb)
        except Exception as e:
            print(f"[EMBEDDING] Warning: chunk {i} failed to embed ({type(e).__name__}: {e}). Using zero vector.")
            embeddings.append([0.0] * EMBEDDING_DIM)
    return embeddings


async def _openai_embedding(text: str) -> List[float]:
    """Call OpenAI Embeddings API."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.openai.com/v1/embeddings",
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json={"input": text, "model": OPENAI_EMBEDDING_MODEL},
            timeout=30.0,
        )
        response.raise_for_status()
        data = response.json()
        return data["data"][0]["embedding"]


async def _ollama_embedding(text: str) -> List[float]:
    """
    Call Ollama Embeddings API.

    Ollama has two endpoints depending on version:
      - Older : POST /api/embeddings  → body: {model, prompt}   → response: {embedding: [...]}
      - Newer : POST /api/embed       → body: {model, input}    → response: {embeddings: [[...]]}

    We try the older endpoint first (wider compatibility), then fall back to the newer one.
    """
    async with httpx.AsyncClient() as client:

        # ── Try old endpoint first (/api/embeddings) ──────────────────────
        try:
            response = await client.post(
                f"{OLLAMA_BASE_URL}/api/embeddings",
                json={"model": OLLAMA_EMBEDDING_MODEL, "prompt": text},
                timeout=60.0,
            )
            response.raise_for_status()
            data = response.json()
            emb = data.get("embedding")

            # If old endpoint returned a valid list → use it
            if emb and isinstance(emb, list) and len(emb) > 0:
                return _pad(emb)

        except (httpx.HTTPStatusError, httpx.RequestError):
            pass  # fall through to new endpoint

        # ── Fall back to new endpoint (/api/embed) ─────────────────────────
        response = await client.post(
            f"{OLLAMA_BASE_URL}/api/embed",
            json={"model": OLLAMA_EMBEDDING_MODEL, "input": text},
            timeout=60.0,
        )
        response.raise_for_status()
        data = response.json()

        # New endpoint returns { "embeddings": [[...]] }
        embeddings_list = data.get("embeddings")
        if not embeddings_list or not isinstance(embeddings_list, list):
            raise ValueError(
                f"Unexpected Ollama /api/embed response format: {data}"
            )

        emb = embeddings_list[0]
        if not emb or not isinstance(emb, list):
            raise ValueError(
                f"Ollama embedding vector is empty or invalid: {emb}"
            )

        return _pad(emb)


def _pad(emb: List[float]) -> List[float]:
    """Pad or truncate embedding to EMBEDDING_DIM."""
    if len(emb) < EMBEDDING_DIM:
        return emb + [0.0] * (EMBEDDING_DIM - len(emb))
    elif len(emb) > EMBEDDING_DIM:
        return emb[:EMBEDDING_DIM]
    return emb