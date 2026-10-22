"""Read .docx / .md / .txt / .pdf into a flat list of Blocks plus metadata."""
import re
from pathlib import Path

from .model import Block, Report

META_KEYS = {
    "title": "title", "report title": "title", "subject": "title",
    "subtitle": "subtitle", "project": "project", "project name": "project", "site": "project",
    "author": "author", "prepared by": "author", "by": "author", "engineer": "author", "written by": "author",
    "reviewed by": "reviewer", "checked by": "reviewer", "approved by": "approver",
    "date": "date", "report date": "date", "issue date": "date",
    "client": "client", "customer": "client", "prepared for": "client",
    "report no": "docno", "report number": "docno", "document no": "docno", "doc no": "docno",
    "document number": "docno", "ref": "docno", "reference": "docno", "report id": "docno",
    "revision": "revision", "rev": "revision", "version": "revision",
    "department": "department", "team": "department",
}
_META_RE = re.compile(r"^\**\s*([A-Za-z][A-Za-z .]{1,24}?)\s*(?:\*\*\s*[:\-–]|[:\-–]\s*\*\*|[:\-–])\s*(.+?)\**\s*$")
_BULLET_RE = re.compile(r"^\s*(?:[-*•▪●◦‣·○■□✓➢➤►])\s+(.*)$")
_NUM_ITEM_RE = re.compile(r"^\s*(\d{1,3}|[a-zA-Z])[.)]\s+(.*)$")
_NUM_HEAD_RE = re.compile(r"^\s*(\d+(?:\.\d+)+|\d+)[.)]?\s+([A-Z].*)$")
_CAPTION_RE = re.compile(r"^\**\s*(table|tbl|figure|fig)\.?\s*(\d+)\s*[:.\-–—]?\s*(.*?)\**$", re.I)
_KNOWN_HEAD = re.compile(
    r"^(executive summary|summary|abstract|overview|introduction|background|purpose|objectives?|scope(?: of work)?|"
    r"methodology|methods?|approach|procedure|findings|results|observations|analysis|discussion|"
    r"conclusions?|recommendations?|next steps|references|appendi(?:x|ces)(?: [a-z0-9])?|test results|"
    r"conclusions and recommendations)\s*:?$", re.I)


# ---------------------------------------------------------------- plain-text parsing
def _is_heading_line(line, prev_blank, next_blank):
    s = line.strip()
    words = s.split()
    if not s or len(words) > 12 or s.endswith((".", ",", ";")) and not _NUM_HEAD_RE.match(s):
        return 0
    m = re.match(r"^(#{1,6})\s+(.*)$", s)
    if m:
        return len(m.group(1))
    if _KNOWN_HEAD.match(s):
        return 1
    m = _NUM_HEAD_RE.match(s)
    if m and not s.endswith("."):
        depth = m.group(1).count(".") + 1
        if depth > 1 or (prev_blank and next_blank and len(words) <= 8):
            return min(depth, 4)
    letters = [c for c in s if c.isalpha()]
    if len(letters) >= 4 and s.isupper() and prev_blank and len(words) <= 8:
        return 1
    return 0


def parse_text(text):
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    blocks, buf, in_code, code = [], [], False, []
    maxw = max([len(l) for l in lines if not l.lstrip().startswith("|")] or [0])

    def flush():
        if buf:
            blocks.append(Block("para", " ".join(x.strip() for x in buf)))
            buf.clear()

    i = 0
    while i < len(lines):
        line = lines[i]
        s = line.strip()
        if s.startswith("```"):
            if in_code:
                blocks.append(Block("code", "\n".join(code)))
                code.clear()
            else:
                flush()
            in_code = not in_code
            i += 1
            continue
        if in_code:
            code.append(line)
            i += 1
            continue
        if not s:
            flush()
            i += 1
            continue
        if s.startswith("|") or s.count("|") >= 2:                   # pipe table
            flush()
            rows = []
            while i < len(lines) and (lines[i].strip().startswith("|") or lines[i].count("|") >= 2):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                if not all(re.fullmatch(r":?-{2,}:?", c) for c in cells if c):
                    rows.append(cells)
                i += 1
            if len(rows) >= 1:
                blocks.append(Block("table", rows=rows))
            continue
        mm = _META_RE.match(s)
        if mm and mm.group(1).strip().lower() in META_KEYS and len(s) < 160:
            flush()
            blocks.append(Block("para", s))
            i += 1
            continue
        prev_blank = i == 0 or not lines[i - 1].strip()
        next_blank = i + 1 >= len(lines) or not lines[i + 1].strip()
        lvl = _is_heading_line(line, prev_blank, next_blank)
        if lvl:
            flush()
            blocks.append(Block("heading", re.sub(r"^#+\s*", "", s), level=lvl))
        elif _BULLET_RE.match(line):
            flush()
            blocks.append(Block("bullet", _BULLET_RE.match(line).group(1).strip()))
        elif _NUM_ITEM_RE.match(line):
            flush()
            blocks.append(Block("number", _NUM_ITEM_RE.match(line).group(2).strip()))
        elif blocks and blocks[-1].kind in ("bullet", "number") and not buf and line[:1] in " \t":
            blocks[-1].text += " " + s                               # wrapped list item
        else:
            if buf and (re.search(r"[.!?]$", buf[-1].strip())           # one paragraph per line
                        or (maxw >= 60 and len(buf[-1]) < 0.7 * maxw)):  # short line = paragraph ended
                flush()
            buf.append(s)
        i += 1
    flush()
    return blocks


