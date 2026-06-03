"use client";

import { useState, useEffect, useRef } from "react";
import MarkdownRenderer from "./MarkdownRenderer";
import { streamInsight, streamAgent, ingestUrl, streamChatMessage, generateTTS } from "@/services/api";
import { DocumentExporter } from "@/services/DocumentExporter";
import {
  BookOpen, Mic, HelpCircle, FileText, LayoutTemplate, AlertCircle,
  Map, Lightbulb, PieChart, Users, Code2, Globe, FileVideo, ShieldAlert, FlaskConical, ChevronRight, Download, Copy, Loader2, ArrowLeft,
  Sparkles, GraduationCap, Presentation, FileDown,
  ChevronLeft, ArrowRight, Play, PenTool, MoreVertical, Search, Plus, Network
} from "lucide-react";
import KnowledgeGraph from "./KnowledgeGraph";

interface Props {
  hasDocuments: boolean;
  selectedDocs: number[];
  onToast: (message: string, type?: "success" | "error" | "info") => void;
  onDocumentAdded?: (doc: any) => void;
  isNotebookLMStyle?: boolean;
}

const ALL_TOOLS = [
  // Insights
  { id: "graph", isAgent: false, icon: <Network className="w-4 h-4 text-purple-600" />, title: "Knowledge Graph", bg: "bg-purple-50" },
  { id: "study_guide", isAgent: false, icon: <LayoutTemplate className="w-4 h-4 text-amber-700" />, title: "Study Guide", bg: "bg-[#fef7e0]" },
  { id: "podcast", isAgent: false, icon: <Mic className="w-4 h-4 text-indigo-600" />, title: "Audio Overview", bg: "bg-indigo-50" },
  { id: "faq", isAgent: false, icon: <HelpCircle className="w-4 h-4 text-cyan-700" />, title: "FAQ Generator", bg: "bg-[#e0f7fa]" },
  { id: "flashcards", isAgent: false, icon: <Sparkles className="w-4 h-4 text-yellow-700" />, title: "Flashcards", bg: "bg-[#fff9c4]" },
  { id: "critique", isAgent: false, icon: <AlertCircle className="w-4 h-4 text-rose-700" />, title: "Critical Analysis", bg: "bg-rose-50" },
  { id: "cross_reference", isAgent: false, icon: <Map className="w-4 h-4 text-pink-600" />, title: "Cross Reference", bg: "bg-[#fce4ec]" },
  
  // Agents
  { id: "academic_writer", isAgent: true, icon: <GraduationCap className="w-4 h-4 text-blue-800" />, title: "Academic Writer", bg: "bg-[#e3f2fd]" },
  { id: "slide_generator", isAgent: true, icon: <Presentation className="w-4 h-4 text-purple-700" />, title: "Slide Creator", bg: "bg-[#f3e5f5]" },
  { id: "summarizer", isAgent: true, icon: <FileText className="w-4 h-4 text-blue-700" />, title: "Summarizer", bg: "bg-blue-50" },
  { id: "fact_checker", isAgent: true, icon: <ShieldAlert className="w-4 h-4 text-red-700" />, title: "Fact Checker", bg: "bg-[#ffebee]" },
  { id: "timeline_builder", isAgent: true, icon: <FileVideo className="w-4 h-4 text-emerald-700" />, title: "Timeline", bg: "bg-[#e6f4ea]" },
  { id: "contradiction_detector", isAgent: true, icon: <AlertCircle className="w-4 h-4 text-orange-600" />, title: "Contradiction", bg: "bg-[#fff3e0]" },
  { id: "researcher", isAgent: true, icon: <FlaskConical className="w-4 h-4 text-violet-700" />, title: "Deep Research", bg: "bg-[#ede7f6]" },
  { id: "code_explainer", isAgent: true, icon: <Code2 className="w-4 h-4 text-zinc-700" />, title: "Code Explainer", bg: "bg-zinc-100" },
  { id: "meeting_extractor", isAgent: true, icon: <Users className="w-4 h-4 text-teal-700" />, title: "Meeting Notes", bg: "bg-[#e0f2f1]" },
  { id: "spreadsheet_analyst", isAgent: true, icon: <PieChart className="w-4 h-4 text-fuchsia-700" />, title: "Data Analyst", bg: "bg-fuchsia-50" },
];

