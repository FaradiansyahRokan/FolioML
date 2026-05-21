"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import "katex/dist/katex.min.css";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

interface Props {
  content: string;
  isStreaming?: boolean;
}

export default function MarkdownRenderer({ content, isStreaming }: Props) {
  // Pre-process citations like [1], [2] into markdown links [1](#cite-1)
  const processedContent = content.replace(/\[(\d+)\]/g, "[$1](#cite-$1)");

  return (
    <div className={`markdown-body ${isStreaming ? "typing-cursor" : ""}`}>
      <ReactMarkdown 
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          a: ({node, ...props}) => {
            if (props.href?.startsWith('#cite-')) {
              const id = props.href.replace('#cite-', '');
              return (
                <span 
                  className="inline-flex items-center justify-center w-4 h-4 mx-0.5 text-[10px] font-bold text-blue-700 bg-blue-100/80 border border-blue-200 rounded-full cursor-pointer hover:bg-blue-600 hover:text-white transition-all shadow-sm translate-y-[-4px]"
                  title={`Click to view source [${id}]`}
                  onClick={() => {
                    const toggleBtn = document.getElementById('sources-toggle-btn');
                    let el = document.getElementById(`source-card-${id}`);
                    
                    if (!el && toggleBtn) {
                      toggleBtn.click();
                      // Wait a beat for the DOM to render the expanded panel
                      setTimeout(() => {
                        const foundEl = document.getElementById(`source-card-${id}`);
                        if (foundEl) {
                          foundEl.scrollIntoView({behavior: 'smooth', block: 'center'});
                          foundEl.classList.add('ring-2', 'ring-blue-500', 'bg-blue-50');
                          setTimeout(() => foundEl.classList.remove('ring-2', 'ring-blue-500', 'bg-blue-50'), 2000);
                        }
                      }, 150);
                    } else if (el) {
                      el.scrollIntoView({behavior: 'smooth', block: 'center'});
                      el.classList.add('ring-2', 'ring-blue-500', 'bg-blue-50');
                      setTimeout(() => el.classList.remove('ring-2', 'ring-blue-500', 'bg-blue-50'), 2000);
                    }
                  }}
                >
                  {id}
                </span>
              );
            }
            return <a {...props} className="text-blue-600 hover:underline" />;
          }
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