# ---------------------------------------------------------------- docx
def _runs_markup(par):
    out = []
    for r in par.runs:
        t = r.text
        if not t:
            continue
        if r.bold and r.italic:
            t = f"***{t.strip()}*** " if t.strip() else t
        elif r.bold:
            t = f"**{t.strip()}**" + (" " if t.endswith(" ") else "") if t.strip() else t
        elif r.italic:
            t = f"*{t.strip()}*" + (" " if t.endswith(" ") else "") if t.strip() else t
        elif r.font.name and "mono" in r.font.name.lower() or (r.font.name or "") in ("Consolas", "Courier New"):
            t = f"`{t.strip()}`" if t.strip() else t
        out.append(t)
    s = "".join(out)
    return re.sub(r"\*\*\s*\*\*|\*\*(\s+)\*\*", r"\1", s).strip()


def _par_images(par, doc):
    imgs = []
    for blip in par._p.iter("{http://schemas.openxmlformats.org/drawingml/2006/main}blip"):
        rid = blip.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed")
        try:
            imgs.append(doc.part.related_parts[rid].blob)
        except Exception:
            pass
    return imgs


def read_docx(path):
    import docx
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    doc = docx.Document(str(path))
    blocks, meta = [], {}
    cp = doc.core_properties
    if cp.title:
        meta["title"] = cp.title
    if cp.author and cp.author.lower() not in ("python-docx", "user", "admin", "administrator"):
        meta["author"] = cp.author
    body = doc.element.body
    for child in body.iterchildren():
        tag = child.tag.split("}")[1]
        if tag == "p":
            p = Paragraph(child, doc)
            for img in _par_images(p, doc):
                blocks.append(Block("image", data=img))
            text = _runs_markup(p)
            if not text:
                continue
            style = (p.style.name if p.style is not None else "") or ""
            sl = style.lower()
            m = re.match(r"heading (\d)", sl)
            if sl == "title":
                meta["title"] = re.sub(r"\*", "", text)
            elif sl == "subtitle":
                meta["subtitle"] = re.sub(r"\*", "", text)
            elif m:
                blocks.append(Block("heading", re.sub(r"\*", "", text), level=int(m.group(1))))
            elif "list bullet" in sl or _BULLET_RE.match(text):
                blocks.append(Block("bullet", _BULLET_RE.sub(r"\1", text)))
            elif "list number" in sl or (_NUM_ITEM_RE.match(text) and not _NUM_HEAD_RE.match(text)):
                blocks.append(Block("number", _NUM_ITEM_RE.sub(r"\2", text)))
            elif "list" in sl:
                blocks.append(Block("bullet", text))
            else:
                plain = re.sub(r"\*", "", text)
                whole_bold = text.startswith("**") and text.endswith("**") and text.count("**") == 2
                lvl = _is_heading_line(plain, True, True)
                if lvl and not plain.isupper() or (lvl and plain.isupper()) or \
                        (whole_bold and len(plain.split()) <= 10 and not plain.endswith((".", ","))):
                    blocks.append(Block("heading", plain, level=lvl or 2))
                else:
                    blocks.append(Block("para", text))
        elif tag == "tbl":
            t = Table(child, doc)
            rows = []
            for r in t.rows:
                cells, seen = [], set()
                for c in r.cells:
                    if id(c._tc) in seen:
                        continue
                    seen.add(id(c._tc))
                    cells.append(" ".join(c.text.split()))
                rows.append(cells)
            if rows and any(any(c for c in r) for r in rows):
                blocks.append(Block("table", rows=rows))
    return meta, blocks


