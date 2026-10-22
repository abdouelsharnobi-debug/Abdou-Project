# Report Polisher

A local tool that turns any technical report from your team – messy Word, PDF, Markdown or plain text – into a
standard, professionally formatted report. **Everything runs on your computer; nothing is uploaded.**

## What it does automatically

| Step | Result |
|---|---|
| Reads the file | `.docx`, `.pdf`, `.md`, `.txt` (headings, lists, tables, images, bold/italic) |
| Finds the cover details | `Author:`, `Date:`, `Report No:`, `Client:`, `Project:` … lines or a key/value table are moved onto the cover page |
| Standardises the structure | Executive Summary → Introduction → Scope → Methodology → Findings → Analysis → Conclusions → Recommendations → References → Appendices. Out-of-order sections are reordered; unknown sections keep their place |
| Writes the Executive Summary | If the report has none, one is extracted from the findings, conclusions and recommendations (flagged for review) |
| Cleans the language | Capitalisation, spacing, smart quotes, "120m3/h" → "120 m³/h", "25°C" → "25 °C", contractions expanded, headings in Title Case, final full stops, consistent bullets. Numbers are never altered |
| Formats it | Cover page, contents list with page numbers, numbered headings (1, 1.1, 1.1.1), lettered appendices, styled tables with numbered captions, figures, header and "Page x of y" footer |
| Tells you what it could not fix | `*_review_notes.md`: missing sections, leftover `TODO`/`TBD`, tables or figures without captions, empty fields, very long paragraphs |

Output (in `polished/` by default): `<name>_formatted.docx`, `<name>_formatted.pdf` (when LibreOffice is installed)
and `<name>_formatted_review_notes.md`.

## Use it

Requires Python 3.9+. Install once: `pip install -r requirements.txt`.

```
python -m reportpolish serve                       # web page on this PC: drag a report in, download the result
python -m reportpolish report.docx other.pdf -o out/   # command line, any number of files
python -m reportpolish watch inbox/ outbox/        # drop files into inbox/, results appear in outbox/
```

On Windows double-click `Start Report Polisher.bat`; on macOS/Linux run `./start.sh`.

### Company look

Pass `--company "Acme Engineering" --logo logo.png --color 1F3864 --confidential "Confidential – internal use"`,
or put them in a `brand.json` next to where you run the tool:

```json
{ "company": "Acme Engineering", "logo": "logo.png", "accent": "1F3864", "confidential": "Confidential – internal use" }
```

Override cover fields per run: `--title --author --date --project --client --docno --revision`.

### Optional: local AI

`--ai llama3.1` uses a model served by [Ollama](https://ollama.com) on this PC to write the Executive Summary and to
smooth the wording of paragraphs. Any rewrite that changes, adds or drops a number is discarded and the original text
is kept; if Ollama is not running the tool silently falls back to the rule-based result.

## Limits worth knowing

- It is rule-based: it standardises form and flags gaps, it does not check engineering content. Always read the
  generated Executive Summary and the review notes before issuing.
- PDF input is text-only extraction; scanned PDFs (images) are not supported and complex layouts may need a look.
- Page numbers in the contents list are computed with LibreOffice. In Word, right-click the list → *Update field*
  if you edit the document afterwards.

## Tests

`python -m unittest discover -s tests -t .`
