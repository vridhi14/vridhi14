import os, random, math
import numpy as np
from PIL import Image

random.seed(7)

# ---------------- card geometry ----------------
W, H = 880, 320
HEADER = 36
PX, PY, PS = 592, 46, 264          # portrait box (x, y, size)
GAP = 3                             # particle spacing
D = 13.0                            # loop length (s)
FORM_START, FORM_SWEEP = 0.3, 5.6   # top->bottom formation window
FLY = 1.5                           # flight time of each particle
DISS_START, DISS_SWEEP = 9.6, 2.0   # bottom->top dissolve window
MONO = "'Courier New', Courier, 'DejaVu Sans Mono', monospace"

# ---------------- sample the photo ----------------
import sys
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'source', 'avatar-circle.png')
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, '..', 'assets', 'vridhi-card.svg')
CIRCLE = 'circle' in os.path.basename(SRC).lower()   # round avatar on a dark disc
ANIME = 'anime' in SRC or CIRCLE
im = Image.open(SRC).convert('RGB')
CROP = (182, 48, 618, 484) if CIRCLE else (66, 40, 534, 508)
if ANIME:
    im = im.crop(CROP)
n = PS // GAP
im = im.resize((n, n), Image.LANCZOS)
a = np.asarray(im).astype(float)
from PIL import ImageOps, ImageFilter
_g = Image.open(SRC).convert('L')
if ANIME:
    _g = _g.crop(CROP)
if not ANIME:
    _g = ImageOps.equalize(_g)
    _g = Image.blend(_g, ImageOps.autocontrast(_g, cutoff=2), 0.4)
_g = _g.resize((n, n), Image.LANCZOS)
eq = np.asarray(_g).astype(float) / 255

# background estimate = median of the border pixels
border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
bg = np.median(border, axis=0)
dist = np.sqrt(((a - bg) ** 2).sum(axis=2))
lum = (0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]) / 255

def lerp(c1, c2, t):
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))

# dark hair -> deep indigo, skin/shirt -> bright cyan-white
LO, MID, HI = (110, 90, 230), (70, 205, 240), (250, 253, 255)
def ramp(t):
    return lerp(LO, MID, t / 0.5) if t < 0.5 else lerp(MID, HI, (t - 0.5) / 0.5)

rows = {}
for r in range(n):
    for c in range(n):
        if CIRCLE:
            if (r - (n - 1) / 2) ** 2 + (c - (n - 1) / 2) ** 2 > (n / 2 - 0.3) ** 2:
                continue
        elif dist[r, c] < (22 if ANIME else 34):            # background -> skip
            continue
        t = min(1, max(0, eq[r, c]))
        t = 0.18 + 0.82 * t ** 0.9
        if CIRCLE:
            px = a[r, c] / 255
            col = '#%02x%02x%02x' % tuple(int(v * 255) for v in (0.08 + 0.92 * px))
            rad = 1.4
        elif ANIME:
            px = a[r, c] / 255
            lift = 0.30 + 0.70 * px ** 0.6
            if px.mean() < 0.42:   # dark hair -> violet-blue tint
                lift = lift * np.array([0.82, 0.78, 1.25])
            lift = np.clip(lift, 0, 1)
            col = '#%02x%02x%02x' % tuple(int(v * 255) for v in lift)
        else:
            col = '#%02x%02x%02x' % ramp(t)
        if not CIRCLE:
            rad = 0.55 + 0.75 * t
        cx = PX + c * GAP + GAP / 2
        cy = PY + r * GAP + GAP / 2
        # scattered start position (drifts in from above / sides)
        ang = random.uniform(0, 2 * math.pi)
        d = random.uniform(30, 120)
        dx = round(math.cos(ang) * d, 1)
        dy = round(-abs(math.sin(ang)) * d - 20, 1)
        rows.setdefault(r, []).append((round(cx, 1), round(cy, 1), round(rad, 2), col, dx, dy))

# ---------------- css: one keyframe set per row ----------------
css = []
def pct(t): return round(t / D * 100, 3)

for r in range(n):
    f = r / (n - 1)
    t0 = FORM_START + f * FORM_SWEEP           # starts flying in
    t1 = t0 + FLY                              # settled
    d0 = DISS_START + (1 - f) * DISS_SWEEP     # bottom rows leave first
    d1 = d0 + 1.1
    css.append(
        f"@keyframes r{r}{{"
        f"0%,{pct(t0)}%{{opacity:0;transform:translate(var(--dx),var(--dy))}}"
        f"{pct(t1)}%{{opacity:1;transform:translate(0,0)}}"
        f"{pct(d0)}%{{opacity:1;transform:translate(0,0)}}"
        f"{pct(d1)}%,100%{{opacity:0;transform:translate(calc(var(--dx)*-.6),calc(var(--dy)*-.4 + 50px))}}"
        f"}}"
        f".r{r}{{animation:r{r} {D}s cubic-bezier(.2,.7,.2,1) infinite}}"
    )

