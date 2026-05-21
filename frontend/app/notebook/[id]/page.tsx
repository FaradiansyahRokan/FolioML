"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { Notebook, ChatMessage, Document } from "@/types";
import { streamChatMessage, listDocuments, uploadDocument } from "@/services/api";
import MessageBubble from "@/components/MessageBubble";
import DocumentList from "@/components/DocumentList";
import UploadZone from "@/components/UploadButton";
import SuggestedQuestions from "@/components/SuggestedQuestions";
import ToastContainer, { useToast } from "@/components/Toast";
import NotebookView from "@/components/NotebookView";
import WebSearchModal from "@/components/WebSearchModal";
import DocumentViewerModal from "@/components/DocumentViewerModal";
import { searchWebPreview, WebSearchPreviewResult, ingestUrl } from "@/services/api";
import { ArrowLeft, Settings, Search, Globe, ChevronDown, CheckSquare, Plus, SlidersHorizontal, MoreVertical, Loader2, Link as LinkIcon, FileText } from "lucide-react";

const STORAGE_KEY = "folioml_notebooks";

function genId() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

export default function NotebookPage() {
  const router = useRouter();
  const params = useParams();
  const notebookId = params?.id as string;

  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [allDocuments, setAllDocuments] = useState<Document[]>([]);
  const [uploadingDocs, setUploadingDocs] = useState<Document[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [useWebFallback, setUseWebFallback] = useState(false);
  
  // Toggles for the side panels
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
  const [showWebSearchModal, setShowWebSearchModal] = useState(false);
  
  // Fast Research Inline State
  const [sidebarSearchQuery, setSidebarSearchQuery] = useState("");
  const [isSearchingSidebar, setIsSearchingSidebar] = useState(false);
  const [sidebarSearchResults, setSidebarSearchResults] = useState<WebSearchPreviewResult[]>([]);
  const [isImportingSidebar, setIsImportingSidebar] = useState(false);
  
  const [searchType, setSearchType] = useState<"web" | "documents">("web");
  const [showSearchTypeMenu, setShowSearchTypeMenu] = useState(false);
  
  const [isDragging, setIsDragging] = useState(false);

  // Document Viewer Modal
  const [viewerDocId, setViewerDocId] = useState<number | null>(null);
  const [showDocViewer, setShowDocViewer] = useState(false);

  // Resizable sidebar widths
  const [leftWidth, setLeftWidth] = useState(340);
  const [rightWidth, setRightWidth] = useState(360);
  const isResizingLeft = useRef(false);
  const isResizingRight = useRef(false);

  const LEFT_MIN = 240;
  const LEFT_MAX = 600;
  const RIGHT_MIN = 240;
  const RIGHT_MAX = 600;

  // Global mouse handlers for resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingLeft.current) {
        e.preventDefault();
        const newW = Math.min(LEFT_MAX, Math.max(LEFT_MIN, e.clientX - 12));
        setLeftWidth(newW);
      }
      if (isResizingRight.current) {
        e.preventDefault();
        const newW = Math.min(RIGHT_MAX, Math.max(RIGHT_MIN, window.innerWidth - e.clientX - 12));
        setRightWidth(newW);
      }
    };
    const handleMouseUp = () => {
      isResizingLeft.current = false;
      isResizingRight.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const { toasts, addToast, dismissToast } = useToast();
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Load notebook from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const notebooks: Notebook[] = JSON.parse(saved);
        const found = notebooks.find((n) => n.id === notebookId);
        if (found) { setNotebook(found); }
        else router.replace("/");
      } else {
        router.replace("/");
      }
    } catch { router.replace("/"); }
    setLoaded(true);
  }, [notebookId, router]);

  // Load all backend documents
  useEffect(() => {
    listDocuments().then(setAllDocuments).catch(() => addToast("Failed to load documents", "error"));
  }, []);

  // Save notebook to localStorage whenever it changes
  useEffect(() => {
    if (!notebook || !loaded) return;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const notebooks: Notebook[] = saved ? JSON.parse(saved) : [];
      const updated = notebooks.map((n) => n.id === notebook.id ? notebook : n);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {}
  }, [notebook, loaded]);

  // Auto-scroll
  useEffect(() => {
    const c = chatScrollRef.current;
    if (!c) return;
    if (c.scrollHeight - c.scrollTop <= c.clientHeight + 200) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [notebook?.messages]);

  // Documents belonging to this notebook
  const notebookDocs = allDocuments.filter((d) => notebook?.documentIds.includes(d.id));
  const [selectedDocIds, setSelectedDocIds] = useState<Set<number>>(new Set());
  
  // Sync selected docs when notebook loads or docs change
  useEffect(() => {
    if (notebook) setSelectedDocIds(new Set(notebook.documentIds));
  }, [notebook?.documentIds]);

  function toggleDocSelection(id: number) {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function updateMessages(updater: (m: ChatMessage[]) => ChatMessage[]) {
    setNotebook((prev) => prev ? { ...prev, messages: updater(prev.messages), updatedAt: new Date().toISOString() } : prev);
  }

  const handleDocumentAdded = (doc: Document, tempId?: number) => {
    if (tempId) {
      setUploadingDocs(prev => prev.filter(d => d.id !== tempId));
    }
    setAllDocuments((p) => [doc, ...p]);
    setNotebook((prev) => prev ? { ...prev, documentIds: [doc.id, ...prev.documentIds], updatedAt: new Date().toISOString() } : prev);
    if (!tempId) addToast(`"${doc.name}" added to notebook`, "success"); // Toast is handled in UploadButton for normal uploads
  };

  const handleUploadStart = (tempId: number, name: string) => {
    setUploadingDocs(prev => [{ id: tempId, name, created_at: new Date().toISOString(), isUploading: true }, ...prev]);
  };

  const handleUploadError = (tempId: number) => {
    setUploadingDocs(prev => prev.filter(d => d.id !== tempId));
  };

  const handleSidebarSearch = async () => {
    if (searchType !== "web" || !sidebarSearchQuery.trim()) return;
    setIsSearchingSidebar(true);
    setSidebarSearchResults([]);
    try {
      const data = await searchWebPreview(sidebarSearchQuery);
      setSidebarSearchResults(data.results);
      if (data.results.length === 0) {
        addToast("No results found.", "info");
      }
    } catch (err: any) {
      addToast(err.message || "Search failed", "error");
    }
    setIsSearchingSidebar(false);
  };


  const handleBulkImportFromSidebar = async () => {
    if (sidebarSearchResults.length === 0) return;
    setIsImportingSidebar(true);
    let successCount = 0;
    
    // Import top 3 sources to start (or all of them depending on preference, we'll do top 3 for speed)
    const sourcesToImport = sidebarSearchResults.slice(0, 3);
    for (const r of sourcesToImport) {
      try {
        const res = await ingestUrl(r.url, r.title, r.snippet);
        handleDocumentAdded({
          id: res.document_id,
          name: res.document_name,
          page_count: res.page_count,
          chunk_count: res.chunks_created,
          created_at: new Date().toISOString(),
        });
        successCount++;
      } catch (err) {
        console.error("Failed to import:", r.url);
      }
    }
    setIsImportingSidebar(false);
    if (successCount > 0) {
      setSidebarSearchResults([]);
      setSidebarSearchQuery("");
      addToast(`${successCount} sources imported!`, "success");
    } else {
      addToast("Failed to import sources", "error");
    }
  };

  function handleDocumentRemoved(id: number) {
    setAllDocuments((p) => p.filter((d) => d.id !== id));
    setNotebook((prev) => prev ? { ...prev, documentIds: prev.documentIds.filter((did) => did !== id), updatedAt: new Date().toISOString() } : prev);
  }

  async function handleSend(qo?: string) {
    const q = (qo || input).trim();
    if (!q || loading || !notebook) return;
    setInput("");

    const uid = genId(); const aid = genId();
    updateMessages((p) => [...p,
      { id: uid, role: "user", content: q },
      { id: aid, role: "assistant", content: "", isLoading: true }
    ]);

    setLoading(true);
    const hist = (notebook.messages || []).filter((m) => !m.isLoading).slice(-10).map((m) => ({ role: m.role, content: m.content }));
    let c = "";
    try {
      await streamChatMessage(q, hist, Array.from(selectedDocIds), useWebFallback, undefined,
        (t) => { c += t; const cc = c; updateMessages((p) => p.map((m) => m.id === aid ? { ...m, content: cc, isLoading: false, isStreaming: true } : m)); },
        (src) => { updateMessages((p) => p.map((m) => m.id === aid ? { ...m, sources: src } : m)); },
        () => { updateMessages((p) => p.map((m) => m.id === aid ? { ...m, isStreaming: false } : m)); },
        (err) => { updateMessages((p) => p.map((m) => m.id === aid ? { ...m, content: `Error: ${err}`, isLoading: false, isStreaming: false } : m)); }
      );
    } catch (err: unknown) {
      updateMessages((p) => p.map((m) => m.id === aid ? { ...m, content: `Error: ${err instanceof Error ? err.message : "Failed"}`, isLoading: false, isStreaming: false } : m));
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); if (e.currentTarget === e.target) setIsDragging(false); }, []);
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    for (const file of Array.from(e.dataTransfer.files)) {
      try {
        const r = await uploadDocument(file);
        handleDocumentAdded({ id: r.document_id, name: r.document_name, page_count: r.page_count, chunk_count: r.chunks_created, created_at: new Date().toISOString() });
      } catch (err: unknown) { addToast(err instanceof Error ? err.message : "Upload failed", "error"); }
    }
  }, []);

  // Filter documents if searchType is "documents"
  const combinedDocs = [...uploadingDocs, ...notebookDocs];
  const displayedDocs = searchType === "documents" && sidebarSearchQuery.trim()
    ? combinedDocs.filter(d => d.name.toLowerCase().includes(sidebarSearchQuery.toLowerCase()))
    : combinedDocs;

  if (!loaded) return <div className="h-screen flex items-center justify-center bg-[#f0f4f9]"><Loader2 className="w-6 h-6 animate-spin text-zinc-400" /></div>;
  if (!notebook) return null;

  const messages = notebook.messages || [];

  return (
    <div className="flex flex-col h-screen bg-[#f0f4f9] font-sans overflow-hidden" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      {isDragging && (
        <div className="drag-overlay z-50 fixed inset-0 flex items-center justify-center bg-blue-500/10 backdrop-blur-sm" onDragLeave={() => setIsDragging(false)}>
          <div className="bg-white rounded-3xl p-10 text-center shadow-xl">
            <div className="h-16 w-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-100">
              <Plus className="w-8 h-8 text-blue-500" />
            </div>
            <p className="text-zinc-900 text-xl font-medium tracking-tight">Drop to add as source</p>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* TOP HEADER */}
      <header className="h-[60px] flex-shrink-0 flex items-center justify-between px-5 bg-white border-b border-zinc-200/50">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/")} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-zinc-100 text-zinc-500">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="text-2xl">{notebook.emoji}</div>
            <span className="text-[17px] font-medium text-zinc-800">{notebook.title}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-full text-[13px] font-medium hover:bg-zinc-800 transition-colors">
            <Plus className="w-4 h-4" /> Create notebook
          </button>
        </div>
      </header>

      {/* MAIN 3-COLUMN WORKSPACE */}
      <div className="flex-1 flex gap-3 p-3 overflow-hidden">
        
        {/* LEFT CARD - Sources */}
        <div className={`flex-shrink-0 transition-all duration-300 ease-in-out relative h-full z-10`} style={{ width: sidebarOpen ? leftWidth : 48 }}>
          {/* Expanded Sidebar */}
          <div className={`absolute top-0 left-0 h-full bg-white rounded-3xl flex flex-col shadow-sm border border-zinc-200/50 overflow-hidden transition-all duration-300 ease-in-out origin-left ${sidebarOpen ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-95 pointer-events-none"}`} style={{ width: leftWidth }}>
            <div className="p-4 border-b border-zinc-100 flex items-center justify-between">
              <span className="text-[15px] font-medium text-zinc-800">Sources</span>
              <button onClick={() => setSidebarOpen(false)} className="p-1.5 rounded-full hover:bg-zinc-100 text-zinc-500">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" /></svg>
              </button>
            </div>
            
            <div className="p-4 flex flex-col gap-3">
              {/* Add sources button */}
              <UploadZone 
                onUploadStart={handleUploadStart}
                onUploadSuccess={handleDocumentAdded} 
                onUploadError={handleUploadError}
                onToast={addToast} 
                isNotebookLMStyle={true} 
              />
              
              {/* Search bar functional container */}
              <div className="bg-[#f0f4f9] rounded-[20px] p-2 mt-2 flex flex-col gap-2 relative">
                <input 
                  type="text" 
                  value={sidebarSearchQuery}
                  onChange={(e) => setSidebarSearchQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSidebarSearch(); }}
                  placeholder={searchType === "web" ? "Search the web for new sources" : "Search documents..."}
                  className="w-full bg-transparent px-2 py-1.5 text-[14px] text-zinc-800 placeholder-zinc-400 outline-none"
                />
                <div className="flex items-center justify-between px-1">
                  <div className="relative">
                    <button 
                      onClick={() => setShowSearchTypeMenu(!showSearchTypeMenu)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-zinc-200 bg-white text-[13px] font-medium text-zinc-600 hover:bg-zinc-50"
                    >
                      {searchType === "web" ? <Globe className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                      <span className="capitalize">{searchType}</span> 
                      <ChevronDown className="w-3 h-3 text-zinc-400" />
                    </button>
                    
                    {showSearchTypeMenu && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setShowSearchTypeMenu(false)} />
                        <div className="absolute top-10 left-0 w-44 bg-white rounded-xl shadow-lg border border-zinc-100 py-1.5 z-20">
                          <button
                            onClick={() => { setSearchType("web"); setShowSearchTypeMenu(false); }}
                            className="w-full px-4 py-2 text-left text-[13px] font-medium text-zinc-700 hover:bg-zinc-50 flex items-center gap-2"
                          >
                            <Globe className="w-4 h-4" /> Search Web
                          </button>
                          <button
                            onClick={() => { setSearchType("documents"); setShowSearchTypeMenu(false); }}
                            className="w-full px-4 py-2 text-left text-[13px] font-medium text-zinc-700 hover:bg-zinc-50 flex items-center gap-2"
                          >
                            <FileText className="w-4 h-4" /> Search Documents
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                  
                  {searchType === "web" && (
                    <button onClick={handleSidebarSearch} disabled={isSearchingSidebar || !sidebarSearchQuery} className="w-8 h-8 rounded-full bg-zinc-200/80 hover:bg-zinc-300 flex items-center justify-center text-zinc-600 transition-colors disabled:opacity-50">
                      {isSearchingSidebar ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              </div>

              {/* Fast Research Preview Card (Only when searchType is web) */}
              {searchType === "web" && sidebarSearchResults.length > 0 && (
                <div className="bg-[#f0f4f9] rounded-[20px] p-4 mt-3 flex flex-col">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Search className="w-5 h-5 text-zinc-800" />
                        <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-blue-500 rounded-full border-2 border-[#f0f4f9]"></div>
                      </div>
                      <span className="text-[14px] font-semibold text-zinc-900">Fast Research completed!</span>
                    </div>
                    <button onClick={() => setShowWebSearchModal(true)} className="text-[13px] font-medium text-zinc-900 underline hover:text-blue-600 underline-offset-2">
                      View
                    </button>
                  </div>
                  
                  <div className="bg-white rounded-[16px] p-4 shadow-sm border border-zinc-100/50 flex flex-col gap-3">
                    {sidebarSearchResults.slice(0, 3).map((res, i) => (
                      <div key={i} className="flex gap-3 items-start group">
                        <div className="w-6 h-6 rounded-md bg-zinc-100 flex items-center justify-center flex-shrink-0 mt-0.5 overflow-hidden">
                          <img src={`https://www.google.com/s2/favicons?sz=32&domain=${res.source_domain}`} alt="" className="w-4 h-4 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        </div>
                        <div className="flex flex-col min-w-0 flex-1">
                          <a href={res.url} target="_blank" rel="noopener noreferrer" className="text-[13px] font-medium text-zinc-900 leading-snug line-clamp-1 hover:underline">
                            {res.title}
                          </a>
                          <span className="text-[12px] text-zinc-500 line-clamp-1 mt-0.5">{res.snippet}</span>
                        </div>
                      </div>
                    ))}
                    
                    {sidebarSearchResults.length > 3 && (
                      <button onClick={() => setShowWebSearchModal(true)} className="flex items-center gap-2 mt-1 text-blue-600 hover:text-blue-700 w-fit">
                        <LinkIcon className="w-4 h-4" />
                        <span className="text-[13px] font-semibold">{sidebarSearchResults.length - 3} more sources</span>
                      </button>
                    )}
                    
                    <div className="flex items-center justify-end mt-3 pt-3 border-t border-zinc-100">
                      <div className="flex items-center gap-4">
                        <button onClick={() => { setSidebarSearchResults([]); setSidebarSearchQuery(""); }} disabled={isImportingSidebar} className="text-[13px] font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50">
                          Delete
                        </button>
                        <button 
                          onClick={handleBulkImportFromSidebar} 
                          disabled={isImportingSidebar}
                          className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-5 py-2 text-[13px] font-medium flex items-center gap-2 transition-all disabled:opacity-80 disabled:cursor-wait min-w-[90px] justify-center"
                        >
                          {isImportingSidebar ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Importing...</span>
                            </>
                          ) : (
                            <>
                              <Plus className="w-4 h-4" />
                              <span>Import</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Document List */}
            <div className="flex-1 overflow-y-auto px-2 pb-4">
              {notebookDocs.length === 0 && uploadingDocs.length === 0 ? (
                <div className="text-center py-10 px-4">
                  <p className="text-[13px] text-zinc-500">No sources added yet. Click above to add documents to your notebook.</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between px-1 mb-2">
                    <span className="text-[13px] font-semibold text-zinc-800">
                      {searchType === "documents" && sidebarSearchQuery.trim() ? "Search Results" : "Sources"}
                    </span>
                    <button 
                      onClick={() => {
                        const allSelected = displayedDocs.every(d => selectedDocIds.has(d.id));
                        if (allSelected) setSelectedDocIds(new Set());
                        else setSelectedDocIds(new Set(displayedDocs.map(d => d.id)));
                      }}
                      className="text-[11px] font-medium text-zinc-500 hover:text-zinc-800"
                    >
                      {displayedDocs.every(d => selectedDocIds.has(d.id)) ? "Unselect all" : "Select all"}
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto min-h-0 -mx-4 px-4 pb-4">
                    <DocumentList
                      documents={displayedDocs}
                      selectedDocs={selectedDocIds}
                      onToggleSelect={toggleDocSelection}
                      onDelete={handleDocumentRemoved}
                      onView={(doc) => { setViewerDocId(doc.id); setShowDocViewer(true); }}
                      onToast={addToast}
                      isNotebookLMStyle={true}
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Collapsed Button */}
          <div className={`absolute top-4 left-0 transition-all duration-300 ease-in-out ${!sidebarOpen ? "opacity-100 pointer-events-auto delay-100" : "opacity-0 pointer-events-none scale-75"}`}>
            <button 
              onClick={() => setSidebarOpen(true)}
              className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm border border-zinc-200/50 hover:bg-zinc-50"
            >
              <svg className="w-5 h-5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>

        {/* Left Resize Handle */}
        {sidebarOpen && (
          <div
            className="w-2 flex-shrink-0 cursor-col-resize group flex items-center justify-center z-20 -mx-0.5"
            onMouseDown={(e) => { e.preventDefault(); isResizingLeft.current = true; document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'; }}
          >
            <div className="w-1 h-12 rounded-full bg-zinc-200 group-hover:bg-zinc-400 group-active:bg-blue-500 transition-colors" />
          </div>
        )}

        {/* MIDDLE CARD - Chat */}
        <div className="flex-1 bg-white rounded-3xl flex flex-col shadow-sm border border-zinc-200/50 overflow-hidden relative">
          <div className="p-4 border-b border-zinc-100 flex items-center justify-between">
            <span className="text-[15px] font-medium text-zinc-800">Chat</span>
            <div className="flex items-center gap-2 text-zinc-500">
              <button className="p-1.5 rounded-full hover:bg-zinc-100"><SlidersHorizontal className="w-4 h-4" /></button>
              <button className="p-1.5 rounded-full hover:bg-zinc-100"><MoreVertical className="w-4 h-4" /></button>
            </div>
          </div>
          
          <div ref={chatScrollRef} className="flex-1 overflow-y-auto bg-white">
            <div className="max-w-4xl mx-auto flex flex-col gap-0 py-6 px-6 pb-40">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <h2 className="text-2xl font-medium text-zinc-800 mb-2">Welcome to {notebook.title}</h2>
                  <p className="text-zinc-500 text-[15px]">Ask questions to generate insights based on your sources.</p>
                </div>
              )}
              {messages.map((m) => (
                <div key={m.id} className="animate-fade-in">
                  <MessageBubble message={m} isNotebookLMStyle={true} />
                </div>
              ))}
              <div ref={bottomRef} className="h-4" />
            </div>
          </div>

          {/* Floating Input Pill overlay gradient */}
          <div className="absolute bottom-0 left-0 right-0 pt-16 pb-4 px-6 pointer-events-none bg-gradient-to-t from-white via-white to-transparent">
            <div className="bg-[#f0f4f9] rounded-3xl border border-zinc-200/60 shadow-sm p-1.5 pl-5 pr-2 relative flex items-center pointer-events-auto">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;
                }}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question or create something"
                disabled={loading || notebookDocs.length === 0}
                rows={1}
                className="flex-1 bg-transparent resize-none outline-none text-[15px] text-zinc-800 placeholder-zinc-500 py-3 disabled:opacity-50 min-h-[44px]"
                style={{ lineHeight: "1.5" }}
              />
              <div className="flex items-center gap-3 self-end mb-2 mr-1">
                <span className="text-[12px] font-medium text-zinc-400 select-none">
                  {selectedDocIds.size} source{selectedDocIds.size !== 1 ? 's' : ''}
                </span>
                <button
                  onClick={() => handleSend()}
                  disabled={!input.trim() || loading || selectedDocIds.size === 0}
                  className="h-10 w-10 rounded-full bg-zinc-200 text-zinc-600 hover:bg-zinc-300 disabled:bg-zinc-100 disabled:text-zinc-300 flex items-center justify-center transition-colors"
                >
                  {loading
                    ? <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                    : <ArrowLeft className="w-5 h-5 rotate-180" />
                  }
                </button>
              </div>
            </div>
            <p className="text-center text-[11px] text-zinc-400 mt-2 font-medium">
              FolioML can be inaccurate; please double check its responses.
            </p>
          </div>
        </div>

        {/* Right Resize Handle */}
        {rightSidebarOpen && (
          <div
            className="w-2 flex-shrink-0 cursor-col-resize group flex items-center justify-center z-20 -mx-0.5"
            onMouseDown={(e) => { e.preventDefault(); isResizingRight.current = true; document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'; }}
          >
            <div className="w-1 h-12 rounded-full bg-zinc-200 group-hover:bg-zinc-400 group-active:bg-blue-500 transition-colors" />
          </div>
        )}

        {/* RIGHT CARD - Studio */}
        <div className={`flex-shrink-0 transition-all duration-300 ease-in-out relative h-full z-10`} style={{ width: rightSidebarOpen ? rightWidth : 48 }}>
          {/* Expanded Sidebar */}
          <div className={`absolute top-0 right-0 h-full bg-white rounded-3xl flex flex-col shadow-sm border border-zinc-200/50 overflow-hidden transition-all duration-300 ease-in-out origin-right ${rightSidebarOpen ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-95 pointer-events-none"}`} style={{ width: rightWidth }}>
            <div className="p-4 border-b border-zinc-100 flex items-center justify-between">
              <span className="text-[15px] font-medium text-zinc-800">Studio</span>
              <button onClick={() => setRightSidebarOpen(false)} className="p-1.5 rounded-full hover:bg-zinc-100 text-zinc-500">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <NotebookView
                hasDocuments={notebookDocs.length > 0}
                selectedDocs={Array.from(selectedDocIds)}
                onToast={addToast}
                onDocumentAdded={handleDocumentAdded}
                isNotebookLMStyle={true}
              />
            </div>
          </div>

          {/* Collapsed Button */}
          <div className={`absolute top-4 right-0 transition-all duration-300 ease-in-out ${!rightSidebarOpen ? "opacity-100 pointer-events-auto delay-100" : "opacity-0 pointer-events-none scale-75"}`}>
            <button 
              onClick={() => setRightSidebarOpen(true)}
              className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm border border-zinc-200/50 hover:bg-zinc-50"
            >
              <svg className="w-5 h-5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" /></svg>
            </button>
          </div>
        </div>
      </div>

      <WebSearchModal
        isOpen={showWebSearchModal}
        onImportSuccess={handleDocumentAdded}
        onToast={addToast}
        onClose={() => setShowWebSearchModal(false)}
        initialQuery={sidebarSearchQuery}
        initialResults={sidebarSearchResults}
      />

      <DocumentViewerModal
        isOpen={showDocViewer}
        documentId={viewerDocId}
        onClose={() => { setShowDocViewer(false); setViewerDocId(null); }}
        onToast={addToast}
      />
    </div>
  );
}
