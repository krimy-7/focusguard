"""Deterministic focus-context detection.

Combines a domain taxonomy, title cleaning and recency-weighted evidence to
propose a focus context (title + mode) with a confidence score. This engine is
deliberately strong on its own so detection degrades gracefully when the AI
provider is slow or unavailable.
"""

from __future__ import annotations

import re
from collections import Counter

# -- Domain taxonomy --------------------------------------------------------
# registrable-domain -> {label, mode, keywords}

_TAXONOMY: dict[str, dict[str, object]] = {
    # code
    "github.com": {"label": "code", "mode": "work", "keywords": ["github", "repo", "pull request", "commit", "branch"]},
    "gitlab.com": {"label": "code", "mode": "work"},
    "bitbucket.org": {"label": "code", "mode": "work"},
    "stackoverflow.com": {"label": "code", "mode": "work", "keywords": ["stack overflow", "error", "exception", "solution"]},
    "stackexchange.com": {"label": "code", "mode": "work"},
    "stackblitz.com": {"label": "code", "mode": "work"},
    "codesandbox.io": {"label": "code", "mode": "work"},
    "replit.com": {"label": "code", "mode": "work"},
    "vscode.dev": {"label": "code", "mode": "work"},
    "react.dev": {"label": "code", "mode": "work"},
    "expo.dev": {"label": "code", "mode": "work"},
    "mdn.dev": {"label": "code", "mode": "work"},
    "developer.mozilla.org": {"label": "code", "mode": "work"},
    "developer.android.com": {"label": "code", "mode": "work"},
    "nodejs.org": {"label": "code", "mode": "work"},
    "npmjs.com": {"label": "code", "mode": "work"},
    "python.org": {"label": "code", "mode": "work"},
    "geeksforgeeks.org": {"label": "code", "mode": "learning"},
    "freecodecamp.org": {"label": "code", "mode": "learning"},
    # notes / docs
    "notion.so": {"label": "notes", "mode": "work", "keywords": ["notion", "notes", "wiki", "database"]},
    "obsidian.md": {"label": "notes", "mode": "work"},
    "evernote.com": {"label": "notes", "mode": "work"},
    "docs.google.com": {"label": "docs", "mode": "work", "keywords": ["google docs", "document", "spreadsheet", "presentation"]},
    "sheets.google.com": {"label": "docs", "mode": "work"},
    "slides.google.com": {"label": "docs", "mode": "work"},
    # research
    "researchgate.net": {"label": "research", "mode": "learning", "keywords": ["research", "paper", "publication", "citation"]},
    "scholar.google.com": {"label": "research", "mode": "learning", "keywords": ["scholar", "paper", "citation"]},
    "semanticscholar.org": {"label": "research", "mode": "learning", "keywords": ["semantic scholar", "paper", "citation"]},
    "arxiv.org": {"label": "research", "mode": "learning", "keywords": ["arxiv", "paper", "preprint"]},
    "pubmed.ncbi.nlm.nih.gov": {"label": "research", "mode": "learning", "keywords": ["pubmed", "paper", "research", "study"]},
    "sciencedirect.com": {"label": "research", "mode": "learning", "keywords": ["sciencedirect", "paper", "journal"]},
    "jstor.org": {"label": "research", "mode": "learning", "keywords": ["jstor", "paper", "journal"]},
    "drive.google.com": {"label": "files", "mode": "work"},
    "dropbox.com": {"label": "files", "mode": "work"},
    # design
    "figma.com": {"label": "design", "mode": "work", "keywords": ["figma", "design", "prototype", "wireframe", "ui", "ux", "frame"]},
    "dribbble.com": {"label": "design", "mode": "work", "keywords": ["dribbble", "design", "shot"]},
    "behance.net": {"label": "design", "mode": "work"},
    "canva.com": {"label": "design", "mode": "work"},
    "framer.com": {"label": "design", "mode": "work"},
    "fonts.google.com": {"label": "design", "mode": "work"},
    "photoshop.adobe.com": {"label": "design", "mode": "work"},
    "adobe.com": {"label": "design", "mode": "work"},
    # planning / tasks
    "trello.com": {"label": "planning", "mode": "work", "keywords": ["trello", "board", "card", "task"]},
    "linear.app": {"label": "planning", "mode": "work"},
    "asana.com": {"label": "planning", "mode": "work"},
    "jira.com": {"label": "planning", "mode": "work"},
    "atlassian.com": {"label": "planning", "mode": "work"},
    "todoist.com": {"label": "planning", "mode": "work"},
    # chat / email / calendar
    "slack.com": {"label": "chat", "mode": "work", "keywords": ["slack", "channel", "thread"]},
    "teams.microsoft.com": {"label": "chat", "mode": "work"},
    "discord.com": {"label": "chat", "mode": "personal"},
    "mail.google.com": {"label": "email", "mode": "work", "keywords": ["gmail", "inbox", "mail"]},
    "outlook.com": {"label": "email", "mode": "work"},
    "proton.me": {"label": "email", "mode": "work"},
    "calendar.google.com": {"label": "calendar", "mode": "work"},
    "calendar.yahoo.com": {"label": "calendar", "mode": "work"},
    # ai assistants
    "chatgpt.com": {"label": "assistant", "mode": "work", "keywords": ["chatgpt", "prompt", "ai"]},
    "claude.ai": {"label": "assistant", "mode": "work"},
    "openai.com": {"label": "assistant", "mode": "work"},
    "gemini.google.com": {"label": "assistant", "mode": "work"},
    "perplexity.ai": {"label": "assistant", "mode": "work"},
    # search
    "google.com": {"label": "search", "mode": "work"},
    "google.in": {"label": "search", "mode": "work"},
    "bing.com": {"label": "search", "mode": "work"},
    "duckduckgo.com": {"label": "search", "mode": "work"},
    # learning
    "youtube.com": {"label": "video", "mode": "learning", "keywords": ["youtube", "video", "tutorial", "lecture", "watch", "how to"]},
    "coursera.org": {"label": "course", "mode": "learning", "keywords": ["course", "class", "lecture", "lesson", "assignment"]},
    "udemy.com": {"label": "course", "mode": "learning"},
    "udacity.com": {"label": "course", "mode": "learning"},
    "khanacademy.org": {"label": "course", "mode": "learning"},
    "duolingo.com": {"label": "language", "mode": "learning"},
    "medium.com": {"label": "article", "mode": "learning"},
    "dev.to": {"label": "article", "mode": "learning"},
    "wikipedia.org": {"label": "reference", "mode": "learning"},
    # personal
    "reddit.com": {"label": "browsing", "mode": "personal", "keywords": ["reddit"]},
    "news.google.com": {"label": "news", "mode": "personal"},
    "cnn.com": {"label": "news", "mode": "personal"},
    "bbc.com": {"label": "news", "mode": "personal"},
    "nytimes.com": {"label": "news", "mode": "personal"},
    "netflix.com": {"label": "streaming", "mode": "personal", "keywords": ["netflix", "movie", "series", "show"]},
    "hulu.com": {"label": "streaming", "mode": "personal"},
    "primevideo.com": {"label": "streaming", "mode": "personal"},
    "amazon.com": {"label": "shopping", "mode": "personal", "keywords": ["amazon", "shopping", "product"]},
    "amazon.in": {"label": "shopping", "mode": "personal"},
    "flipkart.com": {"label": "shopping", "mode": "personal"},
    "myntra.com": {"label": "shopping", "mode": "personal"},
    "ebay.com": {"label": "shopping", "mode": "personal"},
    "spotify.com": {"label": "music", "mode": "personal"},
    "soundcloud.com": {"label": "music", "mode": "personal"},
    "instagram.com": {"label": "social", "mode": "personal", "keywords": ["instagram"]},
    "facebook.com": {"label": "social", "mode": "personal"},
    "twitter.com": {"label": "social", "mode": "personal"},
    "x.com": {"label": "social", "mode": "personal"},
    "tiktok.com": {"label": "social", "mode": "personal"},
    "pinterest.com": {"label": "social", "mode": "personal"},
    # professional
    "linkedin.com": {"label": "professional", "mode": "work"},
    "upwork.com": {"label": "professional", "mode": "work"},
    "fiverr.com": {"label": "professional", "mode": "work"},
    # local dev
    "localhost": {"label": "dev", "mode": "work"},
    "127.0.0.1": {"label": "dev", "mode": "work"},
}

