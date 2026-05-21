# 🧪 Fast Research - Testing & Usage Guide

## Quick Start Testing

### 1️⃣ Start Backend
```bash
cd backend
uvicorn main.py --reload
```

Server akan jalan di `http://localhost:8000`

### 2️⃣ Start Frontend
```bash
cd frontend
npm run dev
```

Frontend akan jalan di `http://localhost:3000`

### 3️⃣ Test dengan Postman atau cURL

---

## 📋 Test Cases

### ✅ Test 1: Academic Query (Should Work)
```bash
curl -X POST http://localhost:8000/api/research \
  -H "Content-Type: application/json" \
  -d '{
    "query": "jelaskan teori relativity Einstein",
    "max_results": 5
  }'
```

**Expected Response:**
- ✅ Answer dari sumber akademik terpercaya
- ✅ Sources dari ArXiv, Wikipedia, atau Science Daily
- ✅ Credibility score tinggi (0.85-0.95)

---

### ✅ Test 2: News Query (Should Work)
```bash
curl -X POST http://localhost:8000/api/research \
  -H "Content-Type: application/json" \
  -d '{
    "query": "berita terbaru Indonesia",
    "max_results": 5
  }'
```

**Expected Response:**
- ✅ Answer dari news terpercaya (Kompas, CNN Indonesia, dll)
- ✅ [NEWS_INDONESIA] badges di sources
- ✅ Credibility score 0.80

---

### ✅ Test 3: Technical Query (Should Work)
```bash
curl -X POST http://localhost:8000/api/research \
  -H "Content-Type: application/json" \
  -d '{
    "query": "bagaimana cara setup Python virtual environment",
    "max_results": 5
  }'
```

**Expected Response:**
- ✅ Answer dari GitHub, Stack Overflow, official docs
- ✅ [TECH_DOCS] badges
- ✅ Credibility score 0.75

---

### ❌ Test 4: Social Media Query (Should Filter Out)
```bash
curl -X POST http://localhost:8000/api/research \
  -H "Content-Type: application/json" \
  -d '{
    "query": "funny TikTok videos",
    "max_results": 10
  }'
```

**Expected Response:**
- ❌ Sedikit atau tidak ada hasil (TikTok diblokir)
- ✅ Maybe some results dari reference atau news
- ✅ Clean error handling jika tidak ada trusted sources

---

### ❌ Test 5: YouTube Query (Should Filter Out)
```bash
curl -X POST http://localhost:8000/api/research \
  -H "Content-Type: application/json" \
  -d '{
    "query": "best YouTube tutorials programming",
    "max_results": 10
  }'
```

**Expected Response:**
- ❌ YouTube results diblokir
- ✅ Mungkin ada dari tutorial blog terpercaya
- ✅ atau error message: "No trusted sources found"

---

### ✅ Test 6: Streaming Mode
```bash
curl -X POST http://localhost:8000/api/research/stream \
  -H "Content-Type: application/json" \
  -d '{
    "query": "apa itu machine learning",
    "max_results": 5
  }'
```

**Expected Response (NDJSON Stream):**
```json
{"type":"sources","sources":[{"document_name":"[ACADEMIC] ArXiv...",}],"note":"Sources dari sumber terpercaya..."}
{"type":"token","content":"Machine"}
{"type":"token","content":" learning"}
{"type":"token","content":" adalah"}
...
{"type":"done"}
```

---

## 🎨 Frontend Component Testing

### Import dan Gunakan Component
```tsx
import FastResearchPanel from "@/components/FastResearchPanel";

export default function Page() {
  return (
    <div className="flex gap-4">
      <div className="w-1/2">
        <FastResearchPanel />
      </div>
      <div className="w-1/2">
        {/* Regular chat */}
      </div>
    </div>
  );
}
```

### Manual Function Testing
```tsx
"use client";

import { useState } from "react";
import { fastResearch, streamFastResearch } from "@/services/api";

export default function TestPage() {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Test non-streaming
  const testNonStreaming = async () => {
    setLoading(true);
    try {
      const res = await fastResearch("siapa presiden Indonesia", 5);
      setResult(res);
      console.log("Answer:", res.answer);
      console.log("Sources:", res.sources);
    } catch (e) {
      console.error("Error:", e);
    } finally {
      setLoading(false);
    }
  };

  // Test streaming
  const testStreaming = async () => {
    setLoading(true);
    setResult(null);
    let fullAnswer = "";
    let sources: any[] = [];

    try {
      await streamFastResearch(
        "jelaskan quantum computing",
        5,
        (token) => {
          fullAnswer += token;
          console.log("Token:", token);
        },
        (newSources) => {
          sources = newSources;
          console.log("Sources:", newSources);
        },
        () => {
          setResult({ answer: fullAnswer, sources });
          setLoading(false);
        },
        (error) => {
          console.error("Error:", error);
          setLoading(false);
        }
      );
    } catch (e) {
      console.error("Exception:", e);
      setLoading(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold">Fast Research Testing</h1>

      <div className="space-x-2">
        <button
          onClick={testNonStreaming}
          disabled={loading}
          className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
        >
          Test Non-Streaming
        </button>
        <button
          onClick={testStreaming}
          disabled={loading}
          className="px-4 py-2 bg-green-500 text-white rounded disabled:opacity-50"
        >
          Test Streaming
        </button>
      </div>

      {loading && <p>Loading...</p>}

      {result && (
        <div className="bg-gray-100 p-4 rounded">
          <h2 className="font-bold mb-2">Result:</h2>
          <pre className="text-sm whitespace-pre-wrap overflow-auto max-h-64">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
```

