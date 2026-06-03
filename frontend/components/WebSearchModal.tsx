"use client";

import { useState, useEffect } from "react";
import { searchWebPreview, ingestUrl, WebSearchPreviewResult } from "@/services/api";
import { Document } from "@/types";

interface Props {
  isOpen: boolean;
  onImportSuccess: (doc: Document) => void;
  onToast: (message: string, type: "success" | "error" | "info") => void;
  onClose: () => void;
  initialQuery?: string;
  initialResults?: WebSearchPreviewResult[];
}

export default function WebSearchModal({ isOpen, onImportSuccess, onToast, onClose, initialQuery, initialResults }: Props) {
  const [query, setQuery] = useState(initialQuery || "");
  const [category, setCategory] = useState("all");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<WebSearchPreviewResult[]>(initialResults || []);
  const [searchedQuery, setSearchedQuery] = useState(initialQuery || "");
  
  useEffect(() => {
    if (isOpen) {
      if (initialQuery) {
        setQuery(initialQuery);
        setSearchedQuery(initialQuery);
      }
      if (initialResults && initialResults.length > 0) {
        setResults(initialResults);
      }
    }
  }, [isOpen, initialQuery, initialResults]);
  
  // Bulk selection state
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [importingUrls, setImportingUrls] = useState<Set<string>>(new Set());
  const [importedUrls, setImportedUrls] = useState<Set<string>>(new Set());

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setResults([]);
    setSelectedUrls(new Set());
    
    try {
      const data = await searchWebPreview(query, category);
      setResults(data.results);
      setSearchedQuery(data.query);
    } catch (err: unknown) {
      onToast(err instanceof Error ? err.message : "Search failed", "error");
    }
    setLoading(false);
  };

  const toggleSelection = (url: string) => {
    setSelectedUrls(prev => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const handleSelectAll = () => {
    const available = results.filter(r => !importedUrls.has(r.url)).map(r => r.url);
    if (selectedUrls.size === available.length && available.length > 0) {
      setSelectedUrls(new Set()); // Deselect all
    } else {
      setSelectedUrls(new Set(available)); // Select all available
    }
  };

  const handleBulkImport = async () => {
    const urlsToImport = Array.from(selectedUrls).filter(url => !importedUrls.has(url));
    if (urlsToImport.length === 0) return;

    setImportingUrls(new Set(urlsToImport));
    
    let successCount = 0;
    
    // Sequential import
    for (const url of urlsToImport) {
      const result = results.find(r => r.url === url);
      if (!result) continue;
      
      try {
        const res = await ingestUrl(result.url, result.title, result.snippet);
        onImportSuccess({
          id: res.document_id,
          name: res.document_name,
          page_count: res.page_count,
          chunk_count: res.chunks_created,
          created_at: new Date().toISOString(),
        });
        setImportedUrls(prev => new Set([...Array.from(prev), url]));
        successCount++;
      } catch (err: unknown) {
        onToast(`Gagal mengimpor: ${result.title.slice(0, 30)}...`, "error");
      }
      
      // Remove from importing queue so UI updates individually
      setImportingUrls(prev => {
        const next = new Set(prev);
        next.delete(url);
        return next;
      });
    }

    if (successCount > 0) {
      onToast(`${successCount} artikel berhasil diimpor ke Corpus`, "success");
    }
    
    setSelectedUrls(new Set());
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm transition-all duration-300 ${isOpen ? "opacity-100 visible" : "opacity-0 invisible pointer-events-none"}`} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden border border-ivory-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-ivory-200 bg-gradient-to-r from-iris-50 to-coral-50 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-iris-400 to-coral-400 flex items-center justify-center">
              <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 1116.65 16.65z" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-bold text-warm-800">Web Search & Preview</h2>
              <p className="text-[10px] text-warm-400">Pilih artikel yang ingin diimpor ke Corpus</p>
            </div>
          </div>
          <button onClick={onClose} className="h-7 w-7 rounded-lg flex items-center justify-center text-warm-400 hover:bg-ivory-200 hover:text-warm-700 transition-colors">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Search bar */}
        <form onSubmit={handleSearch} className="px-6 py-3 border-b border-ivory-100 flex-shrink-0 bg-white">
          <div className="flex gap-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={loading || importingUrls.size > 0}
              className="w-36 text-sm px-3 py-2.5 rounded-xl border border-ivory-300 focus:outline-none focus:border-iris-400 bg-zinc-50 text-zinc-700 disabled:opacity-50"
            >
              <option value="all">All Sources</option>
              <option value="academic">Academic / Paper</option>
              <option value="news_global">Global News</option>
              <option value="news_indonesia">Berita Indonesia</option>
              <option value="government">Government</option>
              <option value="tech_docs">Tech Docs / GitHub</option>
              <option value="science">Science & Health</option>
              <option value="business">Business & Tech</option>
            </select>
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari topik... misalnya: tren AI di 2026"
              disabled={loading || importingUrls.size > 0}
              className="flex-1 text-sm px-4 py-2.5 rounded-xl border border-ivory-300 focus:outline-none focus:border-iris-400 focus:ring-2 focus:ring-iris-100 disabled:opacity-50 bg-white"
            />
            <button
              type="submit"
              disabled={!query.trim() || loading || importingUrls.size > 0}
              className="px-5 py-2.5 bg-gradient-to-r from-iris-500 to-iris-600 hover:from-iris-600 hover:to-iris-700 text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
            >
              {loading ? (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 1116.65 16.65z" /></svg>
              )}
              {loading ? "Mencari..." : "Cari"}
            </button>
          </div>
        </form>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5 bg-slate-50/50">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="relative h-10 w-10">
                <div className="absolute inset-0 rounded-full border-2 border-iris-200 border-t-iris-500 animate-spin" />
              </div>
              <p className="text-sm text-warm-500 font-medium">Mencari artikel terpercaya...</p>
              <p className="text-xs text-warm-400">Mengambil hasil terbaik dari web</p>
            </div>
          )}

          {!loading && results.length === 0 && searchedQuery && (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-warm-400">
              <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <p className="text-sm font-medium">Tidak ada hasil ditemukan</p>
              <p className="text-xs">Coba kata kunci yang berbeda</p>
            </div>
          )}

          {!loading && results.length === 0 && !searchedQuery && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-warm-400">
              <svg className="h-12 w-12 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><circle cx="11" cy="11" r="8" /><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35" /></svg>
              <p className="text-sm font-medium">Ketik kueri pencarian di atas</p>
              <p className="text-xs text-center leading-relaxed max-w-xs">Hasil pencarian akan muncul di sini sebagai kartu artikel yang bisa kamu pilih untuk diimpor secara massal.</p>
            </div>
          )}

          {!loading && results.length > 0 && (
            <>
              <div className="flex items-center justify-between px-1 pb-1">
                <p className="text-[11px] font-semibold text-warm-400">
                  {results.length} hasil untuk <span className="text-iris-600">"{searchedQuery}"</span>
                </p>
                <button 
                  onClick={handleSelectAll}
                  disabled={importingUrls.size > 0}
                  className="flex items-center gap-1.5 text-[11px] font-bold text-iris-600 hover:text-iris-700 hover:bg-iris-50 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  {selectedUrls.size === results.filter(r => !importedUrls.has(r.url)).length && results.length > 0
                    ? "Batal Pilih Semua"
                    : "Pilih Semua"}
                </button>
              </div>
              
              {results.map((r) => {
                const isImported = importedUrls.has(r.url);
                const isImporting = importingUrls.has(r.url);
                const isSelected = selectedUrls.has(r.url);
                
                return (
                  <div
                    key={r.url}
                    onClick={() => { if (!isImported && !isImporting) toggleSelection(r.url); }}
                    className={`rounded-xl border p-4 transition-all relative ${
                      isImported ? "bg-emerald-50 border-emerald-200 opacity-80" 
                      : isSelected ? "bg-iris-50/50 border-iris-400 shadow-sm ring-1 ring-iris-200"
                      : "bg-white border-ivory-200 hover:border-iris-300 cursor-pointer hover:shadow-sm"
                    }`}
                  >
                    {/* Custom Checkbox */}
                    {!isImported && (
                      <div className="absolute top-4 right-4">
                        <div className={`h-5 w-5 rounded border flex items-center justify-center transition-colors shadow-sm ${
                          isSelected ? "bg-iris-500 border-iris-500 text-white" : "border-ivory-300 bg-white"
                        }`}>
                          {isSelected && <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                        </div>
                      </div>
                    )}
                    
                    {/* Success Icon */}
                    {isImported && (
                      <div className="absolute top-4 right-4 text-emerald-500 bg-emerald-100 rounded-full p-0.5">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      </div>
                    )}

                    {/* Source badge */}
                    <div className="flex items-center gap-1.5 mb-2 pr-8">
                      <img
                        src={`https://www.google.com/s2/favicons?sz=16&domain=${r.source_domain}`}
                        alt=""
                        className="h-4 w-4 rounded-sm"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                      <span className="text-xs font-semibold text-warm-500 truncate">{r.source_domain}</span>
                    </div>

                    {/* Title */}
                    <h3 className={`text-sm font-bold leading-snug mb-1.5 line-clamp-2 pr-8 ${isSelected ? "text-iris-900" : "text-warm-800"}`}>
                      {r.title}
                    </h3>

                    {/* Snippet */}
                    <p className="text-xs text-warm-500 leading-relaxed line-clamp-3 mb-3">{r.snippet}</p>

                    {/* URL + Action Status */}
                    <div className="flex items-center justify-between gap-2" onClick={e => e.stopPropagation()}>
                      <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-iris-500 hover:text-iris-700 hover:underline truncate max-w-[60%] font-medium">
                        {r.url}
                      </a>
                      
                      {isImported ? (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700">
                          Telah Diimpor
                        </span>
                      ) : isImporting ? (
                         <span className="flex items-center gap-1.5 text-[10px] font-bold text-iris-600">
                           <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                           Memproses...
                         </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-ivory-200 bg-white flex items-center justify-between flex-shrink-0">
          <div className="text-[11px] font-medium text-warm-500">
            {importedUrls.size > 0 && <span className="text-emerald-600 font-semibold">{importedUrls.size} selesai. </span>}
            {selectedUrls.size > 0 && <span>{selectedUrls.size} siap diimpor.</span>}
            {selectedUrls.size === 0 && importedUrls.size === 0 && <span>Pilih artikel untuk diimpor.</span>}
          </div>
          
          <div className="flex items-center gap-2.5">
            <button 
              onClick={onClose} 
              disabled={importingUrls.size > 0}
              className="text-xs font-semibold px-4 py-2.5 rounded-xl border border-ivory-300 text-warm-600 hover:bg-ivory-100 transition-colors disabled:opacity-50"
            >
              Tutup
            </button>
            <button 
              onClick={handleBulkImport}
              disabled={selectedUrls.size === 0 || importingUrls.size > 0}
              className="flex items-center gap-2 text-xs font-bold px-5 py-2.5 rounded-xl bg-gradient-to-r from-iris-500 to-iris-600 hover:from-iris-600 hover:to-iris-700 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-iris-200"
            >
              {importingUrls.size > 0 ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                  Mengimpor...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                  Import {selectedUrls.size > 0 ? `${selectedUrls.size} Artikel` : ""}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
