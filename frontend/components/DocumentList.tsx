"use client";

import { Document } from "@/types";
import { deleteDocument } from "@/services/api";
import { useState } from "react";
import { FileText, FileSpreadsheet, File, Loader2, X, Search, ChevronDown, Globe, Share2, Trash2 } from "lucide-react";

interface Props {
  documents: Document[];
  selectedDocs: Set<number>;
  onToggleSelect: (id: number) => void;
  onDelete: (id: number) => void;
  onView: (doc: Document) => void;
  onShare?: (id: number, name: string) => void;
  onToast: (message: string, type: "success" | "error" | "info") => void;
  isNotebookLMStyle?: boolean;
}

function WebFavicon({ url }: { url: string }) {
  const [error, setError] = useState(false);
  try {
    const domain = new URL(url).hostname;
    if (error) return <Globe className="w-4 h-4 text-blue-500" />;
    return (
      <img 
        src={`https://www.google.com/s2/favicons?sz=32&domain=${domain}`} 
        alt={domain}
        className="w-4 h-4 rounded-sm object-contain"
        onError={() => setError(true)}
      />
    );
  } catch {
    return <Globe className="w-4 h-4 text-blue-500" />;
  }
}

function getFileIcon(doc: Document) {
  if (doc.source_url) {
    return <WebFavicon url={doc.source_url} />;
  }

  const name = doc.name;
  const lowercaseName = name.toLowerCase();
  const hasDot = name.includes(".");
  const ext = hasDot ? name.split(".").pop()?.toLowerCase() : "";
  const commonExts = ["pdf", "doc", "docx", "txt", "csv", "xlsx", "xls", "md", "json", "html", "htm"];
  
  const isWeb = lowercaseName.startsWith("http://") || 
                lowercaseName.startsWith("https://") || 
                !hasDot || 
                (ext && !commonExts.includes(ext));

  if (isWeb) {
    if (lowercaseName.startsWith("http://") || lowercaseName.startsWith("https://")) {
      return <WebFavicon url={lowercaseName} />;
    }
    return <Globe className="w-4 h-4 text-blue-500" />;
  }

  if (ext === "pdf") {
    return <FileText className="w-4 h-4 text-red-500" />;
  }
  if (ext === "docx" || ext === "doc") {
    return <FileText className="w-4 h-4 text-blue-600" />;
  }
  if (ext === "csv" || ext === "xlsx" || ext === "xls") {
    return <FileSpreadsheet className="w-4 h-4 text-emerald-600" />;
  }
  if (ext === "md") {
    return <FileText className="w-4 h-4 text-indigo-500" />;
  }
  if (ext === "txt") {
    return <FileText className="w-4 h-4 text-zinc-500" />;
  }

  return <File className="w-4 h-4 text-zinc-400" />;
}

function getFileExt(name: string) {
  return name.split(".").pop()?.toUpperCase() || "DOC";
}

export default function DocumentList({ documents, selectedDocs, onToggleSelect, onDelete, onView, onShare, onToast, isNotebookLMStyle }: Props) {
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const filteredDocs = documents.filter(doc => doc.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const allSelected = filteredDocs.length > 0 && filteredDocs.every(d => selectedDocs.has(d.id));

  async function handleDelete(id: number, name: string) {
    setDeletingId(id);
    try {
      await deleteDocument(id);
      onDelete(id);
      onToast(`"${name}" removed`, "info");
    } catch {
      onToast("Failed to delete document", "error");
    } finally {
      setDeletingId(null);
    }
  }

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center px-4">
        <div className="w-10 h-10 bg-zinc-100 rounded-xl flex items-center justify-center mb-3 border border-zinc-200">
          <FileText className="w-5 h-5 text-zinc-400" />
        </div>
        <p className="text-xs font-semibold text-zinc-600">No documents yet</p>
        <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">Use the + button above to add PDF, TXT, DOCX or CSV files</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {/* List */}
      <ul className="flex flex-col">
        {filteredDocs.map((doc) => {
          if (doc.isUploading) {
            return (
              <li
                key={doc.id}
                className="group relative flex items-center justify-between gap-3 px-3 py-2.5 bg-zinc-50/50 cursor-default"
              >
                <div className="flex items-center gap-3 overflow-hidden opacity-60">
                  <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-zinc-100 border border-zinc-200/60 flex items-center justify-center">
                    <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" />
                  </div>
                  <span className="text-[13px] font-normal text-zinc-500 truncate italic">
                    {doc.name}
                  </span>
                </div>
                <div className="flex items-center text-[11px] text-zinc-400 font-medium">
                  Uploading...
                </div>
              </li>
            );
          }

          const isSelected = selectedDocs.has(doc.id);
          return (
            <li
              key={doc.id}
              onClick={() => onView(doc)}
              className="group relative flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-zinc-50 cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-zinc-50 border border-zinc-200/60 flex items-center justify-center shadow-sm">
                  {getFileIcon(doc)}
                </div>
                <span className="text-[13px] font-normal text-zinc-700 truncate">
                  {doc.name}
                </span>
              </div>
              
              <div className="flex items-center gap-2 flex-shrink-0">
                {onShare && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onShare(doc.id, doc.name); }}
                    className="p-1.5 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                    title="Share Document"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(doc.id, doc.name); }}
                  disabled={deletingId === doc.id}
                  className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                  title="Delete Document"
                >
                  {deletingId === doc.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
                <div 
                  onClick={(e) => { e.stopPropagation(); onToggleSelect(doc.id); }}
                  className={`w-4 h-4 rounded-sm flex items-center justify-center transition-colors border cursor-pointer ${
                  isSelected ? "bg-zinc-200 border-zinc-200" : "border-transparent group-hover:border-zinc-300 hover:border-zinc-400"
                }`}>
                  {isSelected && <svg className="w-3 h-3 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