_LABEL_MODE = {
    "code": "work",
    "design": "work",
    "notes": "work",
    "docs": "work",
    "files": "work",
    "planning": "work",
    "chat": "work",
    "email": "work",
    "assistant": "work",
    "search": "work",
    "dev": "work",
    "calendar": "work",
    "professional": "work",
    "video": "learning",
    "course": "learning",
    "language": "learning",
    "article": "learning",
    "reference": "learning",
    "research": "learning",
    "browsing": "personal",
    "news": "personal",
    "streaming": "personal",
    "shopping": "personal",
    "music": "personal",
    "social": "personal",
}

_LABEL_TITLES = {
    "code": "Programming",
    "design": "Design work",
    "notes": "Note-taking",
    "docs": "Writing docs",
    "files": "Managing files",
    "planning": "Planning tasks",
    "chat": "Team chat",
    "email": "Email",
    "assistant": "AI-assisted work",
    "search": "Research",
    "dev": "Local development",
    "video": "Learning from videos",
    "course": "Taking a course",
    "language": "Language practice",
    "article": "Reading articles",
    "reference": "Research",
    "research": "Research",
    "browsing": "Browsing",
    "news": "Reading news",
    "streaming": "Watching shows",
    "shopping": "Shopping",
    "music": "Music",
    "social": "Social media",
    "professional": "Networking",
    "calendar": "Scheduling",
}

