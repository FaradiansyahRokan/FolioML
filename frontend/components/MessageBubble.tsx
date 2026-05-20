"use client";

import { ChatMessage } from "@/types";
import SourcesPanel from "./SourcesPanel";
import MarkdownRenderer from "./MarkdownRenderer";
import { useState } from "react";

interface Props { 
  message: ChatMessage; 
  isNotebookLMStyle?: boolean;
}

export default function MessageBubble({ message, isNotebookLMStyle }: Props) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={`flex w-full py-3 mb-2 rounded-xl transition-colors duration-150`}>
      <div className="flex gap-3 w-full">
        {/* Content */}
        <div className="flex-1 min-w-0 relative">
          
          {/* User Message */}
          {isUser && (
            <div className="bg-zinc-100/50 px-4 py-3 rounded-2xl w-fit max-w-[85%] ml-auto text-[14px] text-zinc-800">
              {message.content}
            </div>
          )}

          {/* Assistant Message */}
          {!isUser && (
            <div className="text-[14.5px] leading-relaxed text-zinc-800">
              {message.isLoading ? (
                <div className="flex items-center gap-1.5 h-7">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </div>
              ) : (
                <MarkdownRenderer content={message.content} isStreaming={message.isStreaming} />
              )}
            </div>
          )}

          {/* Copy action (NotebookLM style) */}
          {!isUser && !message.isLoading && message.content && (
            <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-zinc-100/60">
              <button
                onClick={handleCopy}
                className="p-1.5 rounded-full hover:bg-zinc-100 text-zinc-500 transition-colors"
                title="Copy"
              >
                {copied ? <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg> : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>}
              </button>
            </div>
          )}

          {/* Sources */}
          {!isUser && message.sources && message.sources.length > 0 && (
            <div className="mt-2"><SourcesPanel sources={message.sources} /></div>
          )}
        </div>
      </div>
    </div>
  );
}
