"""Turn a flat block list into a standard report: canonical sections, order, summary, review notes."""
import re

from .model import Block
from .textfix import (clean_heading, clean_inline, finish_bullet, finish_paragraph, sentences, strip_markup)

RANK = {"summary": 0, "intro": 1, "scope": 2, "method": 3, "findings": 4, "analysis": 5,
        "conclusions": 6, "recommendations": 7, "references": 8, "appendix": 9}
CANON_TITLE = {"summary": "Executive Summary", "intro": "Introduction", "conclusions": "Conclusions",
               "recommendations": "Recommendations", "references": "References", "scope": "Scope"}
_PLACEHOLDER = re.compile(r"\b(TODO|TBD|TBC|XXX+|FIXME|lorem ipsum)\b|\?\?+|\[(?:insert|add|tbd)[^\]]*\]", re.I)


def classify(title):
    t = re.sub(r"[^a-z0-9 &/-]", "", strip_markup(title).lower()).strip()
    t = re.sub(r"^(\d+(\.\d+)*|[a-z])\s+", "", t)
    if t in {"summary", "overview", "executive summary", "abstract", "synopsis", "management summary"}:
        return "summary"
    if re.match(r"(appendix|appendices|annex|attachment)", t):
        return "appendix"
    if re.search(r"\b(references?|bibliography|citations)\b|^sources$", t):
        return "references"
    if re.search(r"conclusion|closing remarks|final remarks", t):
        return "conclusions"
    if re.search(r"recommend|next steps|action items|way forward|proposed actions", t):
        return "recommendations"
    if re.search(r"\b(introduction|background|purpose|objectives?|aims?|context)\b", t):
        return "intro"
    if re.search(r"\bscope\b", t):
        return "scope"
    if re.search(r"method|approach|procedure|set-?up|equipment|instrumentation|test plan|design basis|assumptions", t):
        return "method"
    if re.search(r"finding|result|observation|measurement|inspection|\bdata\b", t):
        return "findings"
    if re.search(r"analysis|discussion|evaluation|assessment|interpretation|root cause|issues|risks?", t):
        return "analysis"
    return None


def _normalise_levels(blocks):
    heads = [b for b in blocks if b.kind == "heading"]
    if not heads:
        return None
    lo = min(h.level for h in heads)
    for h in heads:
        h.level -= lo - 1
    # a lone top-level heading at the very start is the document title, not a section
    tops = [b for b in blocks if b.kind == "heading" and b.level == 1]
    title = None
    if len(tops) == 1 and blocks.index(tops[0]) <= 1 and len(heads) > 2:
        title = tops[0].text
        blocks.remove(tops[0])
        for h in heads:
            if h is not tops[0]:
                h.level = max(1, h.level - 1)
    return title


def _split(blocks):
    pre, groups = [], []
    for b in blocks:
        if b.kind == "heading" and b.level == 1:
            groups.append([b])
        elif groups:
            groups[-1].append(b)
        else:
            pre.append(b)
    return pre, groups


def _auto_summary(groups):
    """Extractive executive summary from the findings / conclusions / recommendations."""
    keyw = re.compile(r"conclu|found|result|recommend|should|shall|exceed|fail|pass|within|below|above|complian|"
                      r"critical|risk|requir|defect|improv|reduc|increas|decreas|deviat|acceptable|achiev", re.I)

    def pick(keys, limit):
        pool = []
        for g in groups:
            if g[0].auto_key in keys:
                for idx, b in enumerate(g[1:]):
                    if b.kind in ("para", "bullet", "number"):
                        for k, s in enumerate(sentences(b.text)):
                            n = len(s.split())
                            if 5 <= n <= 45 and not _PLACEHOLDER.search(s):
                                score = 2 * bool(re.search(r"\d", s)) + 2 * bool(keyw.search(s)) + (k == 0 and idx == 0)
                                pool.append((score, len(pool), s))
        best = sorted(pool, key=lambda x: (-x[0], x[1]))[:limit]
        return [s for _, _, s in sorted(best, key=lambda x: x[1])]

    out = []
    intro = next((g for g in groups if g[0].auto_key in ("intro", "scope")), None)
    if intro:
        first = next((sentences(b.text)[0] for b in intro[1:] if b.kind == "para" and sentences(b.text)), None)
        if first:
            out.append(Block("para", first, auto=True))
    findings = pick(("conclusions", "findings", "analysis"), 5)
    if findings:
        out.append(Block("para", "**Key findings**", auto=True))
        out += [Block("bullet", s, auto=True) for s in findings]
    recs = pick(("recommendations",), 4)
    if recs:
        out.append(Block("para", "**Recommended actions**", auto=True))
        out += [Block("bullet", s, auto=True) for s in recs]
    return out


