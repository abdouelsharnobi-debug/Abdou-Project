"""Tiny local web UI (127.0.0.1 only, nothing leaves this computer)."""
import json
import tempfile
import threading
import uuid
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urlparse

from .llm import Ollama
from .pipeline import convert

PAGE = """<!doctype html><meta charset=utf-8><title>Report Polisher</title>
<meta name=viewport content="width=device-width,initial-scale=1">
<style>
:root{--ink:#1b2430;--mut:#667085;--acc:#1f3864;--bg:#f5f7fa;--card:#fff;--line:#d9dee6}
@media(prefers-color-scheme:dark){:root{--ink:#e8ecf1;--mut:#9aa6b6;--acc:#8fb3f0;--bg:#10151c;--card:#18202a;--line:#2b3644}}
*{box-sizing:border-box}body{margin:0;font:16px/1.5 system-ui,Segoe UI,sans-serif;background:var(--bg);color:var(--ink)}
main{max-width:760px;margin:0 auto;padding:32px 16px}h1{font-size:26px;margin:0 0 4px;color:var(--acc)}
p.s{color:var(--mut);margin:0 0 24px}
#drop{border:2px dashed var(--line);background:var(--card);border-radius:12px;padding:48px 16px;text-align:center;cursor:pointer}
#drop.o{border-color:var(--acc)}#drop b{color:var(--acc)}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin-top:14px}
.card h3{margin:0 0 6px;font-size:16px}a.b{display:inline-block;margin:4px 8px 0 0;padding:6px 12px;border-radius:6px;background:var(--acc);color:var(--bg);text-decoration:none;font-size:14px}
a.b.g{background:none;border:1px solid var(--line);color:var(--ink)}ul{margin:8px 0 0 18px;padding:0;color:var(--mut);font-size:14px}
details{margin-top:18px}summary{cursor:pointer;color:var(--mut)}.f{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}
.f input{padding:8px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--ink);font:inherit}
.err{color:#c0392b}
</style><main><h1>Report Polisher</h1>
<p class=s>Drop a technical report (.docx, .pdf, .md, .txt). You get a standard, professionally formatted report back. Everything stays on this computer.</p>
<div id=drop><b>Click to choose</b> or drag files here<input id=file type=file multiple hidden accept=".docx,.pdf,.md,.txt"></div>
<details><summary>Optional: set or override cover details</summary><div class=f>
<input id=title placeholder=Title><input id=author placeholder="Prepared by"><input id=docno placeholder="Document no.">
<input id=revision placeholder=Revision><input id=client placeholder=Client><input id=project placeholder=Project></div></details>
<div id=out></div></main>
<script>
const d=document.getElementById('drop'),fi=document.getElementById('file'),out=document.getElementById('out');
d.onclick=()=>fi.click();fi.onchange=()=>go(fi.files);
d.ondragover=e=>{e.preventDefault();d.classList.add('o')};d.ondragleave=()=>d.classList.remove('o');
d.ondrop=e=>{e.preventDefault();d.classList.remove('o');go(e.dataTransfer.files)};
const esc=s=>s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
async function go(files){for(const f of files){
 const c=document.createElement('div');c.className='card';c.innerHTML='<h3>'+esc(f.name)+'</h3>Converting…';out.prepend(c);
 const q=new URLSearchParams({name:f.name});for(const k of ['title','author','docno','revision','client','project']){const v=document.getElementById(k).value;if(v)q.set(k,v)}
 try{const r=await fetch('/convert?'+q,{method:'POST',body:f});const j=await r.json();if(!r.ok)throw new Error(j.error);
  c.innerHTML='<h3>'+esc(f.name)+'</h3>'+j.files.map(x=>'<a class="b'+(x.kind=='notes'?' g':'')+'" href="'+x.url+'" download>'+x.label+'</a>').join('')+
  (j.notes.length?'<ul>'+j.notes.map(n=>'<li>'+esc(n)+'</li>').join('')+'</ul>':'')}
 catch(e){c.innerHTML='<h3>'+esc(f.name)+'</h3><span class=err>'+esc(e.message)+'</span>'}}}
</script>"""


def serve(port, brand, ai_model, open_browser=True, want_pdf=True):
    work = Path(tempfile.mkdtemp(prefix="reportpolish_"))

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def _send(self, code, body, ctype="application/json", extra=None):
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            u = urlparse(self.path)
            if u.path == "/":
                return self._send(200, PAGE.encode(), "text/html; charset=utf-8")
            parts = unquote(u.path).strip("/").split("/")
            if len(parts) == 3 and parts[0] == "out" and ".." not in parts[1] + parts[2] and "/" not in parts[2]:
                f = work / parts[1] / parts[2]
                if f.is_file():
                    return self._send(200, f.read_bytes(), "application/octet-stream",
                                      {"Content-Disposition": f'attachment; filename="{f.name}"'})
            self._send(404, b'{"error":"not found"}')

        def do_POST(self):
            u = urlparse(self.path)
            q = {k: v[0] for k, v in parse_qs(u.query).items()}
            try:
                n = int(self.headers.get("Content-Length", 0))
                job = uuid.uuid4().hex[:10]
                inp = work / job / "in"
                inp.mkdir(parents=True)
                src = inp / Path(q.get("name", "report.txt")).name
                src.write_bytes(self.rfile.read(n))
                over = {k: q.get(k) for k in ("title", "author", "docno", "revision", "client", "project")}
                res = convert(src, work / job, brand, over, want_pdf, Ollama(ai_model) if ai_model else None)
                files = []
                for kind, label in (("docx", "Word (.docx)"), ("pdf", "PDF"), ("notes", "Review notes")):
                    if res[kind]:
                        files.append({"kind": kind, "label": label, "url": f"/out/{job}/{quote(res[kind].name)}"})
                notes = [f"{s.title()}: {m}" for s, m in res["report"].notes if s != "info"]
                self._send(200, json.dumps({"files": files, "notes": notes}).encode())
            except Exception as e:
                self._send(400, json.dumps({"error": str(e)}).encode())

    srv = ThreadingHTTPServer(("127.0.0.1", port), H)
    url = f"http://127.0.0.1:{port}/"
    print(f"Report Polisher running at {url}   (Ctrl+C to stop)")
    if open_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
