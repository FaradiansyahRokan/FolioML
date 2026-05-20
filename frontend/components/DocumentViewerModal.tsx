import { X, FileText, Globe } from "lucide-react";
import MarkdownRenderer from "./MarkdownRenderer";
import { Document } from "@/types";
import { useState, useEffect } from "react";
import { getDocument } from "@/services/api";

interface Props {
  isOpen: boolean;
  documentId: number | null;
  onClose: () => void;
  onToast: (msg: string, type: "success" | "error" | "info") => void;
}

export default function DocumentViewerModal({ isOpen, documentId, onClose, onToast }: Props) {
  const [doc, setDoc] = useState<Document | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && documentId) {
      setLoading(true);
      getDocument(documentId)
        .then(data => setDoc(data.document))
        .catch(err => {
          onToast("Gagal memuat dokumen", "error");
          onClose();
        })
        .finally(() => setLoading(false));
    } else {
      setDoc(null);
    }
  }, [isOpen, documentId, onClose, onToast]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-zinc-900/40 backdrop-blur-sm transition-all animate-in fade-in duration-200"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-zinc-200 animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 bg-zinc-50/50 flex-shrink-0">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-white border border-zinc-200 shadow-sm flex items-center justify-center">
              {doc?.source_url ? (
                <Globe className="w-4 h-4 text-blue-500" />
              ) : (
                <FileText className="w-4 h-4 text-zinc-600" />
              )}
            </div>
            <div className="overflow-hidden">
              <h2 className="text-sm font-semibold text-zinc-800 truncate" title={doc?.name || "Loading..."}>
                {loading ? "Memuat dokumen..." : doc?.name}
              </h2>
              {doc?.source_url && (
                <a 
                  href={doc.source_url} 
                  target="_blank" 
                  rel="noreferrer"
                  className="text-[11px] text-blue-600 hover:underline truncate block"
                  title={doc.source_url}
                >
                  {doc.source_url}
                </a>
              )}
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 rounded-xl text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-white">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-400">
              <div className="w-6 h-6 border-2 border-zinc-200 border-t-zinc-600 rounded-full animate-spin" />
              <p className="text-sm font-medium">Memuat isi dokumen...</p>
            </div>
          ) : doc ? (
            <div className="prose prose-sm prose-zinc max-w-none text-[14.5px] leading-relaxed">
              {doc.content ? (
                <MarkdownRenderer content={doc.content} isStreaming={false} />
              ) : (
                <p className="text-zinc-400 italic">Konten dokumen tidak tersedia.</p>
              )}
            </div>
          ) : null}
        </div>
        
      </div>
    </div>
  );
}
