"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { Notebook } from "@/types";
import { Plus, MoreVertical, Search, Grid, List, ChevronDown, Settings, Trash2, Pencil, X } from "lucide-react";

const EMOJIS = ["📚", "🔬", "💡", "🧠", "📝", "🔍", "⚗️", "🗂️", "📊", "🌐", "🧬", "🏛️", "🚀", "📓", "🤖"];
const PASTEL_COLORS = [
  "bg-[#e8f0fe]",
  "bg-[#fce8e6]",
  "bg-[#e6f4ea]",
  "bg-[#fef7e0]",
  "bg-[#f3e8fd]",
  "bg-[#e4f7fb]",
];

const STORAGE_KEY = "folioml_notebooks";

function genId() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getColorForId(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return PASTEL_COLORS[Math.abs(hash) % PASTEL_COLORS.length];
}

type SortMode = "recent" | "oldest" | "az" | "za";

export default function HomePage() {
  const router = useRouter();
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [loaded, setLoaded] = useState(false);

  // UI state
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newEmoji, setNewEmoji] = useState("📓");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const searchInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setNotebooks(JSON.parse(saved));
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) localStorage.setItem(STORAGE_KEY, JSON.stringify(notebooks));
  }, [notebooks, loaded]);

  useEffect(() => {
    if (showSearch) searchInputRef.current?.focus();
  }, [showSearch]);

  useEffect(() => {
    if (renameId) setTimeout(() => renameInputRef.current?.select(), 50);
  }, [renameId]);

  function createNotebook() {
    const title = newTitle.trim() || "Untitled notebook";
    const nb: Notebook = {
      id: genId(),
      title,
      emoji: newEmoji,
      documentIds: [],
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setNotebooks((p) => [nb, ...p]);
    setCreating(false);
    setNewTitle("");
    setNewEmoji("📓");
    router.push(`/notebook/${nb.id}`);
  }

  function deleteNotebook(id: string) {
    setNotebooks((p) => p.filter((n) => n.id !== id));
    setDeleteId(null);
  }

  function startRename(nb: Notebook) {
    setRenameId(nb.id);
    setRenameValue(nb.title);
    setOpenMenuId(null);
  }

  function saveRename() {
    const trimmed = renameValue.trim();
    if (!trimmed || !renameId) { setRenameId(null); return; }
    setNotebooks((p) => p.map((n) => n.id === renameId ? { ...n, title: trimmed, updatedAt: new Date().toISOString() } : n));
    setRenameId(null);
  }

  const sortLabels: Record<SortMode, string> = {
    recent: "Most recent",
    oldest: "Oldest first",
    az: "A → Z",
    za: "Z → A",
  };

  const filtered = notebooks
    .filter((nb) => !searchQuery || nb.title.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortMode === "recent") return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      if (sortMode === "oldest") return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      if (sortMode === "az") return a.title.localeCompare(b.title);
      if (sortMode === "za") return b.title.localeCompare(a.title);
      return 0;
    });

  return (
    <div className="min-h-screen bg-white font-sans text-zinc-900">
      {/* Top Nav */}
      <header className="h-[64px] flex items-center justify-between px-6 border-b border-zinc-100">
        <div className="flex items-center gap-1.5">
          <svg className="w-7 h-7 text-zinc-800" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
          </svg>
          <span className="text-xl font-medium tracking-tight text-zinc-800">FolioML</span>
        </div>
        <div className="flex items-center gap-3">
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-6 py-8">

        {/* Sub-header / Filters */}
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-2 bg-zinc-100/50 p-1 rounded-full border border-zinc-200">
            <button className="px-4 py-1.5 rounded-full bg-white shadow-sm text-sm font-medium text-zinc-800">All</button>
            <button className="px-4 py-1.5 rounded-full text-sm font-medium text-zinc-500 hover:text-zinc-800">Recent</button>
          </div>

          <div className="flex items-center gap-3">
            {/* Search */}
            {showSearch ? (
              <div className="flex items-center bg-zinc-50 border border-zinc-200 rounded-full px-3 py-1.5 gap-2">
                <Search className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search notebooks…"
                  className="bg-transparent outline-none text-sm text-zinc-800 placeholder-zinc-400 w-44"
                />
                <button onClick={() => { setShowSearch(false); setSearchQuery(""); }} className="text-zinc-400 hover:text-zinc-700">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button onClick={() => setShowSearch(true)} className="w-9 h-9 flex items-center justify-center rounded-full border border-zinc-200 text-zinc-600 hover:bg-zinc-50">
                <Search className="w-4 h-4" />
              </button>
            )}

            {/* View toggle */}
            <div className="flex items-center bg-zinc-50 border border-zinc-200 rounded-lg p-0.5">
              <button onClick={() => setViewMode("grid")} className={`p-1.5 rounded transition-colors ${viewMode === "grid" ? "bg-white shadow-sm text-zinc-800" : "text-zinc-400 hover:text-zinc-800"}`}>
                <Grid className="w-4 h-4" />
              </button>
              <button onClick={() => setViewMode("list")} className={`p-1.5 rounded transition-colors ${viewMode === "list" ? "bg-white shadow-sm text-zinc-800" : "text-zinc-400 hover:text-zinc-800"}`}>
                <List className="w-4 h-4" />
              </button>
            </div>

            {/* Sort */}
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setShowSortMenu(!showSortMenu)}
                className="flex items-center gap-2 px-4 py-2 rounded-full border border-zinc-200 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                {sortLabels[sortMode]} <ChevronDown className="w-4 h-4" />
              </button>
              {showSortMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowSortMenu(false)} />
                  <div className="absolute right-0 top-11 w-44 bg-white rounded-xl shadow-lg border border-zinc-100 py-1.5 z-20">
                    {(Object.entries(sortLabels) as [SortMode, string][]).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => { setSortMode(key); setShowSortMenu(false); }}
                        className={`w-full px-4 py-2 text-left text-sm hover:bg-zinc-50 ${sortMode === key ? "font-semibold text-zinc-900" : "text-zinc-700"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <button
              onClick={() => setCreating(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-black text-white text-sm font-medium hover:bg-zinc-800 transition-colors ml-2 shadow-sm"
            >
              <Plus className="w-4 h-4" /> Create new
            </button>
          </div>
        </div>

        {/* Notebooks Section */}
        <div>
          <h2 className="text-xl font-normal text-zinc-800 mb-6">
            {searchQuery ? `Results for "${searchQuery}"` : "Recent notebooks"}
            {searchQuery && <span className="text-zinc-400 text-base ml-2">({filtered.length})</span>}
          </h2>

          {viewMode === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {/* Create New Card */}
              <div
                onClick={() => setCreating(true)}
                className="h-[180px] rounded-[20px] border border-zinc-200 bg-white hover:bg-zinc-50 transition-colors cursor-pointer flex flex-col items-center justify-center gap-4 group"
              >
                <div className="w-10 h-10 rounded-full bg-[#e8f0fe] text-blue-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Plus className="w-5 h-5" />
                </div>
                <span className="text-[15px] text-zinc-700 font-medium">Create new notebook</span>
              </div>

              {filtered.map((nb) => {
                const bgClass = getColorForId(nb.id);
                const isMenuOpen = openMenuId === nb.id;
                const emoji = EMOJIS.includes(nb.emoji) ? nb.emoji : "📓";

                return (
                  <div
                    key={nb.id}
                    onClick={() => router.push(`/notebook/${nb.id}`)}
                    className={`h-[180px] rounded-[20px] ${bgClass} p-5 cursor-pointer relative flex flex-col group transition-all hover:-translate-y-0.5 hover:shadow-md`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="text-2xl select-none">{emoji}</div>

                      <button
                        onClick={(e) => { e.stopPropagation(); setOpenMenuId(isMenuOpen ? null : nb.id); }}
                        className="w-8 h-8 rounded-full hover:bg-black/10 flex items-center justify-center text-zinc-600 transition-colors"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {isMenuOpen && (
                        <>
                          <div className="fixed inset-0 z-10 cursor-default" onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); }} />
                          <div
                            className="absolute top-12 right-4 w-44 bg-white rounded-xl shadow-lg border border-zinc-100 py-1.5 z-20"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={(e) => { e.stopPropagation(); startRename(nb); }}
                              className="w-full px-4 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 flex items-center gap-2"
                            >
                              <Pencil className="w-4 h-4" /> Rename
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setDeleteId(nb.id); setOpenMenuId(null); }}
                              className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                            >
                              <Trash2 className="w-4 h-4" /> Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="mt-auto mb-1">
                      {renameId === nb.id ? (
                        <input
                          ref={renameInputRef}
                          value={renameValue}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={saveRename}
                          onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") saveRename(); if (e.key === "Escape") setRenameId(null); }}
                          className="text-lg font-medium text-zinc-900 bg-white/70 border border-zinc-300 rounded-lg px-2 py-1 outline-none focus:border-zinc-500 w-full"
                        />
                      ) : (
                        <h3 className="text-lg font-medium text-zinc-900 leading-tight truncate">{nb.title}</h3>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 text-[12px] text-zinc-500 font-medium">
                      <span>{formatDate(nb.updatedAt)}</span>
                      <span>•</span>
                      <span>{nb.documentIds.length} source{nb.documentIds.length !== 1 ? "s" : ""}</span>
                    </div>
                  </div>
                );
              })}

              {filtered.length === 0 && searchQuery && (
                <div className="col-span-full text-center py-16 text-zinc-400">
                  <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No notebooks match "{searchQuery}"</p>
                </div>
              )}
            </div>
          ) : (
            /* List view */
            <div className="flex flex-col gap-2">
              {filtered.map((nb) => {
                const isMenuOpen = openMenuId === nb.id;
                const emoji = EMOJIS.includes(nb.emoji) ? nb.emoji : "📓";
                return (
                  <div
                    key={nb.id}
                    onClick={() => router.push(`/notebook/${nb.id}`)}
                    className="flex items-center gap-4 px-4 py-3 rounded-2xl border border-zinc-100 hover:border-zinc-200 hover:bg-zinc-50 cursor-pointer relative group transition-colors"
                  >
                    <span className="text-2xl flex-shrink-0">{emoji}</span>
                    <div className="flex-1 min-w-0">
                      {renameId === nb.id ? (
                        <input
                          ref={renameInputRef}
                          value={renameValue}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={saveRename}
                          onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") saveRename(); if (e.key === "Escape") setRenameId(null); }}
                          className="text-sm font-medium text-zinc-900 bg-zinc-100 border border-zinc-300 rounded-lg px-2 py-1 outline-none focus:border-zinc-500 w-full"
                        />
                      ) : (
                        <p className="text-sm font-medium text-zinc-900 truncate">{nb.title}</p>
                      )}
                      <p className="text-xs text-zinc-400">{formatDate(nb.updatedAt)} · {nb.documentIds.length} source{nb.documentIds.length !== 1 ? "s" : ""}</p>
                    </div>
                    <div className="relative" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={(e) => { e.stopPropagation(); setOpenMenuId(isMenuOpen ? null : nb.id); }}
                        className="w-8 h-8 rounded-full hover:bg-zinc-200 flex items-center justify-center text-zinc-500 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      {isMenuOpen && (
                        <>
                          <div className="fixed inset-0 z-10 cursor-default" onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); }} />
                          <div className="absolute right-0 top-9 w-44 bg-white rounded-xl shadow-lg border border-zinc-100 py-1.5 z-20" onClick={(e) => e.stopPropagation()}>
                            <button onClick={(e) => { e.stopPropagation(); startRename(nb); }} className="w-full px-4 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 flex items-center gap-2">
                              <Pencil className="w-4 h-4" /> Rename
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setDeleteId(nb.id); setOpenMenuId(null); }} className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
                              <Trash2 className="w-4 h-4" /> Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}

              {filtered.length === 0 && !searchQuery && (
                <div className="text-center py-16 text-zinc-400">
                  <p className="text-sm">No notebooks yet. Create one to get started.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Create Modal */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setCreating(false)}>
          <div className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-3xl shadow-xl w-full max-w-md p-8" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-2xl font-normal text-zinc-900 mb-6">Create new notebook</h2>
            <div className="mb-6">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createNotebook()}
                placeholder="Untitled notebook"
                autoFocus
                className="w-full px-0 py-3 bg-transparent border-b-2 border-zinc-200 text-xl font-medium text-zinc-900 placeholder:text-zinc-400 outline-none focus:border-blue-600 transition-colors"
              />
            </div>
            <div className="mb-8">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Cover Emoji</p>
              <div className="flex flex-wrap gap-2">
                {EMOJIS.map((em) => (
                  <button
                    key={em}
                    onClick={() => setNewEmoji(em)}
                    className={`w-10 h-10 rounded-full text-xl flex items-center justify-center transition-all ${
                      newEmoji === em ? "bg-blue-100 border border-blue-200 scale-110" : "hover:bg-zinc-100 border border-transparent"
                    }`}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setCreating(false)} className="px-5 py-2 rounded-full text-sm font-medium text-zinc-600 hover:bg-zinc-100 transition-colors">Cancel</button>
              <button onClick={createNotebook} className="px-5 py-2 rounded-full bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm">Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setDeleteId(null)}>
          <div className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-medium text-zinc-900 mb-2">Delete notebook?</h2>
            <p className="text-sm text-zinc-600 mb-6">This action cannot be undone. All chat history and document references will be removed.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteId(null)} className="px-5 py-2 rounded-full text-sm font-medium text-zinc-600 hover:bg-zinc-100 transition-colors">Cancel</button>
              <button onClick={() => deleteNotebook(deleteId)} className="px-5 py-2 rounded-full bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
