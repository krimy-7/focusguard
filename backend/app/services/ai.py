import time

import httpx

from app.config import get_settings

settings = get_settings()

SYSTEM_PROMPT = (
    "You are FocusGuard, a warm, playful digital well-being coach. "
    "You monitor a user's focus sessions and interruptions (privacy-safe, "
    "no raw browsing data). Respond in 2 sentences maximum, friendly and "
    "motivating, and end with a single short suggestion starting with 'Try: '."
)


class AIService:
    def __init__(self) -> None:
        self.provider = settings.ai_provider.lower()

    # -- Public API -------------------------------------------------------

    def generate_insight(self, context: dict) -> dict:
        """Return {message, suggestion}. Falls back to mock data on any failure."""
        try:
            if self.provider == "mock" or not self._credentials_ok():
                return self._mock_insight(context)
            if self.provider in {"deepseek", "openai", "ollama"}:
                result = self._openai_compatible(context)
                return result if self._insight_ok(result) else self._mock_insight(context)
            if self.provider == "claude":
                return self._anthropic(context)
            if self.provider == "gemini":
                return self._gemini(context)
        except Exception:
            return self._mock_insight(context)
        return self._mock_insight(context)

    def _insight_ok(self, result: dict) -> bool:
        msg = (result.get("message") or "").strip()
        if len(msg) < 10:
            return False
        low = msg.lower()
        return not any(w in low for w in ("safety", "i can't", "i cannot", "refuse", "not able to"))

    def extract_goals(self, text: str) -> list[dict]:
        """Turn a free-form morning intention into structured goals."""
        try:
            if self.provider == "mock" or not self._credentials_ok():
                return self._mock_goals(text)

            prompt = (
                "You are FocusGuard's morning planner. Convert the user's morning intention into "
                "2-5 concise, actionable daily goals. Return ONLY a JSON array of strings, one goal "
                "per item, no commentary.\n"
                f"User: {text}"
            )
            if self.provider in {"deepseek", "openai", "ollama"}:
                content = self._chat(prompt)
            elif self.provider == "claude":
                content = self._anthropic_raw(prompt)
            else:
                content = self._gemini_raw(prompt)
            goals = self._parse_json_list(content)
            if goals:
                return [{"title": g, "source": "ai"} for g in goals]
        except Exception:
            pass
        return self._mock_goals(text)

    def propose_context(self, signals: dict, recent_domains: list[str]) -> dict:
        """Propose a focus context (title + mode) from observed desktop signals."""
        try:
            if self.provider == "mock" or not self._credentials_ok():
                return self._mock_context(signals, recent_domains)

            prompt = (
                "You are FocusGuard's context detector. Given browser signals, propose the single "
                "best focus context the user is working on. Return ONLY a JSON object with keys "
                "'title' (short, e.g. 'Landing Page Design'), 'mode' (one of learning|work|personal), "
                "'reason' (one short sentence).\n"
                f"Signals: {signals}\nRecent domains: {recent_domains}"
            )
            content = self._chat(prompt) if self.provider != "claude" else self._anthropic_raw(prompt)
            data = self._parse_json_object(content)
            if data and data.get("title"):
                return {
                    "proposed_title": str(data["title"])[:200],
                    "mode": str(data.get("mode", "work"))[:20],
                    "confidence": float(data.get("confidence", 0.7)),
                    "reason": str(data.get("reason", ""))[:200],
                }
        except Exception:
            pass
        return self._mock_context(signals, recent_domains)

    # -- Credentials ------------------------------------------------------

    def _credentials_ok(self) -> bool:
        if self.provider == "deepseek":
            return bool(settings.deepseek_api_key)
        if self.provider == "openai":
            return bool(self._openai_endpoints())
        if self.provider == "claude":
            return bool(settings.claude_api_key)
        if self.provider == "gemini":
            return bool(settings.gemini_api_key)
        return True

    def _openai_endpoints(self) -> list[dict]:
        """One endpoint dict per configured key, so we can fall back to the
        next key (e.g. a second OpenRouter account for free-tier quota)."""
        base = settings.openai_base_url or "https://openrouter.ai/api/v1"
        model = settings.openai_model or "openrouter/free"
        keys = [settings.openai_api_key_first, settings.openai_api_key_second]
        if settings.openai_api_key:
            keys.append(settings.openai_api_key)
        endpoints = [
            {"base_url": base, "model": model, "key": k.strip()}
            for k in keys
            if k and k.strip()
        ]
        return endpoints or [{"base_url": base, "model": model, "key": ""}]

    # -- Providers --------------------------------------------------------

    def _chat(self, prompt: str) -> str:
        """Generic chat completion via the current OpenAI-compatible provider.
        Tries each configured endpoint in order, falling back to the next key
        on failure (rate limits, quota, etc.)."""
        if self.provider == "deepseek":
            endpoints = [{
                "base_url": "https://api.deepseek.com/v1",
                "model": settings.ai_model or "deepseek-chat",
                "key": settings.deepseek_api_key,
            }]
        elif self.provider == "ollama":
            endpoints = [{
                "base_url": settings.ollama_base_url,
                "model": settings.ollama_model or "qwen3:0.6b",
                "key": "",
            }]
        else:
            endpoints = self._openai_endpoints()

        payload = {
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.7,
            "max_tokens": 220,
        }
        # Hard deadline across all keys so a slow/rate-limited model never
        # makes the app wait indefinitely.
        deadline = time.monotonic() + 7
        last_exc: Exception | None = None
        for ep in endpoints:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            request = {**payload, "model": ep["model"]}
            headers = {"Authorization": f"Bearer {ep['key']}"} if ep["key"] else {}
            try:
                with httpx.Client(timeout=httpx.Timeout(connect=3.0, read=remaining, write=5.0, pool=3.0)) as client:
                    resp = client.post(f"{ep['base_url']}/chat/completions", json=request, headers=headers)
                    resp.raise_for_status()
                    return resp.json()["choices"][0]["message"]["content"]
            except Exception as exc:
                last_exc = exc
        raise last_exc or RuntimeError("No AI endpoints configured.")

    def _anthropic_raw(self, prompt: str) -> str:
        with httpx.Client(timeout=7) as client:
            resp = client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": settings.claude_api_key,
                    "anthropic-version": "2023-06-01",
                },
                json={
                    "model": settings.claude_model,
                    "max_tokens": 220,
                    "system": SYSTEM_PROMPT,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
            resp.raise_for_status()
            return resp.json()["content"][0]["text"]

    def _gemini_raw(self, prompt: str) -> str:
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{settings.gemini_model}:generateContent?key={settings.gemini_api_key}"
        )
        with httpx.Client(timeout=7) as client:
            resp = client.post(
                url,
                json={
                    "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
                    "contents": [{"parts": [{"text": prompt}]}],
                },
            )
            resp.raise_for_status()
            return resp.json()["candidates"][0]["content"]["parts"][0]["text"]

    def _openai_compatible(self, context: dict) -> dict:
        content = self._chat(self._context_text(context))
        return self._split_message(content)

    def _anthropic(self, context: dict) -> dict:
        return self._split_message(self._anthropic_raw(self._context_text(context)))

    def _gemini(self, context: dict) -> dict:
        return self._split_message(self._gemini_raw(self._context_text(context)))

    # -- Helpers ----------------------------------------------------------

    def _context_text(self, context: dict) -> str:
        return (
            f"Current stats: {context.get('stats', {})}. "
            f"Recent events: {context.get('events', [])}. "
            f"Open tasks: {context.get('tasks', [])}."
        )

    def _split_message(self, content: str) -> dict:
        content = content.strip()
        suggestion = None
        marker = "Try: "
        if marker in content:
            content, suggestion = content.split(marker, 1)
            suggestion = suggestion.strip().rstrip(".")
        return {"message": content.strip(), "suggestion": suggestion}

    # -- Mock fallback ----------------------------------------------------

    def _mock_goals(self, text: str) -> list[dict]:
        text = text.strip()
        candidates = [p.strip(" .") for p in text.replace(",", ";").split(";") if p.strip()]
        if len(candidates) < 2:
            candidates = [p.strip(" .") for p in text.split("and") if p.strip()]
        goals = [c for c in candidates if 3 <= len(c) <= 120][:5]
        if not goals:
            goals = [text[:120] or "Plan my day"]
        return [{"title": g, "source": "ai"} for g in goals]

    def _mock_context(self, signals: dict, recent_domains: list[str]) -> dict:
        title = signals.get("title") or signals.get("domain") or ""
        if not title:
            title = (recent_domains[0] if recent_domains else "Browsing") or "Research"
        title = title[:200]

        text = f"{signals.get('title', '')} {signals.get('domain', '')}".lower()
        mode = "work"
        if any(w in text for w in ("learn", "tutorial", "course", "doc", "study", "youtube")):
            mode = "learning"
        elif any(w in text for w in ("mail", "calendar", "slack", "meet", "github")):
            mode = "work"
        elif any(w in text for w in ("shop", "news", "health", "recipe")):
            mode = "personal"

        return {
            "proposed_title": title,
            "mode": mode,
            "confidence": 0.75,
            "reason": "Matches your recent activity.",
        }

    def _parse_json_list(self, content: str) -> list[str] | None:
        try:
            import json
            start, end = content.find("["), content.rfind("]")
            if start == -1 or end == -1:
                return None
            data = json.loads(content[start : end + 1])
            return [str(x) for x in data if isinstance(x, (str, int, float))]
        except Exception:
            return None

    def _parse_json_object(self, content: str) -> dict | None:
        try:
            import json
            start, end = content.find("{"), content.rfind("}")
            if start == -1 or end == -1:
                return None
            return json.loads(content[start : end + 1])
        except Exception:
            return None

    def _mock_insight(self, context: dict) -> dict:
        stats = context.get("stats", {})
        score = stats.get("score", 75)
        interrupts = stats.get("interrupts", 0)
        focus_min = stats.get("deep_focus_min", 0)
        open_tasks = context.get("tasks", [])

        if interrupts >= 3:
            message = "You've had quite a few interruptions today — that's okay, each one is a chance to reset."
            suggestion = "Try: a 2-minute 'next action' list before your next deep session."
        elif score >= 85:
            message = "You're absolutely in the zone. Your focus today is impressive!"
            suggestion = "Try: protecting your momentum for 25 more minutes, then celebrate with a real break."
        elif score >= 60:
            message = "Solid rhythm today. A few nudges and you'll be unstoppable."
            suggestion = "Try: blocking the next 25 minutes on your single most important task."
        elif open_tasks:
            message = "Lots of momentum to tap into. Your open tasks are just waiting for a sharp mind."
            suggestion = f"Try: starting with '{open_tasks[0]}' right now."
        else:
            message = "Every session counts. You're building a habit that compounds."
            suggestion = "Try: logging today's focus score so tomorrow beats it."

        focus_hint = f" You logged {focus_min} deep minutes." if focus_min else ""
        return {"message": message + focus_hint, "suggestion": suggestion}


ai_service = AIService()
