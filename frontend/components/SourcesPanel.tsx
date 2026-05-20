"use client";

import { SourceCitation } from "@/types";
import { useState } from "react";
import { BookOpen, ChevronDown, ChevronUp } from "lucide-react";

interface Props { sources: SourceCitation[]; }

function matchScore(similarity: number) {
  if (similarity >= 0.85) return { label: "High", color: "text-emerald-600 bg-emerald-50 border-emerald-200" };
  if (similarity >= 0.70) return { label: "Good", color: "text-amber-600 bg-amber-50 border-amber-200" };
  return { label: "Low", color: "text-zinc-500 bg-zinc-100 border-zinc-200" };
}

export default function SourcesPanel({ sources }: Props) {
  const [expanded, setExpanded] = useState(false);
  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-1 animate-fade-in">
      <button
        onClick={() => setExpanded(!expanded)}
        className="group flex items-center gap-2 text-[11px] font-semibold text-zinc-400 hover:text-zinc-700 transition-colors duration-150"
      >
        <BookOpen className="w-3.5 h-3.5" />
        <span>{sources.length} source{sources.length > 1 ? "s" : ""} cited</span>
        {expanded
          ? <ChevronUp className="w-3 h-3 transition-transform" />
          : <ChevronDown className="w-3 h-3 transition-transform" />}
      </button>

      {expanded && (
        <div className="mt-3 flex flex-col gap-2 animate-slide-down">
          {sources.map((source, i) => {
            const mp = Math.round(source.similarity * 100);
            const score = matchScore(source.similarity);
            return (
              <div
                key={i}
                className="group/card rounded-xl border border-zinc-200 bg-white px-3.5 py-3 shadow-subtle hover:shadow-float transition-all duration-200"
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="flex-shrink-0 w-5 h-5 rounded-md bg-zinc-100 text-zinc-600 text-[10px] font-bold flex items-center justify-center font-mono border border-zinc-200">
                      {i + 1}
                    </span>
                    <span className="text-[12px] font-semibold text-zinc-800 truncate">{source.document_name}</span>
                    {source.page !== undefined && source.page !== null && source.document_name.toLowerCase().endsWith('.pdf') && (
                      <span className="flex-shrink-0 px-1.5 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-[9px] font-mono text-blue-600">
                        p.{source.page}
                      </span>
                    )}
                  </div>
                  <span className={`flex-shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${score.color}`}>
                    {score.label} · {mp}%
                  </span>
                </div>
                <p className="text-[12px] text-zinc-500 leading-relaxed line-clamp-3 pl-7 italic border-l-2 border-zinc-100">
                  "{source.content_preview}"
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
