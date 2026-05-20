"use client";

import { useState } from "react";
import MarkdownRenderer from "./MarkdownRenderer";
import { streamInsight, streamAgent, ingestUrl } from "@/services/api";
import {
  BookOpen, Mic, HelpCircle, FileText, LayoutTemplate, AlertCircle,
  Map, Lightbulb, PieChart, Users, Code2, Globe, FileVideo, ShieldAlert, FlaskConical, ChevronRight, Download, Copy, Loader2, ArrowLeft
} from "lucide-react";

interface Props {
  hasDocuments: boolean;
  selectedDocs: number[];
  onToast: (message: string, type?: "success" | "error" | "info") => void;
  onDocumentAdded?: (doc: any) => void;
  isNotebookLMStyle?: boolean;
}

const INSIGHT_TYPES = [
  { id: "study_guide", icon: <LayoutTemplate className="w-4 h-4" />, title: "Study Guide", color: "text-amber-700 bg-[#fef7e0]" },
  { id: "podcast", icon: <Mic className="w-4 h-4" />, title: "Audio Overview", color: "text-indigo-600 bg-[#e8eaf6]" },
  { id: "faq", icon: <Lightbulb className="w-4 h-4" />, title: "FAQ Generator", color: "text-orange-700 bg-[#fbe9e7]" },
  { id: "critique", icon: <HelpCircle className="w-4 h-4" />, title: "Critical Analysis", color: "text-cyan-700 bg-[#e0f7fa]" },
  { id: "cross_reference", icon: <Map className="w-4 h-4" />, title: "Cross Reference", color: "text-pink-600 bg-[#fce4ec]" },
];

const AGENT_TYPES = [
  { id: "summarizer", icon: <FileText className="w-4 h-4" />, title: "Summarizer", color: "text-blue-700 bg-[#e3f2fd]" },
  { id: "fact_checker", icon: <ShieldAlert className="w-4 h-4" />, title: "Fact Checker", color: "text-red-700 bg-[#ffebee]" },
  { id: "timeline_builder", icon: <FileVideo className="w-4 h-4" />, title: "Timeline", color: "text-emerald-700 bg-[#e6f4ea]" },
  { id: "contradiction_detector", icon: <AlertCircle className="w-4 h-4" />, title: "Contradiction", color: "text-orange-600 bg-[#fff3e0]" },
  { id: "researcher", icon: <FlaskConical className="w-4 h-4" />, title: "Deep Research", color: "text-violet-700 bg-[#ede7f6]" },
  { id: "code_explainer", icon: <Code2 className="w-4 h-4" />, title: "Code Explainer", color: "text-zinc-700 bg-[#f5f5f5]" },
  { id: "meeting_extractor", icon: <Users className="w-4 h-4" />, title: "Meeting Notes", color: "text-teal-700 bg-[#e0f2f1]" },
  { id: "spreadsheet_analyst", icon: <PieChart className="w-4 h-4" />, title: "Data Analyst", color: "text-purple-700 bg-[#f3e5f5]" },
];