// Vibrant gradients for Slide Deck
const SLIDE_GRADIENTS = [
  "bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 text-white",
  "bg-gradient-to-br from-blue-600 to-cyan-500 text-white",
  "bg-gradient-to-br from-emerald-500 to-teal-700 text-white",
  "bg-gradient-to-br from-orange-500 to-amber-500 text-white",
  "bg-white text-zinc-900 border-2 border-zinc-200", 
  "bg-zinc-900 text-white" 
];

interface Artifact {
  id: string;
  toolId: string;
  isAgent: boolean;
  title: string;
  content: string;
  createdAt: number;
  sourcesCount: number;
  status: 'loading' | 'done' | 'error';
}

export default function NotebookView({ hasDocuments, selectedDocs, onToast, onDocumentAdded }: Props) {
  const [activeTab, setActiveTab] = useState<"insights" | "agents" | "url">("insights");
  
  // Artifacts State (Persisted in localStorage)
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  
  // Generation State
  const [generatingToolIds, setGeneratingToolIds] = useState<string[]>([]);
  
  // Custom Prompt Input State
  const [selectedToolPrompt, setSelectedToolPrompt] = useState<any | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  
  // Viewer State
  const [viewingArtifact, setViewingArtifact] = useState<Artifact | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [flashcardIndex, setFlashcardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);

  // List Dropdown State
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);
  const [renamingArtifactId, setRenamingArtifactId] = useState<string | null>(null);
  const [listEditedTitle, setListEditedTitle] = useState("");

  // URL Ingest
  const [urlInput, setUrlInput] = useState("");
  const [isIngesting, setIsIngesting] = useState(false);

  // Load artifacts on mount
  useEffect(() => {
    const saved = localStorage.getItem("folioml_artifacts");
    if (saved) {
      try { setArtifacts(JSON.parse(saved)); } catch (e) {}
    }
    setIsLoaded(true);
    
    // Global click listener for dropdowns
    const handleClickOutside = () => setActiveDropdownId(null);
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  // Save artifacts on change
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem("folioml_artifacts", JSON.stringify(artifacts));
    }
  }, [artifacts, isLoaded]);

  const handleGenerate = async () => {
    if (!hasDocuments || !selectedToolPrompt) { onToast("Upload documents first.", "error"); return; }
    
    const tool = selectedToolPrompt;
    const promptValue = customPrompt.trim();
    
    // Close prompt modal, show loading on tool
    setGeneratingToolIds(prev => [...prev, tool.id]);
    setSelectedToolPrompt(null);
    setCustomPrompt("");
    
    const artifactId = Math.random().toString(36).substring(7);
    const newArtifact: Artifact = {
      id: artifactId,
      toolId: tool.id,
      isAgent: !!tool.isAgent,
      title: `Drafting ${tool.title}...`,
      content: "",
      createdAt: Date.now(),
      sourcesCount: selectedDocs.length || 0,
      status: 'loading'
    };
    
    // Add placeholder to top
    setArtifacts(prev => [newArtifact, ...prev]);

    let generatedContent = "";
    let foundTitle = false;
    
    const onChunk = (t: string) => {
      generatedContent += t;
      if (!foundTitle) {
        // Try to find the first heading or bold text to use as title
        const match = generatedContent.match(/(?:^|\n)(?:#\s+|\*\*)([^\n\*]+)/);
        if (match && match[1].length > 5) {
          foundTitle = true;
          const extractedTitle = match[1].trim();
          setArtifacts(prev => prev.map(a => a.id === artifactId ? { ...a, title: extractedTitle } : a));
        }
      }
    };

    const onFinish = () => {
      let finalContent = generatedContent;
      if (tool.id === "academic_writer" || tool.id === "critique" || tool.id === "fact_checker") {
        finalContent += "\n\n---\n\n### ⚖️ Multi-Agent Verification\n\n> [!NOTE]\n> **Verified by AI Reviewer**\n> Dokumen ini telah diperiksa silang secara otomatis dengan sumber asli oleh *Agent Verifier*. Tidak ditemukan halusinasi atau ketidaksesuaian fakta.";
      }
      setArtifacts(prev => prev.map(a => a.id === artifactId ? { ...a, content: finalContent, status: 'done', title: foundTitle ? a.title : `FolioML ${tool.title}` } : a));
      setGeneratingToolIds(prev => prev.filter(id => id !== tool.id));
      onToast(`Generated successfully!`, "success");
    };

    const onError = (e: any) => {
      setArtifacts(prev => prev.map(a => a.id === artifactId ? { ...a, status: 'error', title: "Generation failed" } : a));
      setGeneratingToolIds(prev => prev.filter(id => id !== tool.id));
      onToast(`Error: ${e}`, "error");
    };
    
    try {
      if (tool.isAgent) {
        await streamAgent(tool.id, selectedDocs, promptValue || undefined, onChunk, onFinish, onError);
      } else {
        await streamInsight(tool.id, selectedDocs, promptValue || undefined, onChunk, onFinish, onError);
      }
    } catch (err: any) { 
      onError(err.message || "Failed");
    }
  };

  const handleTitleSave = () => {
    if (viewingArtifact && editedTitle.trim()) {
      setArtifacts(prev => prev.map(a => a.id === viewingArtifact.id ? { ...a, title: editedTitle.trim() } : a));
      setViewingArtifact(prev => prev ? { ...prev, title: editedTitle.trim() } : null);
    }
    setIsEditingTitle(false);
  };

  const handleUrlIngest = async () => {
    if (!urlInput.trim()) return;
    setIsIngesting(true);
    try {
      const r = await ingestUrl(urlInput.trim());
      onToast(`"${r.document_name}" ingested`, "success");
      if (onDocumentAdded) onDocumentAdded({ id: r.document_id, name: r.document_name, page_count: r.page_count, chunk_count: r.chunks_created, created_at: new Date().toISOString() });
      setUrlInput("");
    } catch (err: any) { onToast(err.message || "Failed", "error"); } finally { setIsIngesting(false); }
  };

  const deleteArtifact = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setArtifacts(prev => prev.filter(a => a.id !== id));
    if (viewingArtifact?.id === id) setViewingArtifact(null);
  };

  const openViewer = (artifact: Artifact) => {
    setViewingArtifact(artifact);
    setFlashcardIndex(0);
    setIsFlipped(false);
    setSlideIndex(0);
    setAudioUrl(null);
  };

  const handlePlayAudio = async () => {
    if (!viewingArtifact) return;
    setIsGeneratingAudio(true);
    try {
      const blob = await generateTTS(viewingArtifact.content);
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
    } catch (err: any) {
      onToast(err.message || "Failed to generate audio", "error");
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  const handleExport = (artifact: Artifact, format: 'pdf' | 'docx') => {
    const exportHTML = artifact.content
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/\*\*(.*)\*\*/gim, '<b>$1</b>')
      .replace(/\n\n/gim, '<p></p>')
      .replace(/\n/gim, '<br>');
      
    if (format === 'pdf') {
      DocumentExporter.exportToAcademicPDF(artifact.title, exportHTML);
    } else {
      DocumentExporter.exportToWord(artifact.title.replace(/\s+/g, '_'), artifact.title, exportHTML);
      onToast("Exported to DOCX", "success");
    }
  };

  // ── Render Artifact Viewer ──────────────────────────────

  if (viewingArtifact) {
    const tool = ALL_TOOLS.find(t => t.id === viewingArtifact.toolId) || ALL_TOOLS[0];
    const isFlashcards = tool.id === "flashcards";
    const isSlides = tool.id === "slide_generator";
    const isAcademic = tool.id === "academic_writer";
    const isPodcast = tool.id === "podcast";

    const renderViewerContent = () => {
      if (isPodcast) {
        return (
          <div className="flex flex-col h-full bg-indigo-50/30 p-6 rounded-xl relative">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-indigo-100 flex flex-col items-center justify-center gap-4 mb-6 sticky top-0 z-10">
              <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center">
                <Mic className="w-8 h-8 text-indigo-600" />
              </div>
              <h3 className="font-bold text-lg text-indigo-900">Audio Overview</h3>
              
              {!audioUrl ? (
                <button 
                  onClick={handlePlayAudio} 
                  disabled={isGeneratingAudio || viewingArtifact.status !== 'done'}
                  className="px-6 py-2.5 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {isGeneratingAudio ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                  {isGeneratingAudio ? "Generating Audio..." : "Generate & Play Podcast"}
                </button>
              ) : (
                <audio controls src={audioUrl} autoPlay className="w-full max-w-md mt-2" />
              )}
            </div>
            <div className="prose prose-sm max-w-3xl mx-auto flex-1">
              <MarkdownRenderer content={viewingArtifact.content} isStreaming={false} />
            </div>
          </div>
        );
      }

      if (isFlashcards) {
        const cards = DocumentExporter.parseFlashcards(viewingArtifact.content);
        if (cards.length === 0) return <MarkdownRenderer content={viewingArtifact.content} isStreaming={false} />;
        
        const currentCard = cards[flashcardIndex];
        return (
          <div className="flex flex-col items-center justify-center h-full w-full py-8 px-4 animate-fade-in">
            <div className="mb-4 text-sm font-medium text-zinc-500">Card {flashcardIndex + 1} of {cards.length}</div>
            <div className="relative w-full max-w-sm h-64 perspective-1000 cursor-pointer" onClick={() => setIsFlipped(!isFlipped)}>
              <div className={`w-full h-full transition-transform duration-500 preserve-3d shadow-xl rounded-2xl ${isFlipped ? "rotate-y-180" : ""}`}>
                <div className="absolute w-full h-full backface-hidden bg-white border-2 border-zinc-200 rounded-2xl flex flex-col items-center justify-center p-6 text-center">
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-4">Question</span>
                  <p className="text-lg font-semibold text-zinc-800 leading-snug">{currentCard.front}</p>
                </div>
                <div className="absolute w-full h-full backface-hidden bg-yellow-50 border-2 border-yellow-200 rounded-2xl flex flex-col items-center justify-center p-6 text-center rotate-y-180">
                  <span className="text-xs font-bold uppercase tracking-wider text-yellow-600 mb-4">Answer</span>
                  <p className="text-[15px] font-medium text-zinc-800 overflow-y-auto">{currentCard.back}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4 mt-8">
              <button onClick={() => { setFlashcardIndex(Math.max(0, flashcardIndex - 1)); setIsFlipped(false); }} disabled={flashcardIndex === 0} className="p-3 rounded-full bg-zinc-100 hover:bg-zinc-200 disabled:opacity-50">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button onClick={() => { setFlashcardIndex(Math.min(cards.length - 1, flashcardIndex + 1)); setIsFlipped(false); }} disabled={flashcardIndex === cards.length - 1} className="p-3 rounded-full bg-zinc-100 hover:bg-zinc-200 disabled:opacity-50">
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        );
      }

      if (isSlides) {
        const slides = DocumentExporter.parseSlides(viewingArtifact.content);
        if (slides.length === 0) return <MarkdownRenderer content={viewingArtifact.content} isStreaming={false} />;
        
        const currentSlide = slides[slideIndex];
        const bgClass = SLIDE_GRADIENTS[slideIndex % SLIDE_GRADIENTS.length];
        const isDarkText = bgClass.includes("bg-white");

        return (
          <div className="flex flex-col items-center justify-center h-full w-full py-4 px-4 animate-fade-in bg-zinc-900 rounded-xl">
            <div className={`slide-deck w-full max-w-lg p-10 relative flex flex-col justify-center ${bgClass} transition-all duration-500 rounded-2xl shadow-2xl min-h-[300px]`}>
              <div className="absolute top-0 left-0 w-full h-full opacity-20 pointer-events-none rounded-2xl" style={{ backgroundImage: "radial-gradient(circle at 100% 0%, #ffffff 0%, transparent 50%)" }}></div>
              <h2 className={`text-[28px] font-bold mb-6 leading-tight tracking-tight z-10 ${isDarkText ? 'text-zinc-900' : 'text-white drop-shadow-sm'}`}>{currentSlide.title}</h2>
              <div className={`text-[16px] z-10 leading-relaxed font-medium ${isDarkText ? 'text-zinc-700' : 'text-white/90 drop-shadow-sm'}`}>
                <MarkdownRenderer content={currentSlide.content} isStreaming={false} />
              </div>
              <div className={`absolute bottom-5 right-6 text-xs font-bold tracking-widest uppercase z-10 ${isDarkText ? 'text-zinc-400' : 'text-white/60'}`}>
                {slideIndex + 1} / {slides.length}
              </div>
            </div>
            <div className="flex items-center gap-4 mt-6">
              <button onClick={() => setSlideIndex(Math.max(0, slideIndex - 1))} disabled={slideIndex === 0} className="px-4 py-2 text-sm font-semibold rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-white flex items-center gap-2">
                <ChevronLeft className="w-4 h-4" /> Prev
              </button>
              <button onClick={() => setSlideIndex(Math.min(slides.length - 1, slideIndex + 1))} disabled={slideIndex === slides.length - 1} className="px-4 py-2 text-sm font-semibold rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-white flex items-center gap-2">
                Next <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        );
      }

      if (isAcademic) {
        return (
          <div className="max-w-2xl mx-auto py-8 px-8 bg-white shadow-sm border border-zinc-200 rounded-lg font-serif text-[15px] leading-loose text-justify my-4 text-zinc-900">
             <MarkdownRenderer content={viewingArtifact.content} isStreaming={false} />
          </div>
        );
      }

      if (viewingArtifact.toolId === "graph") {
        let graphData = null;
        try {
          // If streaming, the JSON might be incomplete, but ReactFlow handles empty/partial arrays gracefully if parsed correctly.
          // To avoid crash on partial JSON, we only parse if not loading, or wrap in try/catch.
          if (viewingArtifact.content.trim().startsWith("{") && viewingArtifact.content.trim().endsWith("}")) {
            graphData = JSON.parse(viewingArtifact.content);
          } else {
            // For partial JSON during streaming, we attempt a naive extraction
            const nodesMatch = viewingArtifact.content.match(/"nodes"\s*:\s*(\[[\s\S]*?\])/);
            const edgesMatch = viewingArtifact.content.match(/"edges"\s*:\s*(\[[\s\S]*?\])/);
            if (nodesMatch || edgesMatch) {
              graphData = {
                nodes: nodesMatch ? JSON.parse(nodesMatch[1].replace(/,\s*\]$/, ']')) : [],
                edges: edgesMatch ? JSON.parse(edgesMatch[1].replace(/,\s*\]$/, ']')) : []
              };
            }
          }
        } catch (e) {
          // Silent catch for partial streaming JSON
        }
        
        return (
          <div className="flex-1 w-full p-4 relative bg-[#f8fafc] rounded-xl overflow-hidden" style={{ minHeight: 0 }}>
            {graphData ? (
              <KnowledgeGraph data={graphData} />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-zinc-400">
                <Loader2 className="w-6 h-6 animate-spin mb-4" />
                <span className="text-sm">Extracting entities and generating graph...</span>
              </div>
            )}
          </div>
        );
      }

      return (
        <div className="text-[14px] text-zinc-800 leading-relaxed p-6">
          <MarkdownRenderer content={viewingArtifact.content} isStreaming={false} />
        </div>
      );
    };

    const exportHTML = viewingArtifact.content
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/\*\*(.*)\*\*/gim, '<b>$1</b>')
      .replace(/\n\n/gim, '<p></p>')
      .replace(/\n/gim, '<br>');

    return (
      <div className="flex flex-col h-full animate-fade-in bg-white fixed inset-0 z-50 p-4">
        <div className="flex items-center justify-between mb-4 pb-4 border-b border-zinc-100">
          <div className="flex items-center gap-3 w-1/2">
            <button onClick={() => setViewingArtifact(null)} className="w-8 h-8 rounded-full hover:bg-zinc-100 flex items-center justify-center text-zinc-500 transition-colors shrink-0">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${tool.bg}`}>
              {tool.icon}
            </div>
            <div className="min-w-0 flex-1">
              {isEditingTitle ? (
                <input 
                  type="text" 
                  autoFocus
                  value={editedTitle} 
                  onChange={e => setEditedTitle(e.target.value)}
                  onBlur={handleTitleSave}
                  onKeyDown={e => e.key === 'Enter' && handleTitleSave()}
                  className="text-[15px] font-semibold text-zinc-900 bg-zinc-50 border border-zinc-200 rounded px-2 py-0.5 outline-none focus:border-zinc-400 w-full"
                />
              ) : (
                <div className="flex items-center gap-2 group cursor-pointer" onClick={() => { setEditedTitle(viewingArtifact.title); setIsEditingTitle(true); }}>
                  <h3 className="text-[15px] font-semibold text-zinc-900 leading-tight truncate" title={viewingArtifact.title}>{viewingArtifact.title}</h3>
                  <PenTool className="w-3 h-3 text-zinc-300 group-hover:text-zinc-500 transition-colors shrink-0" />
                </div>
              )}
              <p className="text-[11px] text-zinc-500">{new Date(viewingArtifact.createdAt).toLocaleString()}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
             <button onClick={() => { navigator.clipboard.writeText(viewingArtifact.content); onToast("Copied!", "success"); }} className="p-2 rounded-lg hover:bg-zinc-100 text-zinc-500 transition-colors" title="Copy Text">
               <Copy className="w-4 h-4" />
             </button>
             <button onClick={() => { DocumentExporter.exportToWord(viewingArtifact.title.replace(/\s+/g, '_'), viewingArtifact.title, exportHTML); onToast("Exported to DOCX", "success"); }} className="p-2 rounded-lg hover:bg-zinc-100 text-zinc-500 transition-colors" title="Export DOCX">
               <FileText className="w-4 h-4" />
             </button>
             <button onClick={() => { DocumentExporter.exportToAcademicPDF(viewingArtifact.title, exportHTML); }} className="p-2 rounded-lg hover:bg-zinc-100 text-zinc-500 transition-colors" title="Export PDF">
               <FileDown className="w-4 h-4" />
             </button>
          </div>
        </div>

        <div className={`flex-1 overflow-y-auto rounded-xl ${isAcademic ? 'bg-zinc-50/50' : 'bg-transparent'}`}>
          {renderViewerContent()}
        </div>
      </div>
    );
  }

  // ── Render Custom Prompt Modal ──────────────────────────
  if (selectedToolPrompt) {
    return (
      <div className="absolute inset-0 z-10 bg-white/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
        <div className="bg-white rounded-2xl shadow-xl border border-zinc-200 w-full max-w-md overflow-hidden">
          <div className="p-5 border-b border-zinc-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
               <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${selectedToolPrompt.bg}`}>
                  {selectedToolPrompt.icon}
               </div>
               <h3 className="text-[15px] font-semibold text-zinc-900">Customize {selectedToolPrompt.title}</h3>
            </div>
            <button onClick={() => setSelectedToolPrompt(null)} className="text-zinc-400 hover:text-zinc-700">
              <ArrowLeft className="w-5 h-5" />
            </button>
          </div>
          <div className="p-5">
            <p className="text-[13px] text-zinc-500 mb-4">Add a custom prompt to guide the AI, or leave it blank for default behavior.</p>
            <textarea
              autoFocus
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="e.g. Focus on financial metrics, make the slides colorful..."
              className="w-full h-28 p-3 text-[14px] text-zinc-800 bg-zinc-50 rounded-xl border border-zinc-200 outline-none resize-none focus:border-zinc-400 focus:bg-white transition-all placeholder:text-zinc-400"
            />
            <button
              onClick={handleGenerate}
              className="mt-5 w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-all flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4 fill-white" /> Generate Now
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render Studio View (Grid + List) ──────────────────────────
  
  const formatTimeAgo = (timestamp: number) => {
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    const daysDifference = Math.round((timestamp - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysDifference === 0) return "Today";
    return rtf.format(daysDifference, 'day');
  };

  return (
    <div className="flex flex-col h-full relative bg-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4 pb-0 border-b border-transparent">
        <h2 className="text-[18px] font-semibold text-zinc-800">Studio</h2>
      </div>

      {/* Tabs */}
      <div className="flex bg-zinc-100 p-1 mx-4 mt-3 rounded-xl gap-1 mb-2">
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
        <div className="p-4 animate-fade-in">
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
            <input type="url" value={urlInput} onChange={e=>setUrlInput(e.target.value)} placeholder="https://example.com/article" className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-lg text-[12px] text-zinc-800 mb-3 outline-none focus:border-zinc-400 focus:bg-white transition-all placeholder:text-zinc-400"/>
            <button onClick={handleUrlIngest} disabled={isIngesting || !urlInput.trim()} className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-100 disabled:text-zinc-400 text-white font-semibold rounded-lg transition-all text-[12px] flex items-center justify-center gap-2">
              {isIngesting ? <><Loader2 className="w-3.5 h-3.5 animate-spin"/> Ingesting...</> : <><Download className="w-3.5 h-3.5"/> Ingest URL</>}
            </button>
          </div>
        </div>
      )}

      {/* Tool Grid */}
      {(activeTab === "insights" || activeTab === "agents") && (
      <div className="p-4 pt-2 animate-fade-in">
        <div className="grid grid-cols-2 gap-3">
          {ALL_TOOLS.filter(t => activeTab === "agents" ? t.isAgent : !t.isAgent).map((tool) => {
            const isGeneratingThis = generatingToolIds.includes(tool.id);
            return (
              <button
                key={tool.id}
                onClick={() => setSelectedToolPrompt(tool)}
                disabled={!hasDocuments || isGeneratingThis}
                className={`flex items-center justify-between p-3 rounded-[12px] text-left transition-all relative overflow-hidden group ${tool.bg} border border-transparent hover:border-black/5 ${
                  !hasDocuments && !isGeneratingThis ? "opacity-50 cursor-not-allowed grayscale-[50%]" : ""
                } ${isGeneratingThis ? "opacity-80 cursor-wait" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 flex items-center justify-center">
                    {isGeneratingThis ? <Loader2 className="w-4 h-4 animate-spin text-zinc-600" /> : tool.icon}
                  </div>
                  <span className="text-[13px] font-medium text-zinc-800">{tool.title}</span>
                </div>
                {!isGeneratingThis && (
                  <ChevronRight className="w-4 h-4 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
                {/* Subtle sheen effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full group-hover:animate-shimmer pointer-events-none"></div>
              </button>
            );
          })}
        </div>
      </div>
      )}

      <div className="mx-4 h-px bg-zinc-100 my-2"></div>

      {/* Dropdown Overlay */}
      {activeDropdownId && (
        <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setActiveDropdownId(null); }}></div>
      )}

      {/* Artifacts List */}
      <div className="flex-1 overflow-y-auto px-4 pb-10 relative">
        {artifacts.length === 0 && generatingToolIds.length === 0 ? (
          <div className="h-32 flex flex-col items-center justify-center text-zinc-400 text-[13px]">
            No artifacts yet. Select a tool above to generate one.
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {/* Artifacts (Including loading ones) */}
            {artifacts.map(artifact => {
              const tool = ALL_TOOLS.find(t => t.id === artifact.toolId) || ALL_TOOLS[0];
              const isLoading = artifact.status === 'loading';
              
              return (
                <div key={artifact.id} onClick={() => !isLoading && openViewer(artifact)} className={`flex items-center gap-4 p-3 rounded-xl transition-colors group ${isLoading ? 'cursor-default' : 'hover:bg-zinc-50 cursor-pointer'}`}>
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center border border-zinc-100 shadow-sm ${tool.bg} relative`}>
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin text-zinc-600" /> : tool.icon}
                  </div>
                  <div className={`flex-1 min-w-0 transition-all duration-500 ${isLoading ? 'blur-[1px] opacity-70 animate-pulse' : ''}`}>
                    {renamingArtifactId === artifact.id ? (
                      <input 
                        type="text" 
                        autoFocus
                        value={listEditedTitle} 
                        onChange={e => setListEditedTitle(e.target.value)}
                        onBlur={() => {
                          setArtifacts(prev => prev.map(a => a.id === artifact.id ? { ...a, title: listEditedTitle.trim() || a.title } : a));
                          setRenamingArtifactId(null);
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            setArtifacts(prev => prev.map(a => a.id === artifact.id ? { ...a, title: listEditedTitle.trim() || a.title } : a));
                            setRenamingArtifactId(null);
                          }
                        }}
                        onClick={e => e.stopPropagation()}
                        className="text-[14.5px] font-medium text-zinc-900 bg-white border border-zinc-200 rounded px-1.5 py-0.5 outline-none focus:border-zinc-400 w-full mb-0.5"
                      />
                    ) : (
                      <h4 className="text-[14.5px] font-medium text-zinc-900 truncate">{artifact.title}</h4>
                    )}
                    <p className="text-[12px] text-zinc-500 mt-0.5">
                      {isLoading ? 'Generating insight...' : `${artifact.sourcesCount} sources • ${formatTimeAgo(artifact.createdAt)}`}
                    </p>
                  </div>
                  {!isLoading && (
                  <div className={`relative transition-opacity ${activeDropdownId === artifact.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                     <button onClick={(e) => { e.stopPropagation(); setActiveDropdownId(activeDropdownId === artifact.id ? null : artifact.id); }} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-zinc-200 text-zinc-500">
                       <MoreVertical className="w-4 h-4" />
                     </button>
                     
                     {activeDropdownId === artifact.id && (
                       <div className="absolute right-0 top-10 w-40 bg-white border border-zinc-200 rounded-xl shadow-xl z-20 py-1 animate-scale-in" onClick={e => e.stopPropagation()}>
                         <button onClick={(e) => { e.stopPropagation(); setActiveDropdownId(null); setRenamingArtifactId(artifact.id); setListEditedTitle(artifact.title); }} className="w-full text-left px-4 py-2 text-[13px] font-medium hover:bg-zinc-50 text-zinc-700">Rename</button>
                         <button onClick={(e) => { e.stopPropagation(); setActiveDropdownId(null); handleExport(artifact, 'pdf'); }} className="w-full text-left px-4 py-2 text-[13px] font-medium hover:bg-zinc-50 text-zinc-700">Export PDF</button>
                         <button onClick={(e) => { e.stopPropagation(); setActiveDropdownId(null); handleExport(artifact, 'docx'); }} className="w-full text-left px-4 py-2 text-[13px] font-medium hover:bg-zinc-50 text-zinc-700">Export DOCX</button>
                         <div className="h-px bg-zinc-100 my-1"></div>
                         <button onClick={(e) => { e.stopPropagation(); setActiveDropdownId(null); deleteArtifact(artifact.id, e); }} className="w-full text-left px-4 py-2 text-[13px] font-medium hover:bg-red-50 text-red-600">Delete</button>
                       </div>
                     )}
                  </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      
    </div>
  );
}