def structure(report, ai=None):
    blocks, notes, meta = list(report.blocks), report.notes, report.meta
    doc_title = _normalise_levels(blocks)
    if doc_title and not meta.get("title"):
        meta["title"] = clean_heading(doc_title)
    pre, groups = _split(blocks)

    for g in groups:
        g[0].auto_key = classify(g[0].text)
    if pre and any(b.kind == "para" for b in pre):
        if not any(g[0].auto_key == "intro" for g in groups):
            head = Block("heading", "Introduction", level=1)
            head.auto_key = "intro"
            groups.insert(0, [head] + pre)
        else:
            groups[[g[0].auto_key for g in groups].index("intro")][1:1] = pre
    elif pre:
        groups.insert(0, [Block("heading", "Introduction", level=1)] + pre)
        groups[0][0].auto_key = "intro"

    # acronyms = tokens written in capitals inside normal body text
    acr = set()
    for g in groups:
        for b in g[1:]:
            acr.update(re.findall(r"\b[A-Z]{2,}\b", b.text) if b.kind in ("para", "bullet", "number") else [])
    for g in groups:
        h = g[0]
        key = h.auto_key
        h.text = CANON_TITLE.get(key) if key in CANON_TITLE else clean_heading(h.text, acr)
        for b in g[1:]:
            if b.kind == "heading":
                b.text = clean_heading(b.text, acr)

    # executive summary
    words = sum(len(b.text.split()) for g in groups for b in g[1:] if b.kind in ("para", "bullet", "number"))
    if not any(g[0].auto_key == "summary" for g in groups):
        text = _auto_summary(groups) if words >= 120 else []
        if words < 120:
            notes.append(("info", "The report is very short, so no Executive Summary was generated."))
        if text:
            head = Block("heading", "Executive Summary", level=1, auto=True)
            head.auto_key = "summary"
            groups.append([head] + text)
            notes.append(("review", "The Executive Summary was generated automatically from the findings, conclusions "
                                    "and recommendations. Read it and adjust before issuing."))
    if ai:
        for g in groups:
            if g[0].auto_key == "summary" and g[0].auto and ai.summary:
                body = "\n".join(b.text for gg in groups if gg is not g for b in gg if b.kind in ("para", "bullet"))
                new = ai.summary(body)
                if new:
                    g[1:] = [Block("para", p.strip(), auto=True) for p in new.split("\n\n") if p.strip()]
                    notes.append(("review", "Executive Summary was written by the local AI model; verify every figure."))

    # order sections
    last = 1.5
    for g in groups:
        k = g[0].auto_key
        g[0].rank = RANK[k] if k else last
        last = g[0].rank
    groups.sort(key=lambda g: g[0].rank)

    missing = [name for key, name in (("scope", None), ("method", "Methodology"), ("conclusions", "Conclusions"),
                                      ("recommendations", "Recommendations"))
               if name and not any(g[0].auto_key == key for g in groups)]
    for name in missing:
        notes.append(("warning", f"No '{name}' section was found in the source report."))

    # clean text, number captions
    counters, remap = {"table": 0, "figure": 0}, {"table": {}, "figure": {}}
    for g in groups:
        for b in g:
            if b.kind == "heading":
                continue
            if b.kind in ("para", "bullet", "number"):
                b.text = clean_inline(b.text)
                b.text = finish_paragraph(b.text) if b.kind == "para" else finish_bullet(b.text)
                if _PLACEHOLDER.search(b.text) and not b.auto:
                    notes.append(("warning", f"Placeholder text left in: “{strip_markup(b.text)[:70]}…”"))
                if b.kind == "para" and len(b.text.split()) > 220:
                    notes.append(("info", f"Very long paragraph ({len(b.text.split())} words) in “{g[0].text}” – "
                                          "consider splitting."))
            elif b.kind in ("table", "image"):
                kind = "table" if b.kind == "table" else "figure"
                counters[kind] += 1
                if b.label:
                    remap[kind][b.label] = str(counters[kind])
                b.label = str(counters[kind])
                b.caption = clean_inline(b.caption) if b.caption else ""
                if not b.caption:
                    notes.append(("info", f"{kind.title()} {b.label} (in “{g[0].text}”) has no caption – add one."))
                if b.kind == "table":
                    b.rows = [[clean_inline(c) if c else "" for c in r] for r in b.rows]
                    width = max(len(r) for r in b.rows)
                    b.rows = [r + [""] * (width - len(r)) for r in b.rows]
    for g in groups:                                    # keep "see Table 3" references in step
        for b in g:
            if b.kind in ("para", "bullet", "number"):
                b.text = re.sub(r"\b(Table|Figure)\s+(\d+)\b",
                                lambda m: f"{m.group(1)} {remap[m.group(1).lower()].get(m.group(2), m.group(2))}", b.text)
        if len(g) == 1:
            notes.append(("warning", f"Section “{g[0].text}” has no content."))

    if ai and ai.polish:
        for g in groups:
            for b in g:
                if b.kind == "para" and not b.auto:
                    b.text = ai.polish(b.text)

    if not meta.get("title"):
        meta["title"] = clean_heading(meta.get("source_name", "Technical Report").replace("_", " ").replace("-", " ")) \
            if meta.get("source_name") else "Technical Report"
    else:
        meta["title"] = clean_heading(meta["title"])
    for k in ("author", "date", "docno", "revision"):
        if not meta.get(k):
            notes.append(("info", f"Document control field “{k}” is empty."))
    report.blocks = [b for g in groups for b in g]
    return report
