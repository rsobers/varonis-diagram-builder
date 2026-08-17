"""Build a single self-contained HTML copy of the style guide,
with every diagram inlined so the file can be shared on its own."""
import re, markdown

md = open('varonis-diagram-style-guide.md').read()

def inline(m):
    alt, src = m.group(1), m.group(2)
    svg = open(src).read()
    svg = re.sub(r'<\?xml[^>]*\?>', '', svg)
    svg = svg.replace('<svg ', '<svg role="img" aria-label="%s" ' % alt.replace('"', "'"), 1)
    svg = re.sub(r'(<svg[^>]*?)width="\d+" height="\d+"', r'\1', svg, count=1)
    return '<figure>%s<figcaption>%s</figcaption></figure>' % (svg, alt)

md = re.sub(r'!\[([^\]]*)\]\(([^)]+\.svg)\)', inline, md)
body = markdown.markdown(md, extensions=['tables', 'fenced_code'])
# section rules are drawn by the h2 border-top; drop the markdown <hr> that precedes them
body = re.sub(r'<hr\s*/?>\s*(?=<h2)', '', body)

CSS = """
:root { --ink:#1f2933; --sub:#5a6570; --line:#e4e8ec; --accent:#1c6fd0; }
* { box-sizing:border-box; }
body { font-family:'Segoe UI',system-ui,-apple-system,sans-serif; color:var(--ink);
  max-width:860px; margin:0 auto; padding:48px 24px 96px; line-height:1.65; font-size:15.5px; }
h1 { font-size:30px; letter-spacing:-.4px; margin:0 0 4px; }
h2 { font-size:21px; margin:52px 0 12px; padding-top:20px; border-top:1px solid var(--line); }
h3 { font-size:16.5px; margin:30px 0 8px; }
h4 { font-size:14px; margin:20px 0 6px; color:var(--sub); }
p, li { color:#28323d; }
code { font:13px ui-monospace,Menlo,Consolas,monospace; background:#f2f5f8;
  padding:1.5px 5px; border-radius:4px; }
pre { background:#f8fafb; border:1px solid var(--line); border-radius:8px;
  padding:16px; overflow-x:auto; font-size:12.5px; line-height:1.5; }
pre code { background:none; padding:0; }
table { border-collapse:collapse; width:100%; margin:16px 0; font-size:14px; }
th, td { border:1px solid var(--line); padding:8px 11px; text-align:left; vertical-align:top; }
th { background:#f8fafb; font-weight:600; }
figure { margin:24px 0 28px; padding:20px; border:1px solid var(--line);
  border-radius:10px; background:#fff; overflow-x:auto; }
figure svg { width:100%; height:auto; display:block; }
figcaption { margin-top:12px; font-size:12.5px; color:var(--sub); text-align:center; }
blockquote { border-left:3px solid var(--accent); margin:16px 0; padding:2px 0 2px 16px; color:var(--sub); }
hr { border:none; border-top:1px solid var(--line); margin:40px 0; }
strong { font-weight:600; }
em { color:var(--sub); }
@media print { body { max-width:none; } h2 { page-break-after:avoid; } figure { page-break-inside:avoid; } }
"""

html = ('<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<title>Varonis Diagram Style Guide v2.0</title>'
        '<style>%s</style></head><body>%s</body></html>' % (CSS, body))
open('varonis-diagram-style-guide.html', 'w').write(html)
print('built %d KB' % (len(html) // 1024))
