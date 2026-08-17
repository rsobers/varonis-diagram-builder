"""Varonis Diagram Style Guide v2.0 — reference renderer.
Every constant here is read from the token block in the style guide."""
import json, html

ICONS = json.load(open('icons.json'))

PALETTE = {
    'white': ('#ffffff', '#d3d9e0'),
    'gray':  ('#f4f6f8', '#d3d9e0'),
    'blue':  ('#e8f1fc', '#a3c2ea'),
    'red':   ('#fdeaea', '#eda9a9'),
    'amber': ('#fdf6e0', '#e8d38a'),
    'green': ('#eef8e4', '#b9dd9a'),
}
INK, SUB, ICON_C = '#1f2933', '#5a6570', '#263238'
CONN, CONN_D = '#3f4a56', '#9aa4b0'
LBL_S, BND_S, OPT_C = '#cdd4dc', '#a9b2bd', '#7a8794'
SIZES = {'sm': (150, 34), 'md': (180, 64), 'lg': (180, 92)}
MONO = "ui-monospace,Menlo,Consolas,monospace"


def esc(s):
    return html.escape(str(s), quote=True)


def icon(key, x, y, scale=0.667, fill=ICON_C):
    if not key:
        return ''
    return (f'<g transform="translate({x},{y}) scale({scale})">'
            f'<path d="{ICONS[key]}" fill="{fill}"/></g>')


WARNINGS = []


def _cw(ch, size):
    """Approximate advance width for Segoe UI / system-ui at a given size."""
    if ch in "iljt.,:;'!|[]()":
        f = 0.30
    elif ch in "fr ":
        f = 0.36
    elif ch in "mw":
        f = 0.85
    elif ch in "MW@":
        f = 0.95
    elif ch.isupper() or ch.isdigit():
        f = 0.62
    else:
        f = 0.55
    return f * size


def text_width(s, size=12.5):
    return sum(_cw(c, size) for c in s)


def wrap(text, maxpx, size=12.5, label=''):
    """Width-aware greedy wrap. Warns at build time if the text cannot fit."""
    words = text.split()
    if not words:
        return ['']
    out, cur = [], words[0]
    for w in words[1:]:
        if text_width(cur + ' ' + w, size) <= maxpx:
            cur += ' ' + w
        else:
            out.append(cur); cur = w
    out.append(cur)
    for ln in out:
        if text_width(ln, size) > maxpx:
            WARNINGS.append(f'"{ln}" overflows its element ({label or text})')
    if len(out) > 3:
        WARNINGS.append(f'"{text}" exceeds 3 lines and was truncated')
    return out[:3]


