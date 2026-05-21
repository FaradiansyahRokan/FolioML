"use client";

import { useRef, useState, useCallback } from "react";
import { uploadDocument, uploadImage } from "@/services/api";
import { Document } from "@/types";
import WebSearchModal from "./WebSearchModal";
import { Plus, Globe, Loader2, FileUp, Image as ImageIcon } from "lucide-react";

interface Props {
  onUploadStart?: (tempId: number, name: string) => void;
  onUploadSuccess: (doc: Document, tempId?: number) => void;
  onUploadError?: (tempId: number) => void;
  onToast: (message: string, type: "success" | "error" | "info") => void;
  isNotebookLMStyle?: boolean;
}

const ACCEPTED = ".pdf,.txt,.docx,.md,.csv,image/*";

export default function UploadZone({ onUploadStart, onUploadSuccess, onUploadError, onToast, isNotebookLMStyle }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [showWebSearch, setShowWebSearch] = useState(false);

  const handleFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;
    
    fileArray.forEach(file => {
      const tempId = -Math.floor(Math.random() * 1000000);
      if (onUploadStart) onUploadStart(tempId, file.name);
      
      const uploadPromise = file.type.startsWith("image/") ? uploadImage(file) : uploadDocument(file);
      
      uploadPromise
        .then(result => {
          onUploadSuccess({ id: result.document_id, name: result.document_name, page_count: result.page_count, chunk_count: result.chunks_created, created_at: new Date().toISOString() }, tempId);
          onToast(`"${file.name}" added`, "success");
        })
        .catch(err => {
          if (onUploadError) onUploadError(tempId);
          onToast(err instanceof Error ? err.message : "Upload failed", "error");
        });
    });

    if (inputRef.current) inputRef.current.value = "";
  }, [onUploadStart, onUploadSuccess, onUploadError, onToast]);

  if (isNotebookLMStyle) {
    return (
      <div>
        <input ref={inputRef} type="file" accept={ACCEPTED} multiple onChange={(e) => e.target.files && handleFiles(e.target.files)} className="hidden" id="file-upload" />
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 border border-dashed border-zinc-300 rounded-2xl text-[13px] font-medium text-zinc-600 hover:bg-zinc-50 hover:border-zinc-400 transition-colors"
        >
          <FileUp className="w-4 h-4" />
          + Add sources
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
        className="flex items-center justify-center p-1.5 rounded-md text-zinc-500 hover:bg-white hover:text-zinc-900 hover:shadow-sm transition-all"
        title="Upload Local File"
      >
        <Plus className="w-4 h-4" />
      </button>

      <button 
        onClick={() => setShowWebSearch(true)} 
        className="flex items-center justify-center p-1.5 rounded-md text-zinc-500 hover:bg-white hover:text-zinc-900 hover:shadow-sm transition-all"
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
