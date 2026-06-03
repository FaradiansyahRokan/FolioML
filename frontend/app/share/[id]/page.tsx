"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Document } from "@/types";
import { FileText, Loader2, Globe, Calendar } from "lucide-react";
import MarkdownRenderer from "@/components/MarkdownRenderer";

export default function SharedDocumentPage() {
  const params = useParams();
  const shareId = params?.id as string;
  
  const [doc, setDoc] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDoc() {
      try {
        const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
        const res = await fetch(`${API_BASE}/share/${shareId}`, {
          headers: { "ngrok-skip-browser-warning": "true" }
        });
        
        if (!res.ok) {
          throw new Error(res.status === 404 ? "Document not found or is no longer public." : "Failed to load document.");
        }
        
        const data = await res.json();
        setDoc(data.document);
      } catch (err: any) {
        setError(err.message || "An error occurred.");
      } finally {
        setLoading(false);
      }
    }
    
    if (shareId) fetchDoc();
  }, [shareId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex flex-col items-center justify-center p-4">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-4" />
        <p className="text-zinc-500 font-medium">Loading document...</p>
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-zinc-200 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-semibold text-zinc-900 mb-2">Unavailable</h1>
          <p className="text-zinc-500 mb-6">{error || "Document not found."}</p>
          <a href="/" className="inline-block bg-zinc-900 text-white font-medium px-6 py-2.5 rounded-full hover:bg-zinc-800 transition-colors">
            Go to Homepage
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-zinc-900 selection:bg-blue-100 font-sans">
      <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
        {/* Header */}
        <header className="mb-8 bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-zinc-200">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
              {doc.source_url ? <Globe className="w-6 h-6" /> : <FileText className="w-6 h-6" />}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl md:text-3xl font-bold text-zinc-900 tracking-tight leading-tight mb-2 break-words">
                {doc.name}
              </h1>
              
              <div className="flex flex-wrap items-center gap-4 text-[13px] font-medium text-zinc-500">
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-zinc-400" />
                  <span>{new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(doc.created_at || Date.now()))}</span>
                </div>
                {doc.source_url && (
                  <div className="flex items-center gap-1.5">
                    <Globe className="w-4 h-4 text-zinc-400" />
                    <a href={doc.source_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline truncate max-w-[200px]">
                      {doc.source_url}
                    </a>
                  </div>
                )}
                {doc.page_count && doc.page_count > 1 && (
                  <div className="flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-zinc-400" />
                    <span>{doc.page_count} pages</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="bg-white rounded-3xl shadow-sm border border-zinc-200 p-6 md:p-10 min-h-[500px]">
          {doc.content ? (
            <div className="prose prose-zinc max-w-none prose-headings:font-bold prose-a:text-blue-600 hover:prose-a:text-blue-700">
              <MarkdownRenderer content={doc.content} />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-zinc-400 py-20">
              <FileText className="w-12 h-12 mb-4 opacity-20" />
              <p>No content available to display.</p>
            </div>
          )}
        </main>
        
        {/* Footer */}
        <footer className="mt-12 text-center text-[13px] font-medium text-zinc-400">
          Shared via <a href="/" className="text-zinc-600 hover:text-zinc-900 transition-colors">FolioML</a> — AI-powered document intelligence.
        </footer>
      </div>
    </div>
  );
}
