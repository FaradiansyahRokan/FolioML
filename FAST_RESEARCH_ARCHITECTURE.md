# 🎯 Fast Research - Architecture & Flow Diagram

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js)                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────┐      ┌──────────────────────┐    │
│  │ FastResearchPanel    │      │ API Functions        │    │
│  │ Component (React)    │      │                      │    │
│  │                      │      │ • fastResearch()     │    │
│  │ • Search input       │      │ • streamFastResearch()│   │
│  │ • Real-time tokens   │  →   │                      │    │
│  │ • Source badges      │      │ (frontend/services/  │    │
│  │ • Credibility stars  │      │  api.ts)             │    │
│  └──────────────────────┘      └──────────────────────┘    │
│           │                              │                 │
└───────────┼──────────────────────────────┼─────────────────┘
            │                              │
            └──────────────────┬───────────┘
                               │
                        HTTP/JSON Stream
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                  BACKEND (FastAPI)                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ POST /api/research                                   │  │
│  │ POST /api/research/stream                            │  │
│  │                                                      │  │
│  │ Endpoints (routes/chat.py)                           │  │
│  │ • Non-streaming & streaming support                  │  │
│  │ • Query validation                                   │  │
│  │ • Error handling                                     │  │
│  └──────────────────────────────────────────────────────┘  │
│           │                                                  │
│           ▼                                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ _fetch_web_fallback() — Updated with Filtering       │  │
│  │                                                      │  │
│  │ 1. Search: DDGS (DuckDuckGo)                         │  │
│  │    fetch 3x results to account for filtering         │  │
│  │                                                      │  │
│  │ 2. Filter: Apply trusted_sources validation          │  │
│  │    ↓                                                 │  │
│  │    filter_trusted_results()                          │  │
│  │    ↓                                                 │  │
│  │    Only domains in TRUSTED_DOMAINS pass through      │  │
│  │                                                      │  │
│  │ 3. Rank: Sort by credibility score                   │  │
│  │    ↓                                                 │  │
│  │    rank_by_credibility()                             │  │
│  │    ↓                                                 │  │
│  │    (Wikipedia 0.95 > News 0.80 > Blogs 0.70)         │  │
│  │                                                      │  │
│  │ 4. Fetch: Get content from URL (5s timeout each)     │  │
│  │                                                      │  │
│  │ 5. Enrich: Add metadata                              │  │
│  │    • source_category (ACADEMIC, NEWS, etc)           │  │
│  │    • credibility_score                               │  │
│  │    • source_url                                      │  │
│  └──────────────────────────────────────────────────────┘  │
│           │                                                  │
│           ▼                                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ LLM Service (generate_answer / stream_answer)        │  │
│  │                                                      │  │
│  │ • Combine prompt + trusted sources                   │  │
│  │ • Generate answer using LLM (OpenAI/Ollama/Claude)   │  │
│  │ • Support streaming tokens                           │  │
│  └──────────────────────────────────────────────────────┘  │
│           │                                                  │
└───────────┼──────────────────────────────────────────────────┘
            │
            │  NDJSON Stream Response
            │  {"type":"sources","sources":[...]}
            │  {"type":"token","content":"Machine"}
            │  {"type":"token","content":" learning"}
            │  ...
            │  {"type":"done"}
            │
┌───────────▼──────────────────────────────────────────────────┐
│           FRONTEND - Display Response                        │
│                                                              │
│  • Show answer tokens real-time                             │
│  • Display sources with badges & stars                      │
│  • Show credibility ratings                                 │
│  • Link to original articles                                │
└──────────────────────────────────────────────────────────────┘
```

---

## Trusted Sources Filter Flow

```
                    DDGS Search Results
                           │
                    ┌──────▼──────┐
                    │  All Results │
                    │  (50-100)    │
                    └──────┬──────┘
                           │
                ┌──────────▼──────────┐
                │                     │
         ┌──────▼──────────┐   ┌─────▼────────────┐
         │  Instagram      │   │  Wikipedia       │
         │  YouTube        │   │  ✓ TRUSTED       │
         │  TikTok         │   └──────┬───────────┘
         │  Reddit         │          │
         │  Twitter        │   ┌──────▼──────────┐
         │  Facebook       │   │  ArXiv.org      │
         │  ✗ BLOCKED      │   │  ✓ TRUSTED      │
         └─────────────────┘   └──────┬───────────┘
                │                     │
                ├─────────────────────┤
                │                     │
         ┌──────▼──────────┐   ┌─────▼────────────┐
         │  Medium.com     │   │  Kompas.com      │
         │  ✓ TRUSTED      │   │  ✓ TRUSTED       │
         └─────────────────┘   └──────┬───────────┘
                │                     │
                ├─────────────────────┤
                │                     │
         ┌──────▼──────────┐   ┌─────▼────────────┐
         │  StackOverflow  │   │  GitHub          │
         │  ✓ TRUSTED      │   │  ✓ TRUSTED       │
         └──────┬──────────┘   └──────┬───────────┘
                │                     │
                └──────────┬──────────┘
                           │
                ┌──────────▼──────────┐
                │ Filtered Results    │
                │ (10-15 kept)        │
                └──────────┬──────────┘
                           │
                ┌──────────▼──────────┐
                │ Rank by Credibility │
                │                     │
                │ 1. Wikipedia: 0.95  │
                │ 2. ArXiv: 0.90      │
                │ 3. Kompas: 0.80     │
                │ 4. Medium: 0.75     │
                │ 5. GitHub: 0.75     │
                └──────────┬──────────┘
                           │
                ┌──────────▼──────────┐
                │   Top 5 Results     │
                │   (Ready for LLM)   │
                └─────────────────────┘
