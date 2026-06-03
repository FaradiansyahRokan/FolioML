"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSharedNotebook } from "@/services/api";
import { ChatMessage } from "@/types";
import MessageBubble from "@/components/MessageBubble";
import { Loader2, ArrowLeft, FileText, Globe } from "lucide-react";

export default function SharedNotebookPage() {
  const params = useParams();
  const router = useRouter();
  const shareId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notebook, setNotebook] = useState<any>(null);

  useEffect(() => {
    if (!shareId) return;
    getSharedNotebook(shareId)
      .then((data) => {
        setNotebook(data);
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [shareId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f4f9]">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (error || !notebook) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f0f4f9]">
        <div className="text-xl font-medium text-zinc-800 mb-2">Notebook not found</div>
        <p className="text-zinc-500 mb-6">{error || "This link might have expired or is invalid."}</p>
        <button 
          onClick={() => router.push("/")}
          className="px-6 py-2.5 bg-black text-white rounded-full font-medium hover:bg-zinc-800 transition-colors"
        >
          Go to Homepage
        </button>
      </div>
    );
  }

  const { title, data, created_at } = notebook;
  const { messages, documents, emoji } = data;

  return (
    <div className="flex flex-col h-screen bg-[#f0f4f9] font-sans selection:bg-blue-100">
      <header className="h-[60px] flex-shrink-0 flex items-center justify-between px-5 bg-white border-b border-zinc-200/50">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="text-2xl">{emoji || "📔"}</div>
            <div>
              <span className="text-[17px] font-medium text-zinc-800 block leading-tight">{title}</span>
              <span className="text-[12px] text-zinc-500">Shared Snapshot • {new Date(created_at).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/")} className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-full text-[13px] font-medium hover:bg-zinc-800 transition-colors">
            Try FolioML
          </button>
        </div>
      </header>

      <div className="flex-1 flex gap-3 p-3 overflow-hidden">
        {/* Left column: Sources snapshot */}
        <div className="w-[300px] flex-shrink-0 bg-white rounded-3xl flex flex-col shadow-sm border border-zinc-200/50 overflow-hidden">
          <div className="p-4 border-b border-zinc-100">
            <span className="text-[15px] font-medium text-zinc-800">Sources in this Notebook</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {documents && documents.map((doc: any, i: number) => (
              <div key={i} className="group relative flex items-center gap-3 p-2.5 rounded-xl border border-zinc-200 bg-white shadow-sm hover:border-blue-200 hover:shadow-md transition-all">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex-shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-zinc-800 truncate">{doc.name}</div>
                  <div className="text-[11px] text-zinc-500 font-medium tracking-wide">{doc.type || "DOC"}</div>
                </div>
              </div>
            ))}
            {(!documents || documents.length === 0) && (
              <div className="text-[13px] text-zinc-500 text-center py-4">No sources were selected.</div>
            )}
          </div>
        </div>

        {/* Right column: Chat messages */}
        <div className="flex-1 bg-white rounded-3xl shadow-sm border border-zinc-200/50 flex flex-col overflow-hidden relative">
          <div className="flex-1 overflow-y-auto p-6 md:p-10">
            <div className="max-w-3xl mx-auto">
              {messages && messages.map((msg: ChatMessage) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              {(!messages || messages.length === 0) && (
                <div className="text-center text-zinc-400 py-10">
                  <div className="text-[15px]">No chat history in this snapshot.</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
