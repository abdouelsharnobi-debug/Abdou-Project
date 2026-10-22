import argparse
import json
import sys
import time
from pathlib import Path

from .llm import Ollama
from .model import Branding
from .pipeline import convert

EXTS = {".docx", ".pdf", ".md", ".txt", ".markdown"}


def _brand(args):
    cfg = {}
    for cand in (args.brand, "brand.json"):
        if cand and Path(cand).is_file():
            cfg = json.loads(Path(cand).read_text(encoding="utf-8"))
            break
    pick = lambda a, k, d="": a if a else cfg.get(k, d)
    return Branding(company=pick(args.company, "company"), logo=pick(args.logo, "logo"),
                    accent=pick(args.color, "accent", "1F3864").lstrip("#"),
                    confidential=pick(args.confidential, "confidential"))


def _common(p):
    p.add_argument("--company", help="Company name shown on the cover and footer")
    p.add_argument("--logo", help="Logo image (PNG/JPG) for the cover page")
    p.add_argument("--color", help="Accent colour as hex, e.g. 1F3864")
    p.add_argument("--confidential", help='Footer / cover text, e.g. "Confidential – internal use"')
    p.add_argument("--brand", help="brand.json with company/logo/accent/confidential (default: ./brand.json)")
    p.add_argument("--no-pdf", action="store_true", help="Do not also write a PDF")
    p.add_argument("--ai", metavar="MODEL", help="Use a local Ollama model (e.g. llama3.1) to write the summary "
                                                 "and polish wording; numbers are verified and never changed")


def _run(path, outdir, args):
    ai = Ollama(args.ai) if args.ai else None
    over = {k: getattr(args, k, None) for k in ("title", "author", "date", "project", "client", "docno", "revision")}
    res = convert(path, outdir, _brand(args), over, not args.no_pdf, ai)
    print(f"✔ {Path(path).name}")
    for k in ("docx", "pdf", "notes"):
        if res[k]:
            print(f"    {k:5} {res[k]}")
    warn = [m for s, m in res["report"].notes if s == "warning"]
    for m in warn:
        print(f"    ⚠ {m}")
    return res


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    if argv and argv[0] not in {"convert", "serve", "watch", "-h", "--help"}:
        argv.insert(0, "convert")
    ap = argparse.ArgumentParser(prog="reportpolish", description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("convert", help="Convert one or more reports")
    c.add_argument("files", nargs="+")
    c.add_argument("-o", "--out", default="polished", help="Output folder (default ./polished)")
    for k in ("title", "author", "date", "project", "client", "docno", "revision"):
        c.add_argument(f"--{k}", help=f"Set/override document {k}")
    _common(c)
    s = sub.add_parser("serve", help="Local web page: drag a report in, get the polished one back")
    s.add_argument("--port", type=int, default=8765)
    s.add_argument("--no-browser", action="store_true")
    _common(s)
    w = sub.add_parser("watch", help="Convert every report that appears in INBOX automatically")
    w.add_argument("inbox")
    w.add_argument("outbox")
    _common(w)
    args = ap.parse_args(argv)

    if args.cmd == "convert":
        for f in args.files:
            try:
                _run(f, args.out, args)
            except Exception as e:
                print(f"✘ {f}: {e}", file=sys.stderr)
    elif args.cmd == "serve":
        from .webui import serve
        serve(args.port, _brand(args), args.ai, not args.no_browser, not args.no_pdf)
    else:
        inbox, outbox = Path(args.inbox), Path(args.outbox)
        inbox.mkdir(parents=True, exist_ok=True)
        done = inbox / "_processed"
        done.mkdir(exist_ok=True)
        print(f"Watching {inbox} … drop reports in; results go to {outbox}. Ctrl+C to stop.")
        while True:
            for f in sorted(inbox.iterdir()):
                if f.is_file() and f.suffix.lower() in EXTS and time.time() - f.stat().st_mtime > 2:
                    try:
                        _run(f, outbox, args)
                        f.rename(done / f.name)
                    except Exception as e:
                        print(f"✘ {f.name}: {e}", file=sys.stderr)
                        f.rename(done / (f.name + ".failed"))
            time.sleep(3)


if __name__ == "__main__":
    main()
