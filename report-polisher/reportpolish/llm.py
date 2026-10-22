"""Optional local-AI step (Ollama). Everything stays on this computer; off unless --ai is given."""
import json
import re
import urllib.request

from .textfix import numbers_in


class Ollama:
    def __init__(self, model, host="http://127.0.0.1:11434", generate=None):
        self.model, self.host = model, host.rstrip("/")
        self._gen = generate or self._http

    def _http(self, prompt):
        req = urllib.request.Request(self.host + "/api/generate", method="POST",
                                     data=json.dumps({"model": self.model, "prompt": prompt, "stream": False,
                                                      "options": {"temperature": 0.2}}).encode(),
                                     headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=300) as r:
            return json.load(r)["response"].strip()

    def summary(self, body):
        try:
            out = self._gen("You are a technical editor. Write an executive summary (maximum 170 words, plain "
                            "professional English, no headings, no bullet characters, 1-3 short paragraphs) of the "
                            "report below. Use only facts and numbers that appear in it.\n\n" + body[:12000])
        except Exception:
            return None
        allowed = set(numbers_in(body))
        return out if out and set(numbers_in(out)) <= allowed else None

    def polish(self, para):
        if len(para.split()) < 8:
            return para
        try:
            out = self._gen("Rewrite the paragraph in clear, formal technical English. Keep every number, unit, "
                            "name and technical term exactly. Do not add or remove facts. Return only the paragraph."
                            "\n\n" + para)
        except Exception:
            return para
        out = re.sub(r"^[\"“]|[\"”]$", "", out.strip())
        ok = numbers_in(out) == numbers_in(para) and 0.6 < len(out) / max(1, len(para)) < 1.4 and "\n" not in out
        return out if ok else para
