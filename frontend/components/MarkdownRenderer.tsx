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
  return (
    <div className={`markdown-body ${isStreaming ? "typing-cursor" : ""}`}>
      <ReactMarkdown 
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