export default function NotebookView({ hasDocuments, selectedDocs, onToast, onDocumentAdded, isNotebookLMStyle }: Props) {
  const [activeTab, setActiveTab] = useState<"insights" | "agents" | "url">("insights");
  const [activeInsight, setActiveInsight] = useState<string | null>(null);
  const [insightContent, setInsightContent] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [isIngesting, setIsIngesting] = useState(false);

  const allTools = [...INSIGHT_TYPES, ...AGENT_TYPES];
  const activeTool = allTools.find(t => t.id === activeInsight);

  const handleGenerate = async (typeId: string, isAgent: boolean = false) => {
    if (!hasDocuments) { onToast("Upload documents first.", "error"); return; }
    setActiveInsight(typeId); setInsightContent(""); setIsGenerating(true);
    try {
      if (isAgent) {
        await streamAgent(typeId, selectedDocs, undefined,
          (t) => setInsightContent((p) => p + t),
          () => setIsGenerating(false),
          (e) => { onToast(`Error: ${e}`, "error"); setIsGenerating(false); });
      } else {
        await streamInsight(typeId, selectedDocs,
          (t) => setInsightContent((p) => p + t),
          () => setIsGenerating(false),
          (e) => { onToast(`Error: ${e}`, "error"); setIsGenerating(false); });
      }
    } catch (err: any) { onToast(err.message || "Failed", "error"); setIsGenerating(false); }
  };

  const handleUrlIngest = async () => {
    if (!urlInput.trim()) return;
    setIsIngesting(true);
    try {
      const r = await ingestUrl(urlInput.trim());
      onToast(`"${r.document_name}" ingested (${r.chunks_created} chunks)`, "success");
      if (onDocumentAdded) onDocumentAdded({ id: r.document_id, name: r.document_name, page_count: r.page_count, chunk_count: r.chunks_created, created_at: new Date().toISOString() });
      setUrlInput("");
    } catch (err: any) { onToast(err.message || "Failed", "error"); } finally { setIsIngesting(false); }
  };

  const handleCopyResult = () => { navigator.clipboard.writeText(insightContent); onToast("Copied!", "success"); };
  const handleDownload = () => {
    const b = new Blob([insightContent], { type: "text/markdown" });
    const u = URL.createObjectURL(b);
    const a = document.createElement("a"); a.href = u;
    a.download = `${activeTool?.title.toLowerCase().replace(/\s+/g, "_") || "result"}_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(u);
    onToast("Downloaded!", "success");
  };

  if (activeInsight || insightContent) {
    return (
      <div className="flex flex-col h-full animate-fade-in">
        <div className="flex items-center gap-3 mb-4">
          <button 
            onClick={() => { setActiveInsight(null); setInsightContent(""); }}
            className="w-8 h-8 rounded-full hover:bg-zinc-100 flex items-center justify-center text-zinc-500"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${activeTool?.color}`}>
              {activeTool?.icon}
            </div>
            <span className="text-[14px] font-medium text-zinc-900">{activeTool?.title}</span>
          </div>
        </div>

        <div className="flex-1 bg-zinc-50 rounded-2xl border border-zinc-200 overflow-hidden flex flex-col">
          <div className="p-4 flex-1 overflow-y-auto">
            {insightContent ? (
              <div className="text-[14px] text-zinc-800 leading-relaxed">
                <MarkdownRenderer content={insightContent} isStreaming={isGenerating} />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-zinc-400">
                <Loader2 className="w-6 h-6 animate-spin mb-3" />
                <span className="text-sm">Generating {activeTool?.title}...</span>
              </div>
            )}
          </div>
          
          {!isGenerating && insightContent && (
            <div className="p-3 border-t border-zinc-200 bg-white flex items-center gap-2">
              <button onClick={handleCopyResult} className="flex-1 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-sm font-medium flex items-center justify-center gap-2 transition-colors">
                <Copy className="w-4 h-4" /> Copy
              </button>
              <button onClick={handleDownload} className="flex-1 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-sm font-medium flex items-center justify-center gap-2 transition-colors">
                <Download className="w-4 h-4" /> Save
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full relative">
      
      {/* Tabs */}
      <div className="flex bg-zinc-100 p-1 rounded-xl gap-1 mb-5">
        {[
          { id: "insights", label: "Insights" },
          { id: "agents", label: "Agents" },
          { id: "url", label: "Add URL" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 py-1.5 px-2 rounded-lg text-[12px] font-semibold transition-all duration-200 ${
              activeTab === tab.id
                ? "bg-white text-zinc-900 shadow-sm border border-zinc-200"
                : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "url" && (
        <div className="animate-slide-up">
          <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                <Globe className="w-4 h-4 text-blue-500" />
              </div>
              <div>
                <h3 className="text-[13px] font-semibold text-zinc-900">Ingest from URL</h3>
                <p className="text-[11px] text-zinc-500">Scrape and index web content</p>
              </div>
            </div>
            <input
              type="url" value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleUrlIngest()}
              placeholder="https://example.com/article"
              className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-lg text-[12px] text-zinc-800 outline-none focus:border-zinc-400 focus:bg-white transition-all placeholder:text-zinc-400 mb-3"
              disabled={isIngesting}
            />
            <button
              onClick={handleUrlIngest}
              disabled={!urlInput.trim() || isIngesting}
              className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-100 disabled:text-zinc-400 text-white font-semibold rounded-lg transition-all text-[12px] flex items-center justify-center gap-2"
            >
              {isIngesting
                ? <><Loader2 className="animate-spin w-3.5 h-3.5" /> Ingesting…</>
                : <><Download className="w-3.5 h-3.5" /> Ingest URL</>}
            </button>
          </div>
        </div>
      )}

      {activeTab === "insights" && (
        <div className="grid grid-cols-2 gap-2.5 mb-6 animate-fade-in">
          {INSIGHT_TYPES.map((tool) => (
            <button
              key={tool.id}
              onClick={() => handleGenerate(tool.id, false)}
              disabled={!hasDocuments}
              className={`flex flex-col justify-between p-3.5 h-[84px] rounded-[16px] text-left transition-all ${
                hasDocuments ? `${tool.color} hover:brightness-95` : "bg-zinc-100 text-zinc-400 cursor-not-allowed opacity-70"
              }`}
            >
              <div className="flex items-center justify-between w-full">
                {tool.icon}
                <ChevronRight className="w-3.5 h-3.5 opacity-50" />
              </div>
              <span className="text-[12.5px] font-medium leading-tight">{tool.title}</span>
            </button>
          ))}
        </div>
      )}

      {activeTab === "agents" && (
        <div className="grid grid-cols-2 gap-2.5 mb-6 animate-fade-in">
          {AGENT_TYPES.map((tool) => (
            <button
              key={tool.id}
              onClick={() => handleGenerate(tool.id, true)}
              disabled={!hasDocuments}
              className={`flex flex-col justify-between p-3.5 h-[84px] rounded-[16px] text-left transition-all ${
                hasDocuments ? `${tool.color} hover:brightness-95` : "bg-zinc-100 text-zinc-400 cursor-not-allowed opacity-70"
              }`}
            >
              <div className="flex items-center justify-between w-full">
                {tool.icon}
                <ChevronRight className="w-3.5 h-3.5 opacity-50" />
              </div>
              <span className="text-[12.5px] font-medium leading-tight">{tool.title}</span>
            </button>
          ))}
        </div>
      )}
      
      {/* Add note button placeholder at bottom */}
      <div className="mt-auto pt-4 flex justify-center">
        <button className="flex items-center gap-2 px-6 py-2.5 bg-black text-white rounded-full text-[14px] font-medium hover:bg-zinc-800 transition-colors shadow-lg">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Add note
        </button>
      </div>
    </div>
  );
}
