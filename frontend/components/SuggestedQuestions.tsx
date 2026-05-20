"use client";

interface Props { onSelect: (question: string) => void; }

const SUGGESTIONS = [
  { icon: "📋", text: "Apa ringkasan utama dari dokumen ini?" },
  { icon: "🔑", text: "Apa poin-poin kunci yang dibahas?" },
  { icon: "📊", text: "Adakah data atau angka penting di sini?" },
  { icon: "🔍", text: "Jelaskan topik utama secara mendalam" },
];

export default function SuggestedQuestions({ onSelect }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2 max-w-lg w-full mt-8 animate-slide-up">
      {SUGGESTIONS.map((s, i) => (
        <button
          key={i}
          onClick={() => onSelect(s.text)}
          className="group flex flex-col items-start gap-2 p-3.5 rounded-xl border border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-float text-left transition-all duration-200 btn-press"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <span className="text-lg leading-none">{s.icon}</span>
          <span className="text-[12px] font-medium text-zinc-700 group-hover:text-zinc-900 leading-snug transition-colors">
            {s.text}
          </span>
        </button>
      ))}
    </div>
  );
}