# scan line sweeps the portrait while it forms
sc0, sc1 = FORM_START, FORM_START + FORM_SWEEP + 0.6
css.append(
    f"@keyframes scan{{0%,{pct(sc0)}%{{transform:translateY(0);opacity:0}}"
    f"{pct(sc0+.15)}%{{opacity:1}}{pct(sc1)}%{{transform:translateY({PS}px);opacity:1}}"
    f"{pct(sc1+.4)}%,100%{{transform:translateY({PS}px);opacity:0}}}}"
    f".scan{{animation:scan {D}s linear infinite}}"
)

# ---------------- typing panel ----------------
FS = 14
CW = 8.4                       # fixed char width (enforced with textLength)
LX, LY0, LH = 30, 78, 23       # left x, first baseline, line height

KEY, STR, PUN, KW, TXT, CMT = '#7ee7ff', '#9dff9a', '#8b949e', '#c792ea', '#e6edf3', '#5c6773'

# each line = list of (text, color)
lines = [
    [("// hey, i build things for the web", CMT)],
    [("const ", KW), ("vridhi", TXT), (" = {", PUN)],
    [("  role", KEY), (": ", PUN), ('"MERN Stack Developer"', STR), (",", PUN)],
    [("  frontend", KEY), (": [", PUN), ('"HTML"', STR), (", ", PUN), ('"CSS"', STR), (", ", PUN),
     ('"JS"', STR), (", ", PUN), ('"React"', STR), (", ", PUN), ('"Tailwind"', STR), ("],", PUN)],
    [("  backend", KEY), (": [", PUN), ('"Node"', STR), (", ", PUN), ('"Express"', STR), (", ", PUN),
     ('"Socket.io"', STR), (", ", PUN), ('"JWT"', STR), ("],", PUN)],
    [("  database", KEY), (": [", PUN), ('"MongoDB"', STR), (", ", PUN), ('"PostgreSQL"', STR), ("],", PUN)],
    [("  tools", KEY), (": [", PUN), ('"Git"', STR), (", ", PUN), ('"GitHub"', STR), (", ", PUN),
     ('"Postman"', STR), ("],", PUN)],
    [("  dsa", KEY), (": ", PUN), ('"Java"', STR), (",", PUN)],
    [("}", PUN), (";", PUN)],
]

TYPE_START = 0.5
CPS = 52                       # characters per second
GAP_LINE = 0.08
t = TYPE_START
type_css, svg_lines, cursors = [], [], []
for i, ln in enumerate(lines):
    nchar = sum(len(s) for s, _ in ln)
    dur = nchar / CPS
    ta, tb = t, t + dur
    t = tb + GAP_LINE
    full = nchar * CW
    y = LY0 + i * LH
    # reveal clip
    type_css.append(
        f"@keyframes c{i}{{0%,{pct(ta)}%{{width:0;animation-timing-function:steps({nchar},end)}}"
        f"{pct(tb)}%,100%{{width:{full+6:.1f}px}}}}"
        f".c{i}{{animation:c{i} {D}s linear infinite}}"
    )
    # cursor position + visibility
    last = (i == len(lines) - 1)
    vis_end = pct(tb + (3.0 if last else GAP_LINE))
    type_css.append(
        f"@keyframes k{i}{{0%,{max(pct(ta)-0.01,0)}%{{transform:translateX(0);opacity:0}}{pct(ta)}%{{transform:translateX(0);opacity:1;animation-timing-function:steps({nchar},end)}}"
        f"{pct(tb)}%{{transform:translateX({full:.1f}px);opacity:1}}"
        f"{vis_end}%{{transform:translateX({full:.1f}px);opacity:{'1' if last else '0'}}}"
        f"{pct(tb+3.0) if last else vis_end}%,100%{{transform:translateX({full:.1f}px);opacity:0}}}}"
        f".k{i}{{animation:k{i} {D}s linear infinite}}"
    )
    # cursor hidden before its own line starts (opacity 0 on wrap handled by 0% -> but start hidden)
    # tokens
    x = LX
    toks = []
    for s, col in ln:
        if s.strip() == "" and s != "":
            x += len(s) * CW
            continue
        lead = len(s) - len(s.lstrip(' '))
        x += lead * CW
        full_len = len(s) - lead
        body = s.strip(' ')
        esc = body.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
        toks.append(f'<text x="{x:.1f}" y="{y}" fill="{col}" textLength="{len(body)*CW:.1f}" '
                    f'lengthAdjust="spacing">{esc}</text>')
        x += full_len * CW
    svg_lines.append(
        f'<clipPath id="cp{i}"><rect class="c{i}" x="{LX}" y="{y-FS}" width="0" height="{LH}"/></clipPath>'
        f'<g clip-path="url(#cp{i})">{"".join(toks)}</g>'
    )
    cursors.append(f'<rect class="k{i}" x="{LX}" y="{y-FS+2}" width="7" height="{FS+2}" fill="#7ee7ff" opacity="0"/>')