```

---

## Source Category Breakdown

```
┌─────────────────────────────────────────────────────────┐
│           Trusted Sources by Category                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ 🔷 REFERENCE (0.95) ⭐⭐⭐⭐⭐                           │
│    • Wikipedia (all languages)                          │
│    • Britannica                                         │
│                                                         │
│ 🔷 ACADEMIC (0.90) ⭐⭐⭐⭐                             │
│    • ArXiv.org                                          │
│    • Google Scholar                                     │
│    • JSTOR                                              │
│    • ResearchGate                                       │
│    • NCBI/PubMed                                        │
│                                                         │
│ 🔷 NEWS_GLOBAL (0.80) ⭐⭐⭐⭐                          │
│    • Reuters                                            │
│    • BBC                                                │
│    • Bloomberg                                          │
│    • AP News                                            │
│    • The Guardian                                       │
│    • CNN                                                │
│    • Al Jazeera                                         │
│                                                         │
│ 🔷 NEWS_INDONESIA (0.80) ⭐⭐⭐⭐                       │
│    • Kompas.com                                         │
│    • CNN Indonesia                                      │
│    • Tribun News                                        │
│    • Detik.com                                          │
│    • Liputan6.com                                       │
│    • Merdeka.com                                        │
│    • Tirto.id                                           │
│                                                         │
│ 🔷 SCIENCE (0.85) ⭐⭐⭐⭐                              │
│    • Nature.com                                         │
│    • Science Daily                                      │
│    • Mayo Clinic                                        │
│    • WebMD                                              │
│                                                         │
│ 🔷 TECH_DOCS (0.75) ⭐⭐⭐                              │
│    • GitHub                                             │
│    • Stack Overflow                                     │
│    • Medium (verified)                                  │
│    • Dev.to                                             │
│    • Official Documentation                             │
│                                                         │
│ 🔷 GOVERNMENT (0.90) ⭐⭐⭐⭐                           │
│    • All .gov domains                                   │
│    • All .go.id domains (Indonesia)                     │
│    • All .edu domains                                   │
│                                                         │
│ 🔷 BUSINESS (0.70) ⭐⭐⭐                               │
│    • Forbes                                             │
│    • TechCrunch                                         │
│    • Business Insider                                   │
│    • VentureBeat                                        │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Blocked Sources

```
╔═════════════════════════════════════════════════════════╗
║         BLOCKED - Social Media & Low Quality            ║
╠═════════════════════════════════════════════════════════╣
║                                                         ║
║  ✗ Instagram.com                                       ║
║  ✗ TikTok.com                                          ║
║  ✗ Facebook.com                                        ║
║  ✗ Twitter.com / X.com                                 ║
║  ✗ YouTube.com                                         ║
║  ✗ Reddit.com                                          ║
║  ✗ Pinterest.com                                       ║
║  ✗ Quora.com                                           ║
║  ✗ Tumblr.com                                          ║
║  ✗ Threads.net                                         ║
║  ✗ URL Shorteners (bit.ly, tinyurl, etc)               ║
║  ✗ Ad Networks (doubleclick, etc)                      ║
║                                                         ║
╚═════════════════════════════════════════════════════════╝
```

---

## Response Format (Streaming)

```
┌─────────────────────────────────────────────┐
│      NDJSON Response (Line Delimited)       │
├─────────────────────────────────────────────┤
│                                             │
│  Line 1: Sources Metadata                   │
│  ────────────────────────────────           │
│  {                                          │
│    "type": "sources",                       │
│    "sources": [                             │
│      {                                      │
│        "document_name": "[ACADEMIC] ArXiv", │
│        "content_preview": "...",            │
│        "similarity": 0.95,                  │
│        "credibility_score": 0.95,           │
│        "source_url": "https://arxiv.org/...",│
│        "section": "Web Search (academic)"   │
│      }                                      │
│    ],                                       │
│    "note": "Sources dari sumber terpercaya" │
│  }                                          │
│                                             │
│  Lines 2-N: Token Stream                    │
│  ────────────────────────────────           │
│  {"type":"token","content":"Machine"}       │
│  {"type":"token","content":" "}             │
│  {"type":"token","content":"learning"}      │
│  {"type":"token","content":" adalah"}       │
│  ...                                        │
│                                             │
│  Last Line: Done Signal                     │
│  ────────────────────────────────           │
│  {"type":"done"}                            │
│                                             │
└─────────────────────────────────────────────┘
```

---

## Credibility Score Legend

```
Score   Stars   Category                          Meaning
─────────────────────────────────────────────────────────
0.95    ⭐⭐⭐⭐⭐   Wikipedia, Britannica          Highest Trust
0.90    ⭐⭐⭐⭐    ArXiv, Scholar, Government    Very High
0.85    ⭐⭐⭐⭐    Science publications          High
0.80    ⭐⭐⭐⭐    Major News (Reuters, BBC)      High
0.75    ⭐⭐⭐     Tech Docs (GitHub, StackOF)    Medium-High
0.70    ⭐⭐⭐     Business (Forbes)              Medium
```

---

## Configuration Points

```
File: backend/utils/trusted_sources.py

✏️  Edit These to Customize:

1. TRUSTED_DOMAINS
   - Add/remove domains
   - Organize by category

2. BLOCKED_DOMAINS
   - Add domains to block
   - Remove if want to allow

3. get_source_credibility_score()
   - Adjust scores per category
   - Make academic > news, etc

4. In backend/routes/chat.py:
   - Change max_results * 3 multiplier
   - Change timeout (currently 5.0)
   - Change trusted_only default
```

---

**Architecture is modular & extensible! 🎉**