_TOPIC_VERB = {
    "code": "coding",
    "design": "design",
    "notes": "note-taking",
    "docs": "writing docs",
    "files": "managing files",
    "planning": "planning tasks",
    "chat": "team chat",
    "email": "email",
    "assistant": "an AI assistant",
    "search": "researching",
    "dev": "local development",
    "video": "watching videos",
    "course": "taking a course",
    "language": "language practice",
    "article": "reading articles",
    "reference": "researching",
    "research": "researching",
    "browsing": "browsing",
    "news": "reading news",
    "streaming": "streaming",
    "shopping": "shopping",
    "music": "music",
    "social": "social media",
    "professional": "networking",
    "calendar": "scheduling",
}

_SITE_NAME_RE = re.compile(
    r"\s*[-–|]\s*(YouTube|GitHub|GitLab|Stack Overflow|Figma|Notion|Google Docs|Google Sheets|Google Slides|"
    r"Gmail|Outlook|Slack|Discord|Reddit|Twitter|X\.com|LinkedIn|Facebook|Instagram|Wikipedia|Medium|"
    r"Netflix|Spotify|Amazon|Coursera|Udemy|Khan Academy|Canva|Google Search|Google|Bing|DuckDuckGo|"
    r"ChatGPT|Claude\.ai|Linear|Trello|Jira|Asana|VS Code|Google Chrome|Chrome Web Store|GitBook|"
    r"ResearchGate|Google Scholar|Semantic Scholar|arXiv|PubMed|ScienceDirect|JSTOR)\s*$",
    re.IGNORECASE,
)

_SUFFIX_BRACKET = re.compile(r"\s*\(\d+\)\s*$")
_WS = re.compile(r"\s+")
_WORD = re.compile(r"[a-z0-9]+")

