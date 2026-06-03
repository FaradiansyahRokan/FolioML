import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair", display: "swap" });

import { ClerkProvider } from '@clerk/nextjs'

export const metadata: Metadata = {
  title: "FolioML — Research Intelligence",
  description: "AI-powered research assistant for deep document analysis and knowledge synthesis.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body suppressHydrationWarning className={`${inter.variable} ${playfair.variable} font-sans bg-white text-zinc-800 antialiased`}>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
