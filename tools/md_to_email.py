"""md_to_email.py -- turn WHAT_WE_DID.md into email-ready HTML for Apple Mail copy/paste.

    python3 tools/md_to_email.py [WHAT_WE_DID.md] [docs/WHAT_WE_DID_email.html]

Inline styles only; images resized to 640 px (macOS `sips`) and embedded as data URIs so they copy
along with the text. An image whose alt text contains "(small)" is shown small with a red caption.
Then: open the HTML in Safari, Cmd+A, Cmd+C, paste into a Rich Text message in Mail.
"""
import base64
import html
import re
import subprocess
import sys
import tempfile
from pathlib import Path

SRC = Path(sys.argv[1] if len(sys.argv) > 1 else "WHAT_WE_DID.md")
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else "docs/WHAT_WE_DID_email.html")
FONT = "font-family:-apple-system,Helvetica,Arial,sans-serif;"
TEXT = f"{FONT}font-size:15px;line-height:1.5;color:#1d2a33;"
tmp = Path(tempfile.mkdtemp())


def inline(t: str) -> str:
    t = html.escape(t, quote=False)
    t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)
    t = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])", r"<i>\1</i>", t)
    return re.sub(r"`(.+?)`", r'<code style="font-family:Menlo,monospace;font-size:13px;background:#eef2f5;padding:1px 4px;border-radius:3px;">\1</code>', t)


def embedded(path: Path) -> str:
    small = tmp / path.name
    subprocess.run(["sips", "-Z", "640", "-s", "formatOptions", "80", str(path), "--out", str(small)], check=True, capture_output=True)
    return "data:image/jpeg;base64," + base64.b64encode(small.read_bytes()).decode()


def image(alt: str, src: str, caption: str) -> str:
    is_small = "(small)" in alt
    alt = alt.replace("(small)", "").strip()
    width = 220 if is_small else 600
    cap_style = f"{FONT}font-size:13px;margin-top:5px;" + ("color:#c62828;font-weight:700;" if is_small else "color:#667;font-style:italic;")
    img = (f'<img src="{embedded(SRC.parent / src)}" width="{width}" alt="{html.escape(alt)}" '
           f'style="width:100%;max-width:{width}px;height:auto;border-radius:8px;display:block;">')
    cap = f'<div style="{cap_style}">{inline(caption)}</div>' if caption else ""
    return f'<div style="margin:6px 0 16px;max-width:{width if is_small else 600}px;">{img}{cap}</div>'


lines = SRC.read_text().split("\n")
out, i = [], 0
while i < len(lines):
    line = lines[i]
    if line.startswith("# "):
        out.append(f'<h1 style="{FONT}font-size:24px;color:#c8462a;margin:0 0 14px;">{inline(line[2:])}</h1>')
    elif line.startswith("## "):
        out.append(f'<h2 style="{FONT}font-size:18px;color:#1d2a33;margin:22px 0 8px;">{inline(line[3:])}</h2>')
    elif line.startswith("!["):
        alt, src = re.match(r"!\[(.*?)\]\((.+?)\)", line).groups()
        caption = ""
        if i + 1 < len(lines) and lines[i + 1].startswith("*") and lines[i + 1].endswith("*"):
            caption, i = lines[i + 1].strip("*"), i + 1
        out.append(image(alt, src, caption))
    elif line.startswith("|"):
        rows = []
        while i < len(lines) and lines[i].startswith("|"):
            if not re.match(r"^\|[\s\-|]+\|$", lines[i]):
                rows.append([c.strip() for c in lines[i].strip("|").split("|")])
            i += 1
        i -= 1
        cells = []
        for r, row in enumerate(rows):
            tag, bg = ("th", "background:#f3f6f8;") if r == 0 else ("td", "")
            cells.append("<tr>" + "".join(
                f'<{tag} style="border-bottom:1px solid #dde3e8;text-align:left;padding:6px 10px;{bg}">{inline(c)}</{tag}>' for c in row) + "</tr>")
        out.append(f'<table cellpadding="6" cellspacing="0" style="border-collapse:collapse;margin:4px 0 14px;{FONT}font-size:14px;color:#1d2a33;">{"".join(cells)}</table>')
    elif line.startswith("- "):
        items = []
        while i < len(lines) and lines[i].startswith("- "):
            items.append(lines[i][2:])
            i += 1
        i -= 1
        out.append(f'<ul style="{TEXT}margin:0 0 12px;padding-left:22px;">' + "".join(f'<li style="margin-bottom:6px;">{inline(x)}</li>' for x in items) + "</ul>")
    elif line.strip():
        out.append(f'<p style="{TEXT}margin:0 0 12px;">{inline(line)}</p>')
    i += 1

title = re.sub(r"<[^>]+>", "", inline(lines[0].lstrip("# ")))
OUT.write_text(f'<!doctype html><html><head><meta charset="utf-8"><title>{title}</title></head>\n'
               f'<body style="margin:0;padding:24px;background:#ffffff;"><div style="max-width:620px;margin:0 auto;">\n'
               + "\n".join(out) + "\n</div></body></html>\n")
print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB)")
