#!/usr/bin/env node
/**
 * Generates the animated README card: assets/vridhi-card.svg
 *   - right side: your avatar is turned into particles that form top -> bottom
 *   - left side : tech stack typed out like code
 *
 * Usage (inside /tools):
 *   npm install
 *   npm run build
 *   node generate-card.js [image] [output.svg] [--mode=circle|cutout]
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// ====================== EDIT THIS: what the card types out ======================
const ROLE = 'MERN Stack Developer';
const STACK = {
  frontend: ['HTML', 'CSS', 'JS', 'React', 'Tailwind'],
  backend: ['Node', 'Express', 'Socket.io', 'JWT'],
  database: ['MongoDB', 'PostgreSQL'],
  devops: ['Docker', 'CI/CD', 'Redis', 'AWS Basics'],
  ai: ['LLM API Integration', 'LLM Basics'],
  tools: ['Git', 'GitHub', 'Postman', 'VS Code'],
  deploy: ['Vercel', 'Render'],
  core: ['Java', 'DSA', 'OS', 'DBMS', 'OOPs', 'CN'],
};
const COMMENT = '// hey, i build things for the web';
// ================================================================================

// ---------- args ----------
const args = process.argv.slice(2);
const flag = args.find((a) => a.startsWith('--mode='));
const positional = args.filter((a) => !a.startsWith('--'));
const SRC = positional[0] || path.join(__dirname, 'source', 'avatar-circle.png');
const OUT = positional[1] || path.join(__dirname, '..', 'assets', 'vridhi-card.svg');
const MODE = flag ? flag.split('=')[1] : /circle/i.test(path.basename(SRC)) ? 'circle' : 'cutout';

// ---------- card geometry ----------
const W = 880, H = 320, HEADER = 36;
const PX = 592, PY = 46, PS = 264;         // portrait box
const GAP = 3;                              // particle spacing
const D = 13.0;                             // loop length (s)
const FORM_START = 0.3, FORM_SWEEP = 5.6;   // top -> bottom formation
const FLY = 1.5;                            // flight time per particle
const DISS_START = 9.6, DISS_SWEEP = 2.0;   // bottom -> top dissolve
const MONO = "'Courier New', Courier, 'DejaVu Sans Mono', monospace";
const CIRCLE_CROP = { left: 182, top: 48, width: 436, height: 436 };  // crop around the disc

// ---------- helpers ----------
function mulberry32(a) {                    // seeded RNG -> same card every build
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(7);
const uniform = (a, b) => a + (b - a) * rand();
const pct = (t) => +((t / D) * 100).toFixed(3);
const hex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function buildParticles() {
  const n = Math.floor(PS / GAP);
  let img = sharp(SRC).removeAlpha();
  if (MODE === 'circle') img = img.extract(CIRCLE_CROP);
  const { data } = await img.resize(n, n, { fit: 'fill', kernel: 'lanczos3' }).raw().toBuffer({ resolveWithObject: true });
  const px = (r, c) => [0, 1, 2].map((k) => data[(r * n + c) * 3 + k]);

  // background colour = median of the border pixels (cutout mode)
  let bg = [0, 0, 0];
  if (MODE !== 'circle') {
    const border = [];
    for (let i = 0; i < n; i++) border.push(px(0, i), px(n - 1, i), px(i, 0), px(i, n - 1));
    bg = [0, 1, 2].map((k) => border.map((p) => p[k]).sort((x, y) => x - y)[Math.floor(border.length / 2)]);
  }

  const rows = new Map();
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const p = px(r, c);
      let col, rad;
      if (MODE === 'circle') {
        if ((r - (n - 1) / 2) ** 2 + (c - (n - 1) / 2) ** 2 > (n / 2 - 0.3) ** 2) continue;
        col = hex(...p.map((v) => 255 * (0.08 + 0.92 * (v / 255))));
        rad = 1.4;
      } else {
        const dist = Math.hypot(p[0] - bg[0], p[1] - bg[1], p[2] - bg[2]);
        if (dist < 22) continue;
        const lift = p.map((v) => 255 * (0.3 + 0.7 * (v / 255) ** 0.6));
        col = hex(...lift);
        rad = 0.9 + 0.5 * ((0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]) / 255);
      }
      const cx = PX + c * GAP + GAP / 2, cy = PY + r * GAP + GAP / 2;
      const ang = uniform(0, 2 * Math.PI), d = uniform(30, 120);        // scattered start
      const dx = +(Math.cos(ang) * d).toFixed(1);
      const dy = +(-Math.abs(Math.sin(ang)) * d - 20).toFixed(1);
      if (!rows.has(r)) rows.set(r, []);
      rows.get(r).push({ cx: +cx.toFixed(1), cy: +cy.toFixed(1), rad, col, dx, dy });
    }
  }
  return { n, rows };
}

function buildTyping() {
  const FS = 14, CW = 8.4, LX = 30, LY0 = 64, LH = 21;
  const KEY = '#7ee7ff', STR = '#9dff9a', PUN = '#8b949e', KW = '#c792ea', TXT = '#e6edf3', CMT = '#5c6773';

  const listLine = (key, items) => {
    const t = [[`  ${key}`, KEY], [': [', PUN]];
    items.forEach((s, i) => { if (i) t.push([', ', PUN]); t.push([`"${s}"`, STR]); });
    t.push(['],', PUN]);
    return t;
  };
  const lines = [
    [[COMMENT, CMT]],
    [['const ', KW], ['vridhi', TXT], [' = {', PUN]],
    [['  role', KEY], [': ', PUN], [`"${ROLE}"`, STR], [',', PUN]],
    ...Object.entries(STACK).map(([k, v]) => listLine(k, v)),
    [['};', PUN]],
  ];

  const TYPE_START = 0.5, CPS = 75, GAP_LINE = 0.08;
  let t = TYPE_START;
  const css = [], svg = [], cursors = [];
  lines.forEach((ln, i) => {
    const nchar = ln.reduce((a, [s]) => a + s.length, 0);
    const ta = t, tb = t + nchar / CPS;
    t = tb + GAP_LINE;
    const full = nchar * CW, y = LY0 + i * LH, last = i === lines.length - 1;

    // typing reveal
    css.push(
      `@keyframes c${i}{0%,${pct(ta)}%{width:0;animation-timing-function:steps(${nchar},end)}${pct(tb)}%,100%{width:${(full + 6).toFixed(1)}px}}` +
      `.c${i}{animation:c${i} ${D}s linear infinite}`
    );
    // cursor: moves with the text, hides when the next line starts (last one lingers)
    const hideAt = last ? tb + 1.9 : tb + GAP_LINE;
    css.push(
      `@keyframes k${i}{0%,${Math.max(pct(ta) - 0.01, 0)}%{transform:translateX(0);opacity:0}` +
      `${pct(ta)}%{transform:translateX(0);opacity:1;animation-timing-function:steps(${nchar},end)}` +
      `${pct(tb)}%,${pct(hideAt)}%{transform:translateX(${full.toFixed(1)}px);opacity:1}` +
      `${pct(hideAt + 0.1)}%,100%{transform:translateX(${full.toFixed(1)}px);opacity:0}}` +
      `.k${i}{animation:k${i} ${D}s linear infinite}`
    );

    // tokens (fixed char width via textLength so the layout is exact)
    let x = LX;
    const toks = [];
    for (const [s, col] of ln) {
      const lead = s.length - s.trimStart().length, body = s.trim();
      if (body) toks.push(`<text x="${(x + lead * CW).toFixed(1)}" y="${y}" fill="${col}" textLength="${(body.length * CW).toFixed(1)}" lengthAdjust="spacing">${esc(body)}</text>`);
      x += s.length * CW;
    }
    svg.push(`<clipPath id="cp${i}"><rect class="c${i}" x="${LX}" y="${y - FS}" width="0" height="${LH}"/></clipPath><g clip-path="url(#cp${i})">${toks.join('')}</g>`);
    cursors.push(`<rect class="k${i}" x="${LX}" y="${y - FS + 2}" width="7" height="${FS + 2}" fill="#7ee7ff" opacity="0"/>`);
  });
  css.push(`@keyframes fade{0%,${pct(DISS_START)}%{opacity:1}${pct(DISS_START + 1.6)}%,100%{opacity:0}}.panel{animation:fade ${D}s linear infinite}`);
  return { css, svg, cursors, FS, typeEnd: t };
}

(async () => {
  const { n, rows } = await buildParticles();
  const typing = buildTyping();

  // per-row keyframes: fly in top->bottom, dissolve bottom->top
  const css = [];
  for (let r = 0; r < n; r++) {
    const f = r / (n - 1);
    const t0 = FORM_START + f * FORM_SWEEP, t1 = t0 + FLY;
    const d0 = DISS_START + (1 - f) * DISS_SWEEP, d1 = d0 + 1.1;
    css.push(
      `@keyframes r${r}{0%,${pct(t0)}%{opacity:0;transform:translate(var(--dx),var(--dy))}` +
      `${pct(t1)}%{opacity:1;transform:translate(0,0)}${pct(d0)}%{opacity:1;transform:translate(0,0)}` +
      `${pct(d1)}%,100%{opacity:0;transform:translate(calc(var(--dx)*-.6),calc(var(--dy)*-.4 + 50px))}}` +
      `.r${r}{animation:r${r} ${D}s cubic-bezier(.2,.7,.2,1) infinite}`
    );
  }
  const sc0 = FORM_START, sc1 = FORM_START + FORM_SWEEP + 0.6;
  css.push(
    `@keyframes scan{0%,${pct(sc0)}%{transform:translateY(0);opacity:0}${pct(sc0 + 0.15)}%{opacity:1}` +
    `${pct(sc1)}%{transform:translateY(${PS}px);opacity:1}${pct(sc1 + 0.4)}%,100%{transform:translateY(${PS}px);opacity:0}}` +
    `.scan{animation:scan ${D}s linear infinite}`
  );

  const p = [];
  p.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${MONO}" font-size="${typing.FS}">`);
  p.push('<title>Vridhi Rajeev — MERN Stack Developer</title>');
  p.push(
    '<defs><linearGradient id="bd" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3cbee6"/><stop offset=".5" stop-color="#5646be" stop-opacity=".6"/><stop offset="1" stop-color="#3cbee6"/></linearGradient>' +
    '<linearGradient id="sl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7ee7ff" stop-opacity="0"/><stop offset=".5" stop-color="#7ee7ff"/><stop offset="1" stop-color="#7ee7ff" stop-opacity="0"/></linearGradient>' +
    '<pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#ffffff" stroke-opacity=".035"/></pattern>' +
    `<clipPath id="card"><rect width="${W}" height="${H}" rx="14"/></clipPath></defs>`
  );
  p.push('<style>@media (prefers-reduced-motion:reduce){*{animation:none!important}}');
  p.push(...css, ...typing.css, '</style>');
  p.push('<g clip-path="url(#card)">');
  p.push(`<rect width="${W}" height="${H}" fill="#050505"/><rect width="${W}" height="${H}" fill="url(#grid)"/>`);
  p.push(`<rect width="${W}" height="${HEADER}" fill="#0d1117"/><line x1="0" x2="${W}" y1="${HEADER}" y2="${HEADER}" stroke="#ffffff" stroke-opacity=".08"/>`);
  ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => p.push(`<circle cx="${22 + i * 18}" cy="${HEADER / 2}" r="5.5" fill="${c}"/>`));
  p.push(`<text x="${W / 2}" y="${HEADER / 2 + 4}" text-anchor="middle" fill="#8b949e" font-size="12">vridhi@portfolio:~/stack</text>`);
  p.push(`<line x1="${PX - 24}" x2="${PX - 24}" y1="${HEADER + 18}" y2="${H - 18}" stroke="#ffffff" stroke-opacity=".07" stroke-dasharray="3 5"/>`);
  p.push('<g class="panel">', ...typing.svg, ...typing.cursors, '</g>');
  p.push('<g>');
  for (let r = 0; r < n; r++) {
    if (!rows.has(r)) continue;
    p.push(`<g class="r${r}">`);
    for (const q of rows.get(r)) p.push(`<circle cx="${q.cx}" cy="${q.cy}" r="${q.rad}" fill="${q.col}" style="--dx:${q.dx}px;--dy:${q.dy}px"/>`);
    p.push('</g>');
  }
  p.push('</g>');
  p.push(`<g transform="translate(0,${PY})"><rect class="scan" x="${PX - 10}" y="-1" width="${PS + 20}" height="2" fill="url(#sl)" opacity="0"/></g>`);
  p.push('</g>');
  p.push(`<rect x=".75" y=".75" width="${W - 1.5}" height="${H - 1.5}" rx="14" fill="none" stroke="url(#bd)" stroke-width="1.5"/></svg>`);

  const out = p.join('\n');
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, out);
  const count = [...rows.values()].reduce((a, v) => a + v.length, 0);
  console.log(`mode=${MODE} | particles=${count} | ${(out.length / 1024).toFixed(1)} KB | typing ends at ${typing.typeEnd.toFixed(1)}s (loop ${D}s)`);
  console.log('wrote', path.resolve(OUT));
})();