# ---------------------------------------------------------------- pdf
def read_pdf(path):
    import collections
    import pdfplumber

    pages_lines, tables = [], []
    with pdfplumber.open(str(path)) as pdf:
        for page in pdf.pages:
            ptables = []
            try:
                found = page.find_tables()
                ptables = [t.extract() for t in found]
                for t in found:
                    page = page.outside_bbox(t.bbox)
            except Exception:
                pass
            txt = page.extract_text() or ""
            pages_lines.append(txt.split("\n"))
            tables.append([t for t in ptables if t])
    count = collections.Counter(l.strip() for ls in pages_lines for l in set(ls) if l.strip())
    n = len(pages_lines)
    junk = {l for l, c in count.items() if n > 2 and c >= max(3, n * 0.6)}
    out = []
    for ls, tbs in zip(pages_lines, tables):
        keep = [l for l in ls if l.strip() not in junk and not re.fullmatch(r"(page\s*)?\d+(\s*(of|/)\s*\d+)?", l.strip(), re.I)]
        out.append("\n".join(keep))
        for t in tbs:
            out.append("\n" + "\n".join("| " + " | ".join((c or "").replace("\n", " ") for c in row) + " |" for row in t) + "\n")
    return {}, parse_text("\n".join(out))


# ---------------------------------------------------------------- shared post-processing
def extract_metadata(meta, blocks):
    """Pull 'Author: X' style lines (and 2-column key/value tables) out of the front matter."""
    out, found_at = [], []
    for idx, b in enumerate(blocks):
        if idx < 25:
            if b.kind == "para" and len(b.text) < 160:
                m = _META_RE.match(re.sub(r"\s+", " ", b.text))
                if m and m.group(1).strip().lower() in META_KEYS:
                    meta.setdefault(META_KEYS[m.group(1).strip().lower()], re.sub(r"\*", "", m.group(2)).strip())
                    found_at.append(idx)
                    continue
            elif b.kind == "table" and all(len(r) == 2 for r in b.rows) and \
                    sum(r[0].strip(" :").lower() in META_KEYS for r in b.rows) >= max(2, len(b.rows) // 2):
                for k, v in b.rows:
                    if k.strip(" :").lower() in META_KEYS and v:
                        meta.setdefault(META_KEYS[k.strip(" :").lower()], v)
                found_at.append(idx)
                continue
        out.append(b)
    if not meta.get("title") and out:
        first = out[0]
        looks_title = first.kind == "heading" and len(first.text.split()) <= 14 and (
            found_at and found_at[0] <= 2)
        if looks_title:
            meta["title"] = re.sub(r"\*", "", first.text)
            out.pop(0)
        else:
            for k, b in enumerate(out[:6]):
                if b.kind == "heading":
                    break
                if b.kind == "para" and len(b.text.split()) <= 14 and not b.text.rstrip().endswith((".", ":", ",")):
                    meta["title"] = re.sub(r"\*", "", b.text)
                    out.pop(k)
                    break
    return out


def attach_captions(blocks):
    """Merge 'Table 3: ...' / 'Figure 2: ...' paragraphs into the table/image they describe."""
    out, skip = [], set()
    for i, b in enumerate(blocks):
        if i in skip:
            continue
        if b.kind in ("table", "image"):
            want = "table" if b.kind == "table" else "figure"
            for j in (i - 1, i + 1):
                if 0 <= j < len(blocks) and blocks[j].kind == "para" and j not in skip:
                    m = _CAPTION_RE.match(blocks[j].text.strip())
                    if m and (m.group(1).lower().startswith(want[:3])):
                        b.label, b.caption = m.group(2), m.group(3).strip()
                        skip.add(j)
                        if j == i - 1 and out and out[-1] is blocks[j]:
                            out.pop()
                        break
        out.append(b)
    return out


def read_report(path):
    path = Path(path)
    ext = path.suffix.lower()
    if ext == ".docx":
        meta, blocks = read_docx(path)
    elif ext == ".pdf":
        meta, blocks = read_pdf(path)
    elif ext in (".txt", ".md", ".markdown", ".text", ""):
        meta, blocks = {}, parse_text(path.read_text(encoding="utf-8", errors="replace"))
    else:
        raise ValueError(f"Unsupported file type: {ext} (use .docx, .pdf, .md or .txt)")
    blocks = extract_metadata(meta, blocks)
    blocks = attach_captions(blocks)
    meta.setdefault("source_name", path.stem)
    return Report(meta=meta, blocks=blocks)
