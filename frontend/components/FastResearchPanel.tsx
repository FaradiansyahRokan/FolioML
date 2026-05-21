"use client";

import { useState, useRef } from "react";
import { streamFastResearch } from "@/services/api";
import { SourceCitation } from "@/types";
import { Send, Loader, AlertCircle, Zap } from "lucide-react";

export default function FastResearchPanel() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<SourceCitation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showSources, setShowSources] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const getSourceBadgeColor = (category: string): string => {
    const colors: Record<string, string> = {
      REFERENCE: "bg-purple-100 text-purple-800",
      ACADEMIC: "bg-blue-100 text-blue-800",
      NEWS_GLOBAL: "bg-green-100 text-green-800",
      NEWS_INDONESIA: "bg-green-100 text-green-800",
      SCIENCE: "bg-indigo-100 text-indigo-800",
      TECH_DOCS: "bg-cyan-100 text-cyan-800",
      GOVERNMENT: "bg-orange-100 text-orange-800",
      BUSINESS: "bg-amber-100 text-amber-800",
    };
    return colors[category] || "bg-gray-100 text-gray-800";
  };

  const getCredibilityStars = (score: number): string => {
    if (score >= 0.95) return "⭐⭐⭐⭐⭐";
    if (score >= 0.85) return "⭐⭐⭐⭐";
    if (score >= 0.75) return "⭐⭐⭐";
    if (score >= 0.65) return "⭐⭐";
    return "⭐";
  };

  const handleSearch = async () => {
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setAnswer("");
    setSources([]);
    setShowSources(false);

    try {
      let fullAnswer = "";

      await streamFastResearch(
        query,
        5,
        (token) => {
          fullAnswer += token;
          setAnswer(fullAnswer);
        },
        (newSources) => {
          setSources(newSources);
          setShowSources(true);
        },
        () => {
          setLoading(false);
        },
        (err) => {
          setError(err);
          setLoading(false);
        }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSearch();
    }
  };

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-slate-50 to-slate-100 rounded-lg border border-slate-200">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 bg-white rounded-t-lg">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-5 h-5 text-amber-500" />
          <h2 className="font-bold text-lg text-slate-800">Fast Research</h2>
          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-semibold">
            Trusted Sources Only
          </span>
        </div>
        <p className="text-sm text-slate-600">
          Search dari Wikipedia, Berita, dan Artikel Akademik (tidak Instagram/YouTube)
        </p>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Answer Display */}
        {answer && (
          <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
            <h3 className="font-semibold text-slate-800 mb-3">Hasil Riset</h3>
            <div className="text-slate-700 leading-relaxed whitespace-pre-wrap">{answer}</div>
          </div>
        )}

        {/* Sources List */}
        {showSources && sources.length > 0 && (
          <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
            <h3 className="font-semibold text-slate-800 mb-3">📚 Sumber Terpercaya</h3>
            <div className="space-y-3">
              {sources.map((source, idx) => {
                const category = source.section
                  ?.match(/Web Search \(([^)]+)\)/)?.[1]
                  ?.toUpperCase()
                  .replace(/_/g, "_") || "UNKNOWN";

                return (
                  <div
                    key={idx}
                    className="border border-slate-200 rounded-lg p-3 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start gap-2 mb-2">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${getSourceBadgeColor(category)}`}>
                        {category}
                      </span>
                      <span className="text-xs text-amber-600 font-semibold">
                        {getCredibilityStars((source as any).credibility_score || source.similarity)}
                      </span>
                    </div>

                    <a
                      href={(source as any).source_url || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold text-blue-600 hover:underline block mb-2 truncate"
                      title={source.document_name}
                    >
                      {source.document_name}
                    </a>

                    <p className="text-sm text-slate-600 line-clamp-2">{source.content_preview}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-800">Error</p>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!answer && !error && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Zap className="w-12 h-12 text-amber-300 mb-3 opacity-50" />
            <p className="text-slate-600 font-medium">Cari dari sumber terpercaya</p>
            <p className="text-xs text-slate-500 mt-1">Wikipedia • Berita • Akademik • Pemerintah</p>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-slate-200 bg-white rounded-b-lg p-4">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            placeholder="Cari dari sumber terpercaya..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={loading}
            className="flex-1 px-4 py-3 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white disabled:opacity-50 disabled:cursor-not-allowed text-slate-900 placeholder-slate-500"
          />
          <button
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            className="px-4 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                Searching...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Search
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