TYPE_END = t
# whole panel fades out before loop restarts
type_css.append(
    f"@keyframes fade{{0%,{pct(DISS_START)}%{{opacity:1}}{pct(DISS_START+1.6)}%,100%{{opacity:0}}}}"
    f".panel{{animation:fade {D}s linear infinite}}"
)
# blinking for the final cursor
type_css.append("@keyframes blink{0%,49%{fill:#7ee7ff}50%,100%{fill:#7ee7ff}}")

# ---------------- assemble svg ----------------
p = []
p.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" '
         f'font-family="{MONO}" font-size="{FS}">')
p.append('<title>Vridhi Rajeev — MERN Stack Developer</title>')
p.append('<defs>'
         '<linearGradient id="bd" x1="0" y1="0" x2="1" y2="1">'
         '<stop offset="0" stop-color="#3cbee6"/><stop offset=".5" stop-color="#5646be" stop-opacity=".6"/>'
         '<stop offset="1" stop-color="#3cbee6"/></linearGradient>'
         '<linearGradient id="sl" x1="0" y1="0" x2="1" y2="0">'
         '<stop offset="0" stop-color="#7ee7ff" stop-opacity="0"/><stop offset=".5" stop-color="#7ee7ff"/>'
         '<stop offset="1" stop-color="#7ee7ff" stop-opacity="0"/></linearGradient>'
         '<pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">'
         '<path d="M24 0H0V24" fill="none" stroke="#ffffff" stroke-opacity=".035"/></pattern>'
         f'<clipPath id="card"><rect width="{W}" height="{H}" rx="14"/></clipPath>'
         '</defs>')
p.append('<style>')
p.append('.p{will-change:transform,opacity}')
p.append('@media (prefers-reduced-motion:reduce){*{animation:none!important}}')
p.extend(css)
p.extend(type_css)
p.append('</style>')
p.append(f'<g clip-path="url(#card)">')
p.append(f'<rect width="{W}" height="{H}" fill="#050505"/>')
p.append(f'<rect width="{W}" height="{H}" fill="url(#grid)"/>')
# header bar
p.append(f'<rect width="{W}" height="{HEADER}" fill="#0d1117"/>')
p.append(f'<line x1="0" x2="{W}" y1="{HEADER}" y2="{HEADER}" stroke="#ffffff" stroke-opacity=".08"/>')
for i, c in enumerate(('#ff5f57', '#febc2e', '#28c840')):
    p.append(f'<circle cx="{22+i*18}" cy="{HEADER/2}" r="5.5" fill="{c}"/>')
p.append(f'<text x="{W/2}" y="{HEADER/2+4}" text-anchor="middle" fill="#8b949e" font-size="12">vridhi@portfolio:~/stack</text>')
# divider
p.append(f'<line x1="{PX-24}" x2="{PX-24}" y1="{HEADER+18}" y2="{H-18}" stroke="#ffffff" stroke-opacity=".07" stroke-dasharray="3 5"/>')

# typing panel
p.append('<g class="panel">')
p.extend(svg_lines)
p.extend(cursors)
p.append('</g>')

# particles
p.append('<g>')
for r in range(n):
    if r not in rows:
        continue
    p.append(f'<g class="r{r}">')
    for cx, cy, rad, col, dx, dy in rows[r]:
        p.append(f'<circle cx="{cx}" cy="{cy}" r="{rad}" fill="{col}" style="--dx:{dx}px;--dy:{dy}px"/>')
    p.append('</g>')
p.append('</g>')

# scan line
p.append(f'<g transform="translate(0,{PY})"><rect class="scan" x="{PX-10}" y="-1" width="{PS+20}" height="2" '
         f'fill="url(#sl)" opacity="0"/></g>')
p.append('</g>')
# border
p.append(f'<rect x=".75" y=".75" width="{W-1.5}" height="{H-1.5}" rx="14" fill="none" stroke="url(#bd)" stroke-width="1.5"/>')
p.append('</svg>')

svg = "\n".join(p)
open(OUT, 'w').write(svg)
cnt = sum(len(v) for v in rows.values())
print("particles:", cnt, "| svg KB:", round(len(svg) / 1024, 1), "| typing ends at", round(TYPE_END, 2), "s")
