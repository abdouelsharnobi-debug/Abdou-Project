import re
from pathlib import Path

from .ingest import read_report
from .model import Branding
from .render import render
from .structure import structure

ICON = {"warning": "⚠", "review": "✎", "info": "ℹ"}


def convert(src, outdir, brand=None, overrides=None, want_pdf=True, ai=None):
    src, outdir = Path(src), Path(outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    report = read_report(src)
    report.meta.update({k: v for k, v in (overrides or {}).items() if v})
    report = structure(report, ai=ai)
    stem = re.sub(r"[^\w.-]+", "_", src.stem) + "_formatted"
    docx_path, pdf_path = render(report, outdir / f"{stem}.docx", brand or Branding(), want_pdf)
    notes_path = outdir / f"{stem}_review_notes.md"
    order = {"warning": 0, "review": 1, "info": 2}
    lines = [f"# Review notes – {report.meta['title']}", "",
             f"Source file: `{src.name}`", "",
             "Items the tool could not settle by itself. Fix them in the source or in the formatted file.", ""]
    for sev, msg in sorted(report.notes, key=lambda n: order[n[0]]):
        lines.append(f"- {ICON[sev]} **{sev.title()}** – {msg}")
    if not report.notes:
        lines.append("- No issues found.")
    notes_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return {"docx": docx_path, "pdf": pdf_path, "notes": notes_path, "report": report}
