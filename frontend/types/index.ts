export interface SourceCitation {
  document_name: string;
  content_preview: string;
  similarity: number;
  chunk_index: number;
  page?: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: SourceCitation[];
  isLoading?: boolean;
  isStreaming?: boolean;
}

export interface Document {
  id: number;
  name: string;
  page_count?: number;
  chunk_count?: number;
  created_at: string;
  source_url?: string;
  content?: string;
  isUploading?: boolean;
}

export interface UploadResponse {
  message: string;
  document_id: number;
  document_name: string;
  chunks_created: number;
  page_count?: number;
}

export interface ChatResponse {
  answer: string;
  sources: SourceCitation[];
}

export interface ToastItem {
  id: string;
  message: string;
  type: "success" | "error" | "info";
}

// ── Notebook Architecture ───────────────────────────
export interface Notebook {
  id: string;
  title: string;
  emoji: string;
  documentIds: number[];
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

// Legacy - kept for backward compat
export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
}
