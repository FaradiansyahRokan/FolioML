"""
Trusted Sources Validator — filters web search results to only include reliable sources.
"""
from urllib.parse import urlparse
from typing import Optional, List

# ─────────────────────────────────────────────────────────────
# Trusted Domain Categories
# ─────────────────────────────────────────────────────────────

TRUSTED_DOMAINS = {
    # Wikipedia & Reference
    "reference": [
        "wikipedia.org",
        "britannica.com",
    ],
    
    # Major News Organizations (Global)
    "news_global": [
        "bbc.com",
        "bbc.co.uk",
        "reuters.com",
        "apnews.com",
        "theguardian.com",
        "aljazeera.com",
        "bloomberg.com",
        "cnbc.com",
    ],
    
    # Indonesian News
    "news_indonesia": [
        "kompas.com",
        "tribunnews.com",
        "detik.com",
        "cnnindonesia.com",
        "bbc.com/indonesia",
        "kemenkeu.go.id",
        "berita.kemenperin.go.id",
        "liputan6.com",
        "merdeka.com",
        "tirto.id",
        "voanews.com",
    ],
    
    # Academic & Research
    "academic": [
        "arxiv.org",
        "scholar.google.com",
        "researchgate.net",
        "jstor.org",
        "academic.microsoft.com",
        "semanticscholar.org",
        "edu",  # Any .edu domain
    ],
    
    # Technology & Documentation
    "tech_docs": [
        "github.com",
        "stack overflow.com",
        "medium.com",
        "dev.to",
        "docs.microsoft.com",
        "docs.python.org",
        "official-documentation",
        "api.github.com",
    ],
    
    # Government & Official
    "government": [
        "gov",  # Any .gov domain
        "go.id",  # Indonesia government
        "gov.uk",
        ".edu.au",  # Australia education
    ],
    
    # Scientific & Health
    "science": [
        "sciencedaily.com",
        "nature.com",
        "sciencemag.org",
        "ncbi.nlm.nih.gov",
        "pubmed.ncbi.nlm.nih.gov",
        "healthline.com",
        "webmd.com",
        "mayoclinic.org",
    ],
    
    # Industry & Business
    "business": [
        "forbes.com",
        "businessinsider.com",
        "techcrunch.com",
        "venturebeat.com",
        "theverge.com",
    ],
}

# ─────────────────────────────────────────────────────────────
# Untrusted/Low-Quality Domains to BLOCK
# ─────────────────────────────────────────────────────────────

BLOCKED_DOMAINS = [
    # Social Media (user-generated content)
    "instagram.com",
    "tiktok.com",
    "facebook.com",
    "twitter.com",
    "x.com",
    "reddit.com",
    "threads.net",
    
    # Video platforms
    "youtube.com",
    "youtu.be",
    "vimeo.com",
    "dailymotion.com",
    
    # Low-quality content
    "pinterest.com",
    "quora.com",
    "tumblr.com",
    
    # URL shorteners & spam
    "bit.ly",
    "tinyurl.com",
    "short.link",
    "youtu.be",
    
    # Duplicate content farms
    "ezoic.com",
    "zemanta.com",
    
    # Ads & trackers
    "ads.google.com",
    "doubleclick.net",
    "facebook.com/ads",
]


def extract_domain(url: str) -> str:
    """Extract domain from URL."""
    try:
        parsed = urlparse(url)
        domain = parsed.netloc.lower().replace("www.", "")
        return domain
    except:
        return ""


def is_blocked_domain(url: str) -> bool:
    """Check if URL is from a blocked/untrusted domain."""
    domain = extract_domain(url)
    
    for blocked in BLOCKED_DOMAINS:
        if blocked in domain:
            return True
    
    return False


def is_trusted_domain(url: str) -> bool:
    """Check if URL is from a trusted/reliable source."""
    domain = extract_domain(url)
    
    if not domain:
        return False
    
    # First check if it's explicitly blocked
    if is_blocked_domain(url):
        return False
    
    # Check against all trusted domain categories
    for category, domains in TRUSTED_DOMAINS.items():
        for trusted in domains:
            if trusted in domain:
                return True
    
    return False


def get_source_category(url: str) -> Optional[str]:
    """Get the category of trusted source."""
    domain = extract_domain(url)
    
    for category, domains in TRUSTED_DOMAINS.items():
        for trusted in domains:
            if trusted in domain:
                return category
    
    return None


def filter_trusted_results(search_results: List[dict], target_category: str = "all") -> List[dict]:
    """
    Filter search results to only include trusted sources, optionally filtered by a specific category.
    
    Args:
        search_results: List of results from DDGS
        target_category: Optional specific category to filter by (e.g. "academic", "news_global")
    
    Returns:
        Filtered list of results
    """
    trusted = []
    
    for result in search_results:
        url = result.get("href", "")
        if url:
            if target_category != "all":
                cat = get_source_category(url)
                if cat == target_category:
                    result["source_category"] = cat
                    trusted.append(result)
            else:
                if is_trusted_domain(url):
                    result["source_category"] = get_source_category(url)
                    trusted.append(result)
    
    return trusted


def get_source_credibility_score(url: str) -> float:
    """
    Rate source credibility 0.0-1.0
    
    Higher score = more trustworthy
    """
    category = get_source_category(url)
    
    if not category:
        return 0.0
    
    # Scoring
    scores = {
        "reference": 0.95,  # Wikipedia, Britannica
        "academic": 0.9,    # Arxiv, Scholar
        "government": 0.9,  # Official gov sites
        "science": 0.85,    # Nature, Science Daily
        "news_global": 0.8, # Reuters, BBC
        "news_indonesia": 0.8,
        "tech_docs": 0.75,  # GitHub, Stack Overflow
        "business": 0.7,    # Forbes, TechCrunch
    }
    
    return scores.get(category, 0.0)


def rank_by_credibility(search_results: List[dict]) -> List[dict]:
    """Sort search results by credibility score."""
    return sorted(
        search_results,
        key=lambda x: get_source_credibility_score(x.get("href", "")),
        reverse=True
    )