class Diagram:
    def __init__(self, w, h, title=None):
        self.w, self.h, self.title = w, h, title
        self.boundaries, self.blabels, self.edges, self.nodes, self.labels = [], [], [], [], []

    # ---- containers -------------------------------------------------
    def boundary(self, x, y, w, h, label, filled=False, label_side='left', tint=None):
        """tint: only under a State encoding, when the zone itself is the claim."""
        if tint:
            fill, stroke = PALETTE[tint]
            back = fill
        else:
            fill = '#f8f9fa' if filled else 'none'
            stroke = BND_S
            back = '#f8f9fa' if filled else '#ffffff'
        self.boundaries.append(
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}" '
            f'stroke="{stroke}" stroke-width="1.2" stroke-dasharray="6 4"/>')
        tw = text_width(label, 12) + 12
        if label_side == 'right':
            tx, anchor, bx = x + w - 15, ' text-anchor="end"', x + w - 15 - tw + 6
        else:
            tx, anchor, bx = x + 15, '', x + 9
        self.blabels.append(
            f'<rect x="{bx}" y="{y+8}" width="{tw}" height="18" fill="{back}"/>'
            f'<text x="{tx}" y="{y+21}"{anchor} font-size="12" fill="{SUB}">{esc(label)}</text>')

    def zone_divider(self, x, y1, y2, label):
        """Linear trust demarcation. Label chip is horizontal, at the top."""
        self.boundaries.append(
            f'<line x1="{x}" y1="{y1+22}" x2="{x}" y2="{y2}" stroke="{BND_S}" '
            f'stroke-width="1" stroke-dasharray="6 4"/>')
        w = len(label) * 5.6 + 20
        self.boundaries.append(
            f'<rect x="{x-w/2}" y="{y1}" width="{w}" height="18" rx="9" fill="#ffffff" stroke="{BND_S}"/>'
            f'<text x="{x}" y="{y1+12}" text-anchor="middle" font-size="8" font-weight="700" '
            f'font-family="{MONO}" fill="{SUB}">{esc(label.upper())}</text>')

    # ---- elements ---------------------------------------------------
    def element(self, x, y, label, size='sm', color='white', ic=None, sub=None):
        w, h = SIZES[size]
        f, s = PALETTE[color]
        g = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{f}" stroke="{s}"/>']
        if size == 'sm':
            if ic:
                g.append(icon(ic, x + 10, y + 9))
            tx = x + 31 if ic else x + w / 2
            anchor = '' if ic else ' text-anchor="middle"'
            avail = w - (46 if ic else 30)
            if text_width(label, 12) > avail:
                WARNINGS.append(f'"{label}" is too long for a small element — use medium')
            g.append(f'<text x="{tx}" y="{y+h/2+4}"{anchor} font-size="12" fill="{INK}">{esc(label)}</text>')
        else:
            lines = wrap(label, w - 30, 12.5, label)
            n = len(lines) + (1 if sub else 0)
            if ic and len(lines) > 1 and h < 92:
                WARNINGS.append(f'"{label}" needs a large element (icon + two lines)')
            if ic:
                # icon (16px) centred above the label; whole block centred in the box
                block = 16 + 6 + n * 16
                top = y + (h - block) / 2
                g.append(icon(ic, x + w / 2 - 8, top))
                ty = top + 16 + 6 + 12
            else:
                ty = y + h / 2 + 4 - (n - 1) * 8
            for ln in lines:
                g.append(f'<text x="{x+w/2}" y="{ty}" text-anchor="middle" font-size="12.5" fill="{INK}">{esc(ln)}</text>')
                ty += 16
            if sub:
                g.append(f'<text x="{x+w/2}" y="{ty}" text-anchor="middle" font-size="11.5" fill="{INK}">{esc(sub)}</text>')
        self.nodes.append(''.join(g))
        return (x + w / 2, y + h / 2, w, h)

    def grouped(self, x, y, label, children, color='white'):
        w = 190
        h = 46 + len(children) * 30 + (len(children) - 1) * 5 + 10
        f, s = PALETTE[color]
        g = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{f}" stroke="{s}"/>',
             f'<text x="{x+w/2}" y="{y+26}" text-anchor="middle" font-size="12" fill="{INK}">{esc(label)}</text>']
        for i, (clabel, cic) in enumerate(children):
            cy = y + 46 + i * 35
            g.append(f'<rect x="{x+10}" y="{cy}" width="{w-20}" height="30" fill="#ffffff" stroke="#d3d9e0"/>')
            if cic:
                g.append(icon(cic, x + 18, cy + 7))
            tx = x + 41 if cic else x + w / 2
            anchor = '' if cic else ' text-anchor="middle"'
            g.append(f'<text x="{tx}" y="{cy+19}"{anchor} font-size="11.5" fill="{INK}">{esc(clabel)}</text>')
        self.nodes.append(''.join(g))
        return (x + w / 2, y + h / 2, w, h)

    def inline_control(self, x, y, label, ic=None):
        """Stadium. A component traffic passes THROUGH. Grayscale by default."""
        w = max(90, len(label) * 7.0 + (34 if ic else 24))
        h = 36
        g = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="18" fill="#ffffff" '
             f'stroke="{LBL_S}" stroke-width="1.5"/>']
        if ic:
            g.append(icon(ic, x + 12, y + 10, 0.667))
        tx = x + 38 if ic else x + w / 2
        anchor = '' if ic else ' text-anchor="middle"'
        g.append(f'<text x="{tx}" y="{y+h/2+4}"{anchor} font-size="12" fill="{INK}">{esc(label)}</text>')
        self.nodes.append(''.join(g))
        return (x + w / 2, y + h / 2, w, h)

    def actor(self, cx, y, label, ic='person'):
        g = [icon(ic, cx - 16, y, 1.333)]
        g.append(f'<text x="{cx}" y="{y+50}" text-anchor="middle" font-size="12" fill="{INK}">{esc(label)}</text>')
        self.nodes.append(''.join(g))
        return (cx, y + 16, 32, 32)

    # ---- connectors -------------------------------------------------
    def edge(self, pts, dashed=False, arrow=True):
        d = 'M' + ' L'.join(f'{x},{y}' for x, y in pts)
        col = CONN_D if dashed else CONN
        dash = ' stroke-dasharray="5 4"' if dashed else ''
        mk = f' marker-end="url(#{"ard" if dashed else "ar"})"' if arrow else ''
        self.edges.append(f'<path d="{d}" fill="none" stroke="{col}" stroke-width="1.3"{dash}{mk}/>')

    def clabel(self, cx, cy, text, optional=None, num=None):
        """Connector label pill. Always horizontal, text always optically centred."""
        CW, GAP = 5.0, 8
        lines = text.upper().split('\n')
        opt = (optional or '').upper()
        lw = [len(l) * CW + (GAP + len(opt) * CW if i == len(lines) - 1 and opt else 0)
              for i, l in enumerate(lines)]
        badge = 20 if num else 0
        w = max(46, max(lw) + 22 + badge)
        h = 32 if len(lines) > 1 else 18
        x, y = cx - w / 2, cy - h / 2
        g = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{h/2}" fill="#ffffff" stroke="{LBL_S}"/>']
        if num:
            g.append(f'<circle cx="{x+13}" cy="{cy}" r="7.5" fill="#ffffff" stroke="{LBL_S}"/>'
                     f'<text x="{x+13}" y="{cy+3}" text-anchor="middle" font-size="8" font-weight="700" '
                     f'font-family="{MONO}" fill="{ICON_C}">{esc(num)}</text>')
        tcx = x + badge + (w - badge) / 2
        sy = cy - 4 if len(lines) > 1 else cy + 3
        F = f'font-size="8" font-family="{MONO}" text-anchor="middle"'
        for i, ln in enumerate(lines):
            ty = sy + i * 12
            if i == len(lines) - 1 and opt:
                # centre the pair as a block; each run is itself centred, so a
                # font-metric error shifts the gap, never the optical centre
                mw, ow = len(ln) * CW, len(opt) * CW
                total = mw + GAP + ow
                g.append(f'<text x="{tcx - total/2 + mw/2}" y="{ty}" {F} font-weight="700" fill="{ICON_C}">{esc(ln)}</text>')
                g.append(f'<text x="{tcx + total/2 - ow/2}" y="{ty}" {F} fill="{OPT_C}">{esc(opt)}</text>')
            else:
                g.append(f'<text x="{tcx}" y="{ty}" {F} font-weight="700" fill="{ICON_C}">{esc(ln)}</text>')
        self.labels.append(''.join(g))

    def legend(self, x, y, encoding, rows):
        h = 26 + len(rows) * 16
        w = max(150, max(text_width(l, 10) for _, l in rows) + 56,
                text_width(encoding, 9) + 30)
        g = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" fill="#ffffff" stroke="#e4e8ec"/>',
             f'<text x="{x+12}" y="{y+17}" font-size="9" font-weight="700" font-family="{MONO}" '
             f'fill="{SUB}">{esc(encoding.upper())}</text>']
        for i, (color, lab) in enumerate(rows):
            f, s = PALETTE[color]
            ry = y + 25 + i * 16
            g.append(f'<rect x="{x+12}" y="{ry}" width="14" height="10" rx="2" fill="{f}" stroke="{s}"/>'
                     f'<text x="{x+32}" y="{ry+9}" font-size="10" fill="{INK}">{esc(lab)}</text>')
        self.labels.append(''.join(g))

    def caption(self, x, y, text):
        self.labels.append(f'<text x="{x}" y="{y}" font-size="11" fill="{SUB}">{esc(text)}</text>')

    # ---- output -----------------------------------------------------
    def svg(self):
        defs = (f'<defs>'
                f'<marker id="ar" markerWidth="9" markerHeight="9" refX="6.2" refY="3" orient="auto" '
                f'markerUnits="userSpaceOnUse"><path d="M0,0 L6.2,3 L0,6 Z" fill="{CONN}"/></marker>'
                f'<marker id="ard" markerWidth="9" markerHeight="9" refX="6.2" refY="3" orient="auto" '
                f'markerUnits="userSpaceOnUse"><path d="M0,0 L6.2,3 L0,6 Z" fill="{CONN_D}"/></marker>'
                f'</defs>')
        head = ''
        if self.title:
            head = (f'<text x="40" y="42" font-size="15" font-weight="600" fill="{INK}">{esc(self.title[0])}</text>'
                    f'<text x="40" y="62" font-size="11.5" fill="{SUB}">{esc(self.title[1])}</text>')
        return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.w}" height="{self.h}" '
                f'viewBox="0 0 {self.w} {self.h}" font-family="\'Segoe UI\', system-ui, -apple-system, sans-serif">'
                f'{defs}<rect width="{self.w}" height="{self.h}" fill="#ffffff"/>{head}'
                + ''.join(self.boundaries) + ''.join(self.edges)
                + ''.join(self.blabels) + ''.join(self.nodes)
                + ''.join(self.labels) + '</svg>')

    def save(self, path):
        open(path, 'w').write(self.svg())
        if WARNINGS:
            print('  fit warnings:')
            for w in dict.fromkeys(WARNINGS):
                print('   -', w)
            WARNINGS.clear()
