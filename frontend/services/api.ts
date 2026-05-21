import { ChatResponse, Document, UploadResponse, SourceCitation } from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

async function apiFetch(input: RequestInfo | URL, init?: RequestInit) {
  const customInit = { ...init };
  customInit.headers = {
    ...customInit.headers,
    "ngrok-skip-browser-warning": "true"
  };
  return fetch(input, customInit);
}

export async function uploadDocument(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await apiFetch(`${API_BASE}/upload`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Upload failed" }));
    throw new Error(error.detail || "Upload failed");
  }

  return res.json();
}

export async function uploadImage(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await apiFetch(`${API_BASE}/upload/image`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Image upload failed" }));
    throw new Error(error.detail || "Image upload failed");
  }

  return res.json();
}

export async function generateTTS(text: string): Promise<Blob> {
  const res = await apiFetch(`${API_BASE}/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error("Audio generation failed");
  return res.blob();
}

export async function sendChatMessage(
  question: string,
  history?: { role: string; content: string }[],
  useWebFallback: boolean = false
): Promise<ChatResponse> {
  const res = await apiFetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, top_k: 25, history, use_web_fallback: useWebFallback }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Chat request failed" }));
    throw new Error(error.detail || "Chat request failed");
  }

  return res.json();
}

export async function streamChatMessage(
  question: string,
  history: { role: string; content: string }[] | undefined,
  documentIds: number[] | undefined,
  useWebFallback: boolean,
  contextText: string | undefined,
  onToken: (token: string) => void,
  onSources: (sources: SourceCitation[]) => void,
  onDone: () => void,
  onError: (error: string) => void
): Promise<void> {
  const res = await apiFetch(`${API_BASE}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, top_k: 25, history, document_ids: documentIds?.length ? documentIds : undefined, use_web_fallback: useWebFallback, context_text: contextText }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Stream failed" }));
    throw new Error(error.detail || "Stream request failed");
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop()!;

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const data = JSON.parse(line);
        if (data.type === "token") {
          onToken(data.content);
        } else if (data.type === "sources") {
          onSources(data.sources || []);
        } else if (data.type === "error") {
          onError(data.message);
        } else if (data.type === "done") {
          onDone();
        }
      } catch {
        // skip malformed lines
      }
    }
  }

  // Process any remaining buffer
  if (buffer.trim()) {
    try {
      const data = JSON.parse(buffer);
      if (data.type === "done") onDone();
    } catch {
      // ignore
    }
  }
}

export async function listDocuments(): Promise<Document[]> {
  const res = await apiFetch(`${API_BASE}/documents`);
  if (!res.ok) throw new Error("Failed to fetch documents");
  const data = await res.json();
  return data.documents;
}

export async function getDocument(documentId: number): Promise<{ document: Document }> {
  const res = await apiFetch(`${API_BASE}/documents/${documentId}`);
  if (!res.ok) throw new Error("Failed to fetch document");
  return res.json();
}

export async function deleteDocument(documentId: number): Promise<void> {
  const res = await apiFetch(`${API_BASE}/documents/${documentId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete document");
}

export async function streamInsight(
  type: string,
  documentIds: number[] | undefined,
  query: string | undefined,
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (error: string) => void
): Promise<void> {
  const res = await apiFetch(`${API_BASE}/insights/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      type, 
      document_ids: documentIds?.length ? documentIds : undefined,
      query: query || undefined 
    }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Insight generation failed" }));
    throw new Error(error.detail || "Insight request failed");
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop()!;

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const data = JSON.parse(line);
        if (data.type === "token") {
          onToken(data.content);
        } else if (data.type === "error") {
          onError(data.message);
        } else if (data.type === "done") {
          onDone();
        }
      } catch {
        // skip malformed lines
      }
    }
  }

  if (buffer.trim()) {
    try {
      const data = JSON.parse(buffer);
      if (data.type === "done") onDone();
    } catch {
      // ignore
    }
  }
}

// ── URL Ingestion ──────────────────────────────────
export async function ingestUrl(url: string, title?: string, snippet?: string): Promise<UploadResponse> {
  const res = await apiFetch(`${API_BASE}/ingest/url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, title, snippet }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "URL ingestion failed" }));
    throw new Error(error.detail || "URL ingestion failed");
  }

  return res.json();
}

export interface WebSearchPreviewResult {
  title: string;
  url: string;
  snippet: string;
  source_domain: string;
}

export async function searchWebPreview(query: string): Promise<{ results: WebSearchPreviewResult[]; query: string }> {
  const res = await apiFetch(`${API_BASE}/search/preview?query=${encodeURIComponent(query)}`);
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Search failed" }));
    throw new Error(error.detail || "Search failed");
  }
  return res.json();
}

export async function ingestWebSearch(query: string): Promise<UploadResponse> {
  const res = await apiFetch(`${API_BASE}/ingest/web-search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Web search ingest failed" }));
    throw new Error(error.detail || "Web search ingest failed");
  }

  return res.json();
}

// ── Agent System ──────────────────────────────────
export interface AgentInfo {
  id: string;
  name: string;
  description: string;
}

export async function listAgents(): Promise<AgentInfo[]> {
  const res = await apiFetch(`${API_BASE}/agents/list`);
  if (!res.ok) throw new Error("Failed to fetch agents");
  const data = await res.json();
  return data.agents;
}

export async function streamAgent(
  agentId: string,
  documentIds: number[] | undefined,
  query: string | undefined,
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (error: string) => void
): Promise<void> {
  const res = await apiFetch(`${API_BASE}/agents/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agent: agentId,
      document_ids: documentIds?.length ? documentIds : undefined,
      query: query || undefined,
    }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Agent execution failed" }));
    throw new Error(error.detail || "Agent request failed");
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop()!;

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const data = JSON.parse(line);
        if (data.type === "token") {
          onToken(data.content);
        } else if (data.type === "error") {
          onError(data.message);
        } else if (data.type === "done") {
          onDone();
        }
      } catch {
        // skip malformed lines
      }
    }
  }

  if (buffer.trim()) {
    try {
      const data = JSON.parse(buffer);
      if (data.type === "done") onDone();
    } catch {
      // ignore
    }
  }
}

// ── Fast Research (Web Sources Only) ──────────────────────────────────
/**
 * Fast research from trusted web sources only (Wikipedia, News, Academic, etc).
 * No document search, just web research.
 */
export async function fastResearch(
  query: string,
  maxResults: number = 5
): Promise<ChatResponse> {
  const res = await apiFetch(`${API_BASE}/research`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, max_results: maxResults }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Research failed" }));
    throw new Error(error.detail || "Research failed");
  }

  return res.json();
}

/**
 * Streaming fast research from trusted web sources.
 */
export async function streamFastResearch(
  query: string,
  maxResults: number = 5,
  onToken: (token: string) => void,
  onSources: (sources: SourceCitation[]) => void,
  onDone: () => void,
  onError: (error: string) => void
): Promise<void> {
  const res = await apiFetch(`${API_BASE}/research/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, max_results: maxResults }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Research stream failed" }));
    throw new Error(error.detail || "Research request failed");
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop()!;

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const data = JSON.parse(line);
        if (data.type === "token") {
          onToken(data.content);
        } else if (data.type === "sources") {
          onSources(data.sources || []);
        } else if (data.type === "error") {
          onError(data.message);
        } else if (data.type === "done") {
          onDone();
        }
      } catch {
        // skip malformed lines
      }
    }
  }

  // Process any remaining buffer
  if (buffer.trim()) {
    try {
      const data = JSON.parse(buffer);
      if (data.type === "done") onDone();
    } catch {
      // ignore
    }
  }
}