_STOPWORDS = {
    "the", "and", "for", "with", "your", "my", "you", "this", "that", "from", "have", "has",
    "into", "were", "was", "are", "its", "it's", "not", "but", "all", "our", "their", "they",
    "them", "his", "her", "she", "he", "him", "also", "just", "like", "about", "than", "then",
    "when", "what", "who", "which", "will", "would", "can", "could", "should", "being", "been",
    "in", "on", "at", "to", "of", "a", "an",
}


def normalize_domain(domain: str) -> str:
    d = (domain or "").strip().lower()
    d = d.split("//")[-1].split("/")[0]
    d = re.sub(r"^www\.", "", d)
    d = d.split(":")[0]
    return d


def registrable_domain(domain: str) -> str:
    """Approximate registrable domain, honouring known multi-label taxonomy keys."""
    d = normalize_domain(domain)
    if not d:
        return d
    if re.fullmatch(r"\d{1,3}(\.\d{1,3}){3}", d):
        return d
    for candidate in _TAXONOMY:
        if d == candidate or d.endswith("." + candidate):
            return candidate
    labels = d.split(".")
    return ".".join(labels[-2:]) if len(labels) > 2 else d


def clean_title(title: str) -> str:
    t = (title or "").strip()
    if not t:
        return ""
    t = _SITE_NAME_RE.sub("", t)
    t = _SUFFIX_BRACKET.sub("", t)
    t = _WS.sub(" ", t).strip(" -–|")
    return t[:200]


def topic_of(domain: str) -> str:
    reg = registrable_domain(domain)
    entry = _TAXONOMY.get(reg) or _TAXONOMY.get(normalize_domain(domain))
    return str((entry or {}).get("label", ""))


def _tokens(text: str) -> set[str]:
    return {
        w for w in _WORD.findall((text or "").lower())
        if len(w) > 2 and w not in _STOPWORDS
    }


def _weighted_domains(recent_domains: list[str]) -> list[tuple[str, float]]:
    out: list[tuple[str, float]] = []
    for i, d in enumerate((recent_domains or [])[:10]):
        norm = normalize_domain(d)
        if not norm:
            continue
        out.append((norm, 1.0 / (1.0 + 0.35 * i)))
    return out


def _topic_scores(domains: list[str]) -> Counter:
    c: Counter = Counter()
    for norm, w in _weighted_domains(domains):
        label = topic_of(norm)
        if label:
            c[label] += w
    return c


def _label_title(label: str) -> str:
    return _LABEL_TITLES.get(label, "Research")


def _label_verb(label: str) -> str:
    return _TOPIC_VERB.get(label, "browsing")


def _related(text_a: str, text_b: str) -> bool:
    ta, tb = _tokens(text_a), _tokens(text_b)
    if not ta or not tb:
        return False
    shared = len(ta & tb)
    return shared / max(1, min(len(ta), len(tb))) >= 0.5


def match_existing(proposed_title: str, existing_contexts: list[dict]) -> tuple[int | None, str | None, float]:
    """Return (id, title, score) of the best existing-context match, if any."""
    if not existing_contexts:
        return None, None, 0.0
    pt = _tokens(proposed_title)
    best_id, best_title, best_score = None, None, 0.0
    for c in existing_contexts:
        title = (c.get("title") or "").strip()
        if not title:
            continue
        if title.lower() == proposed_title.strip().lower():
            return c.get("id"), title, 1.0
        ct = _tokens(title)
        if not pt or not ct:
            continue
        inter = len(pt & ct)
        score = 2 * inter / (len(pt) + len(ct))
        if score > best_score:
            best_score, best_id, best_title = score, c.get("id"), title
    return (best_id, best_title, best_score) if best_score >= 0.4 else (None, None, 0.0)


