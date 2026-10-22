"""Conservative, rule-based language clean-up. Never changes numbers or meaning."""
import re

UNITS = ("m3|m2|kWh|MWh|kPa|MPa|kHz|MHz|GHz|kW|MW|kV|mA|mm|cm|km|kg|mg|mL|ms|Hz|Pa|psi|bar|rpm|min|kJ|kN|Nm|°C|°F|"
         "m|g|W|V|A|s|h|L|N|J")
_UNIT_RE = re.compile(rf"(?<![\w.,/-])(\d+(?:[.,]\d+)?)({UNITS})(?![\w°])")
_ABBREV = {"e.g", "i.e", "etc", "vs", "approx", "fig", "no", "eq", "ref", "dr", "mr", "mrs", "ms", "inc", "ltd", "cf", "al"}
_CONTRACTIONS = {
    "don't": "do not", "doesn't": "does not", "didn't": "did not", "can't": "cannot", "won't": "will not",
    "isn't": "is not", "aren't": "are not", "wasn't": "was not", "weren't": "were not", "hasn't": "has not",
    "haven't": "have not", "hadn't": "had not", "shouldn't": "should not", "wouldn't": "would not",
    "couldn't": "could not", "it's": "it is", "that's": "that is", "there's": "there is", "we've": "we have",
    "we're": "we are", "they're": "they are", "they've": "they have", "we'll": "we will", "won’t": "will not",
    "don’t": "do not", "doesn’t": "does not", "can’t": "cannot", "isn’t": "is not", "it’s": "it is",
}
_CONTR_RE = re.compile(r"\b(" + "|".join(re.escape(k) for k in _CONTRACTIONS) + r")\b", re.I)
_SMALL = {"a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on", "or", "the", "to", "vs", "via", "with", "per"}
_MARK = r"[\*`_]*"


def _contraction(m):
    out = _CONTRACTIONS[m.group(1).lower()]
    return out[0].upper() + out[1:] if m.group(1)[0].isupper() else out


def _cap_after_period(m):
    word = re.search(r"([\w.]+)\.\s+$", m.string[: m.end()])
    prev = (word.group(1).lower().rstrip(".") if word else "")
    return m.group(0) if prev in _ABBREV or len(prev) == 1 else m.group(1) + m.group(2).upper()


def capitalize_start(text):
    m = re.match(rf"({_MARK})([a-z])(?=[a-z]*\b)", text)
    if not m:
        return text
    word = re.match(r"[A-Za-z]+", text[len(m.group(1)):]).group(0)
    if word in {"pH", "e", "i"} or (len(word) > 1 and any(c.isupper() for c in word)):
        return text
    return m.group(1) + m.group(2).upper() + text[m.end():]


def clean_inline(text):
    t = text.replace(" ", " ").replace("\t", " ")
    t = re.sub(r"[ ]{2,}", " ", t).strip()
    t = re.sub(r"\s+([,;:.!?])", r"\1", t)                       # no space before punctuation
    t = re.sub(r"(?<=[a-z]),(?=[A-Za-z])", ", ", t)               # missing space after comma
    t = _CONTR_RE.sub(_contraction, t)
    t = _UNIT_RE.sub(r"\1 \2", t)
    t = re.sub(r"(?<=\d )m([23])(?![\w])", lambda m: "m" + ("²" if m.group(1) == "2" else "³"), t)
    t = re.sub(r"(?<=\w) - (?=\w)", " – ", t)                     # spaced hyphen -> en dash
    t = re.sub(r'(^|[\s(\[])"', r"\1“", t).replace('"', "”")      # smart quotes
    t = re.sub(r"(^|[\s(\[])'(?=\w)", r"\1‘", t)
    t = re.sub(r"(?<=\w)'(?=\w)", "’", t).replace("'", "’")
    t = re.sub(r"([.!?]\s+)([a-z])", _cap_after_period, t)
    return capitalize_start(t)


def finish_paragraph(text):
    """Full stop at the end of a real sentence-style paragraph."""
    plain = re.sub(r"[\*`]", "", text)
    if len(plain.split()) >= 4 and re.search(r"[A-Za-z0-9\)]$", plain):
        return text + "."
    return text


def finish_bullet(text):
    return capitalize_start(text.rstrip(";,"))


def strip_markup(text):
    return re.sub(r"(\*\*|\*|`)", "", text)


def clean_heading(text, acronyms=frozenset()):
    t = strip_markup(text).strip()
    t = re.sub(r"^(?:section|chapter|part)\s+\d+[:.\-–]?\s*", "", t, flags=re.I)
    t = re.sub(r"^(?:\d+(?:\.\d+)*[.)]?|[A-Z][.)])\s+", "", t)     # numbering is regenerated
    t = t.rstrip(":.;—–- ").strip()
    t = re.sub(r"\s+", " ", t)
    words, out = t.split(" "), []
    shouty = t.isupper()
    for i, w in enumerate(words):
        core = re.sub(r"\W", "", w)
        if shouty and (core in acronyms or (len(core) <= 3 and core.isalpha() and core.lower() not in _SMALL)):
            out.append(w)
        elif shouty or w.islower():
            lw = w.lower()
            out.append(lw if (i and lw in _SMALL) else lw[:1].upper() + lw[1:])
        else:
            out.append(w)
    return " ".join(out)


def sentences(text):
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+(?=[A-Z0-9“\"(])", strip_markup(text)) if s.strip()]


def numbers_in(text):
    return sorted(re.findall(r"\d+(?:[.,]\d+)?", text))
