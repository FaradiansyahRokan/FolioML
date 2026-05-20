"use client";

import { useRef, useState, useCallback } from "react";
import { uploadDocument } from "@/services/api";
import { Document } from "@/types";
import WebSearchModal from "./WebSearchModal";
import { Plus, Globe, Loader2, FileUp } from "lucide-react";

interface Props {
  onUploadSuccess: (doc: Document) => void;
  onToast: (message: string, type: "success" | "error" | "info") => void;
  isNotebookLMStyle?: boolean;
}

const ACCEPTED = ".pdf,.txt,.docx,.md,.csv";

export default function UploadZone({ onUploadSuccess, onToast, isNotebookLMStyle }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showWebSearch, setShowWebSearch] = useState(false);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;
    setUploading(true);
    for (const file of fileArray) {
      try {
        const result = await uploadDocument(file);
        onUploadSuccess({ id: result.document_id, name: result.document_name, page_count: result.page_count, chunk_count: result.chunks_created, created_at: new Date().toISOString() });
        onToast(`"${file.name}" added`, "success");
      } catch (err: unknown) { onToast(err instanceof Error ? err.message : "Upload failed", "error"); }
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  }, [onUploadSuccess, onToast]);

  if (isNotebookLMStyle) {
    return (
      <div>
        <input ref={inputRef} type="file" accept={ACCEPTED} multiple onChange={(e) => e.target.files && handleFiles(e.target.files)} className="hidden" id="file-upload" />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 border border-dashed border-zinc-300 rounded-2xl text-[13px] font-medium text-zinc-600 hover:bg-zinc-50 hover:border-zinc-400 transition-colors disabled:opacity-50"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
          {uploading ? "Uploading…" : "+ Add sources"}
        </button>
        <WebSearchModal
          isOpen={showWebSearch}
          onImportSuccess={(doc) => onUploadSuccess(doc)}
          onToast={onToast}
          onClose={() => setShowWebSearch(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input ref={inputRef} type="file" accept={ACCEPTED} multiple onChange={(e) => e.target.files && handleFiles(e.target.files)} className="hidden" id="file-upload" />
      
      <button 
        onClick={() => inputRef.current?.click()} 
        disabled={uploading}
        className="flex items-center justify-center p-1.5 rounded-md text-zinc-500 hover:bg-white hover:text-zinc-900 hover:shadow-sm transition-all disabled:opacity-50"
        title="Upload Local File"
      >
        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
      </button>

      <button 
        onClick={() => setShowWebSearch(true)} 
        disabled={uploading}
        className="flex items-center justify-center p-1.5 rounded-md text-zinc-500 hover:bg-white hover:text-zinc-900 hover:shadow-sm transition-all disabled:opacity-50"
        title="Web Search Import"
      >
        <Globe className="w-4 h-4" />
      </button>

      <WebSearchModal
        isOpen={showWebSearch}
        onImportSuccess={(doc) => onUploadSuccess(doc)}
        onToast={onToast}
        onClose={() => setShowWebSearch(false)}
      />
    </div>
  );
}