def _drift_suggestion(
    primary_label: str,
    proposed_title: str,
    same_topic_count: float,
    active_context: dict | None,
    matched_existing_id: int | None,
) -> tuple[bool, str]:
    if not active_context:
        return False, ""
    if matched_existing_id and matched_existing_id == active_context.get("id"):
        return False, ""
    active_title = active_context.get("title") or ""
    active_labels = {topic_of(d) for d in (active_context.get("domains") or [])}
    if primary_label and primary_label in active_labels:
        return False, ""
    if active_title and _related(proposed_title, active_title):
        return False, ""
    strong = same_topic_count >= 1.5 or bool(primary_label and proposed_title)
    if not strong:
        return False, ""
    return True, f"You've moved to a different topic - looks like \"{proposed_title}\"."


def detect_context(
    signals: dict,
    recent_domains: list[str],
    active_context: dict | None = None,
    existing_contexts: list[dict] | None = None,
) -> dict:
    """Propose a focus context. Pure/deterministic — no network calls."""
    domain = normalize_domain(signals.get("domain") or "")
    raw_title = (signals.get("title") or "").strip()
    title = clean_title(raw_title)

    domains = []
    for d in [domain] + list(recent_domains or []):
        norm = normalize_domain(d)
        if norm and norm not in domains:
            domains.append(norm)

    scores = _topic_scores(domains)
    primary_label, same_topic_count = (scores.most_common(1)[0] if scores else ("", 0.0))

    # --- proposed title -----------------------------------------------------
    # Research sites (scholar, researchgate, arxiv, pubmed, docs) all map to a
    # single "Research" context so they group together instead of fragmenting
    # into one context per paper/tab.
    if primary_label == "research":
        proposed = _label_title("research")
    elif title and len(title) >= 3:
        proposed = title
    elif primary_label:
        proposed = _label_title(primary_label)
    else:
        proposed = "Research" if domain else "Active session"
    proposed = proposed[:200]

    # --- mode ---------------------------------------------------------------
    mode = _LABEL_MODE.get(primary_label) or mode_of(domain, raw_title)

    # --- confidence ---------------------------------------------------------
    if primary_label:
        base = 0.5 + 0.12 * same_topic_count + (0.08 if title else 0.0)
    else:
        base = 0.45 if title else 0.4
    if same_topic_count >= 2.0:
        base = max(base, 0.82)
    confidence = round(min(0.95, base), 2)

    # --- match existing context ---------------------------------------------
    existing_id, matched_title, _ = match_existing(proposed, existing_contexts or [])
    if matched_title:
        proposed = matched_title
        confidence = min(0.95, confidence + 0.12)

    # --- reason -------------------------------------------------------------
    top_domains = ", ".join(domains[:3]) or "recent tabs"
    if matched_title:
        reason = f"Matches your existing context \"{matched_title}\"."
    elif primary_label and title:
        reason = f"Strong signal: {_label_verb(primary_label)} ({top_domains})."
    elif primary_label:
        reason = f"You've been on {_label_verb(primary_label)} sites ({top_domains})."
    elif title:
        reason = "Based on your current activity."
    else:
        reason = "Based on recent browsing."

    # --- drift / switch -----------------------------------------------------
    suggest_switch, switch_reason = _drift_suggestion(
        primary_label, proposed, same_topic_count, active_context, existing_id
    )

    return {
        "proposed_title": proposed,
        "mode": mode,
        "confidence": confidence,
        "reason": reason,
        "existing_context_id": existing_id,
        "suggest_switch": suggest_switch,
        "switch_reason": switch_reason,
    }


def mode_of(domain: str, title: str = "") -> str:
    reg = registrable_domain(domain)
    entry = _TAXONOMY.get(reg) or _TAXONOMY.get(normalize_domain(domain))
    if entry:
        return str(entry["mode"])
    text = (title or "").lower()
    if any(w in text for w in ("tutorial", "learn", "course", "study", "lecture", "guide", "how to")):
        return "learning"
    if any(w in text for w in ("mail", "inbox", "calendar", "slack", "meet", "github", "invoice", "task")):
        return "work"
    return "work"