---

## 🔍 Expected Source Categories

Ketika melakukan search, sources akan di-tag dengan kategori:

### Typical Categories:
```
[REFERENCE] - Wikipedia, Britannica
[ACADEMIC] - ArXiv, Google Scholar, JSTOR
[NEWS_GLOBAL] - Reuters, BBC, Bloomberg
[NEWS_INDONESIA] - Kompas, CNN Indonesia, Tribun
[SCIENCE] - Nature, Science Daily, PubMed
[TECH_DOCS] - GitHub, Stack Overflow, Official docs
[GOVERNMENT] - .gov domains, government sites
[BUSINESS] - Forbes, TechCrunch, Business Insider
```

---

## 📊 Credibility Score Reference

```
Score → Stars → Meaning
0.95  → ⭐⭐⭐⭐⭐ → Highest trust (Wikipedia, Academic)
0.90  → ⭐⭐⭐⭐   → Very high (Google Scholar, Government)
0.85  → ⭐⭐⭐⭐   → High (Science publications)
0.80  → ⭐⭐⭐⭐   → High (Major news outlets)
0.75  → ⭐⭐⭐     → Medium-high (Tech docs)
0.70  → ⭐⭐⭐     → Medium (Business magazines)
```

---

## 🐛 Troubleshooting

### Problem: Empty Results
```bash
# Check jika backend menjalankan
curl http://localhost:8000/health

# Check imports
python -c "from utils.trusted_sources import is_trusted_domain; print(is_trusted_domain('wikipedia.org'))"
```

### Problem: Source tidak di-filter
Kemungkinan:
1. Domain tidak di-list di `TRUSTED_DOMAINS`
2. Domain match tapi tidak di-extract dengan benar
3. DDGS tidak return hasil untuk query

**Solution:**
- Add domain ke `backend/utils/trusted_sources.py`
- Test: `python -c "from utils.trusted_sources import is_trusted_domain; print(is_trusted_domain('domain.com'))"`

### Problem: Slow Response
- Timeout per URL: 5 detik
- Max 5 URLs di-fetch per default
- Reduce `max_results` untuk lebih cepat

### Problem: DDGS Rate Limit
DDGS memiliki rate limit. Jika terlalu banyak requests:
- Gunakan `asyncio.sleep(1)` antar requests
- Atau cache results
- Atau pakai API berbayar

---

## 📈 Performance Metrics

```
Typical Response Time:
- Parse query: ~100ms
- DDGS search: ~500ms
- Filter trusted: ~50ms
- Fetch 5 URLs: ~2-5 seconds
- LLM generation: ~2-10 seconds (tergantung model)
- Total: ~5-15 seconds (streaming, real-time)

Max Parallel Fetches: 5 (configurable)
Timeout per URL: 5 seconds (configurable)
Default max_results: 5 (configurable)
```

---

## ✅ Verification Checklist

Before going to production:

- [ ] Backend starts without errors
- [ ] `/api/research` endpoint exists
- [ ] `/api/research/stream` endpoint exists
- [ ] Academic query returns trusted results
- [ ] YouTube query filters out
- [ ] Social media queries filter out
- [ ] Streaming works real-time
- [ ] Frontend component renders
- [ ] API functions callable
- [ ] Credibility scores display
- [ ] Source categories display
- [ ] Error handling works

---

## 🚀 Sample Queries untuk Testing

Gunakan queries ini untuk test berbagai skenario:

**Academic:**
- "apa itu artificial intelligence"
- "jelaskan algoritma machine learning"
- "history of quantum physics"

**News:**
- "berita terbaru tentang AI"
- "breaking news Indonesia"
- "latest technology trends"

**Technical:**
- "how to setup React"
- "Python best practices"
- "git version control tutorial"

**Reference:**
- "siapa Albert Einstein"
- "apa itu photosynthesis"
- "cara kerja internet"

**Social (should filter):**
- "funny TikTok videos"
- "Instagram stories tips"
- "YouTube creator advice"

---

**Happy Testing! 🎉**
