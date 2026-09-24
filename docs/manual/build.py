"""Genera manual-usuario.pdf desde manual-usuario.html con Chrome headless.

Dos pasadas: la primera ubica en qué página cae cada sección; la segunda
escribe esos números en el índice. Uso: python3 docs/manual/build.py
"""
import re, subprocess, tempfile
from pathlib import Path
from pypdf import PdfReader

HERE = Path(__file__).parent
SRC = HERE / 'manual-usuario.html'
OUT = HERE.parent / 'manual-usuario-dark-kitchen.pdf'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'


def render(html: Path, pdf: Path) -> None:
    subprocess.run(
        [CHROME, '--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--run-all-compositor-stages-before-draw',
         f'--print-to-pdf={pdf}', html.as_uri()],
        check=True, capture_output=True,
    )


def norm(s: str) -> str:
    # casefold: el título del capítulo se ve en MAYÚSCULAS por CSS.
    return re.sub(r'\s+', ' ', s).strip().casefold()


html = SRC.read_text(encoding='utf-8')

# Texto que identifica cada sección en el PDF: "Capítulo N" para capítulos, el título numerado para subsecciones.
markers = {}
for m in re.finditer(r'<p class="chapter-kicker">(Capítulo \d+)</p>\s*<h2[^>]*data-toc="(c\d+)"', html):
    markers[m.group(2)] = norm(m.group(1))
for m in re.finditer(r'<h3 id="(c[\d-]+)" data-toc="[^"]+">([^<]+)</h3>', html):
    markers[m.group(1)] = norm(m.group(2)).split(" (")[0]  # sin símbolos como (⋯), que el PDF extrae distinto

with tempfile.TemporaryDirectory() as tmp:
    first = Path(tmp) / 'pass1.pdf'
    render(SRC, first)
    pages = [norm(p.extract_text() or '') for p in PdfReader(first).pages]

pages_of = {}
for key, text in markers.items():
    # Desde la página 3: portada e índice no cuentan (el índice repite los títulos sin número).
    hit = next((i + 1 for i, t in enumerate(pages) if i >= 2 and text in t), None)
    if hit is None:
        raise SystemExit(f'No encontré la sección {key!r} ({text!r}) en el PDF')
    pages_of[key] = hit

filled = re.sub(r'<span class="pg" data-for="([^"]+)"></span>', lambda m: f'<span class="pg" data-for="{m.group(1)}">{pages_of[m.group(1)]}</span>', html)
final_html = HERE / '.manual-final.html'
final_html.write_text(filled, encoding='utf-8')
try:
    render(final_html, OUT)
finally:
    final_html.unlink()

print(f'{OUT} — {len(PdfReader(OUT).pages)} páginas')
for key, page in pages_of.items():
    print(f'  {key:6} p.{page:<3} {markers[key]}')
