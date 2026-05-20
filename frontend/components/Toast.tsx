"use client";

import { useState } from "react";
import { ToastItem } from "@/types";

interface Props { toasts: ToastItem[]; onDismiss: (id: string) => void; }

const icons: Record<string, JSX.Element> = {
  success: <svg className="w-5 h-5 text-jade-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>,
  error: <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>,
  info: <svg className="w-5 h-5 text-iris-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
};

export default function ToastContainer({ toasts, onDismiss }: Props) {
  return (
    <div className="fixed top-6 right-6 z-50 flex flex-col gap-3 pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id} className="toast-enter pointer-events-auto flex items-center gap-3 px-5 py-3.5 rounded-xl bg-white border border-ivory-300 shadow-warm-lg max-w-sm">
          <div className="flex-shrink-0 p-1 rounded-md bg-ivory-100">{icons[toast.type]}</div>
          <span className="text-sm font-medium text-warm-800">{toast.message}</span>
          <button onClick={() => onDismiss(toast.id)} className="ml-auto text-warm-400 hover:text-warm-700 flex-shrink-0 p-1 rounded-md hover:bg-ivory-200 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      ))}
    </div>
  );
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  function addToast(message: string, type: "success" | "error" | "info" = "info") {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }
  function dismissToast(id: string) { setToasts((prev) => prev.filter((t) => t.id !== id)); }
  return { toasts, addToast, dismissToast };
}
