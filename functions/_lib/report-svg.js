// Nightly report image: data -> SVG string. Pure (no Node APIs) so it runs in a Worker and locally.
// Layout: logo + centered date on top; branch columns left and right; Daily / MTD / Tracking in the middle.
// Fonts used: "Barlow Condensed" (500/600/700) -- the renderer must be given those font files.

const W = 1600;
const M = 40;            // outer margin
const GAP = 30;
const CENTER_W = 480;
const SIDE_W = (W - 2 * M - 2 * GAP - CENTER_W) / 2;
const ROW_H = 28;
const COLORS = {
  bg: '#0f141c', panel: '#171e29', line: '#263142', red: '#e32727',
  text: '#f2f5f9', mute: '#8793a6', dim: '#4a566a', good: '#4ade80',
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const num = (n) => Math.round(n).toLocaleString('en-US');
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
const moneyCents = (n) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function prettyDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }).toUpperCase();
}

const text = (x, y, s, { size = 18, weight = 500, fill = COLORS.text, anchor = 'start', spacing = 0 } = {}) =>
  `<text x="${x}" y="${y}" font-family="Barlow Condensed" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${spacing ? ` letter-spacing="${spacing}"` : ''}>${esc(s)}</text>`;

// ---- branch column -------------------------------------------------------------------------
const COLS = [ // right edge offset from column left, header label, getter, formatter
  { key: 'contingency', label: 'CONT', right: 226, fmt: num },
  { key: 'approved', label: 'APPR', right: 270, fmt: num },
  { key: 'contracts', label: 'CNTR', right: 314, fmt: num },
  { key: 'revenue', label: 'REVENUE', right: 392, fmt: money },
  { key: 'soft_sets', label: 'SOFT', right: 432, fmt: num },
  { key: 'knock', label: 'KNOCK', right: 482, fmt: num },
];

function branchColumn(x0, y0, branches) {
  let out = `<rect x="${x0}" y="${y0}" width="${SIDE_W}" height="${ROW_H * (branches.length + 1) + 8}" rx="10" fill="${COLORS.panel}"/>`;
  out += text(x0 + 14, y0 + 21, 'BRANCH', { size: 15, weight: 600, fill: COLORS.mute, spacing: 1.5 });
  for (const c of COLS) out += text(x0 + c.right, y0 + 21, c.label, { size: 15, weight: 600, fill: COLORS.mute, anchor: 'end', spacing: 1 });
  out += `<rect x="${x0 + 10}" y="${y0 + ROW_H - 1}" width="${SIDE_W - 20}" height="1.5" fill="${COLORS.line}"/>`;
  branches.forEach((b, i) => {
    const y = y0 + ROW_H + 4 + i * ROW_H;
    const active = b.contracts > 0 || b.revenue > 0;
    if (i % 2 === 1) out += `<rect x="${x0 + 6}" y="${y - 3}" width="${SIDE_W - 12}" height="${ROW_H}" rx="4" fill="#ffffff" fill-opacity="0.025"/>`;
    out += text(x0 + 14, y + 17, b.name, { size: 18, weight: active ? 700 : 500, fill: active ? COLORS.text : '#b9c2d0' });
    for (const c of COLS) {
      const v = b[c.key];
      const isRevenueHit = c.key === 'revenue' && v > 0;
      out += text(x0 + c.right, y + 17, c.fmt(v), {
        size: 18, anchor: 'end',
        weight: v > 0 ? 700 : 500,
        fill: isRevenueHit ? COLORS.good : v > 0 ? COLORS.text : COLORS.dim,
      });
    }
  });
  return out;
}

// ---- center cards --------------------------------------------------------------------------
function tile(x, y, w, label, value) {
  return text(x + w / 2, y, label, { size: 15, weight: 600, fill: COLORS.mute, anchor: 'middle', spacing: 1.5 }) +
    text(x + w / 2, y + 36, value, { size: 38, weight: 700, anchor: 'middle' });
}

function card(x, y, h, title) {
  return `<rect x="${x}" y="${y}" width="${CENTER_W}" height="${h}" rx="12" fill="${COLORS.panel}"/>` +
    `<rect x="${x}" y="${y}" width="6" height="${h}" rx="3" fill="${COLORS.red}"/>` +
    text(x + 26, y + 36, title, { size: 22, weight: 700, fill: COLORS.red, spacing: 3 });
}

function totalsCard(x, y, h, title, t) {
  const inner = CENTER_W - 40;
  const tw = inner / 4;
  const tx = x + 20;
  let out = card(x, y, h, title);
  out += text(x + CENTER_W / 2, y + 112, money(t.revenue), { size: 76, weight: 700, anchor: 'middle' });
  out += text(x + CENTER_W / 2, y + 138, 'REVENUE', { size: 16, weight: 600, fill: COLORS.mute, anchor: 'middle', spacing: 3 });
  const r1 = y + 190;
  const r2 = y + 264;
  [['KNOCK', t.knock], ['TALK', t.talk], ['WALK', t.walk], ['CONTINGENCY', t.contingency]]
    .forEach(([l, v], i) => { out += tile(tx + i * tw, r1, tw, l, num(v)); });
  [['APPROVED', t.approved], ['CONTRACTS', t.contracts], ['SOFT SETS', t.soft_sets]]
    .forEach(([l, v], i) => { out += tile(tx + i * tw, r2, tw, l, num(v)); });
  if (t.completed) {
    out += tile(tx + 3 * tw, r2, tw, 'COMPLETED', num(t.completed.count));
    out += text(tx + 3.5 * tw, r2 + 62, moneyCents(t.completed.amount), { size: 17, weight: 600, fill: COLORS.mute, anchor: 'middle' });
  }
  return out;
}

function trackingCard(x, y, h, d) {
  const pace = d.mtd.revenue / d.daysWorked;
  let out = card(x, y, h, 'TRACKING');
  out += text(x + CENTER_W / 2, y + 112, money(d.tracking), { size: 76, weight: 700, anchor: 'middle', fill: COLORS.good });
  out += text(x + CENTER_W / 2, y + 138, 'PROJECTED MONTH REVENUE', { size: 16, weight: 600, fill: COLORS.mute, anchor: 'middle', spacing: 3 });
  out += tile(x + 20, y + 190, 200, 'DAYS WORKED', `${d.daysWorked} of ${d.totalDays}`);
  out += tile(x + 260, y + 190, 200, 'DAILY PACE', money(pace));
  return out;
}

function franchiseCard(x, y, h, f) {
  const tw = (CENTER_W - 40) / 6;
  let out = card(x, y, h, 'FRANCHISE');
  [['CONT', f.contingency, num], ['APPR', f.approved, num], ['CNTR', f.contracts, num], ['REVENUE', f.revenue, money], ['SOFT', f.soft_sets, num], ['KNOCK', f.knock, num]]
    .forEach(([l, v, fmt], i) => {
      const cx = x + 20 + i * tw + tw / 2;
      out += text(cx, y + 66, l, { size: 14, weight: 600, fill: COLORS.mute, anchor: 'middle', spacing: 1 });
      out += text(cx, y + 96, fmt(v), { size: 24, weight: 700, anchor: 'middle' });
    });
  return out;
}

// ---- page ----------------------------------------------------------------------------------
export function reportSvg(d, { logoDataUri } = {}) {
  const half = Math.ceil(d.branches.length / 2);
  const left = d.branches.slice(0, half);
  const right = d.branches.slice(half);
  const bodyY = 285;
  const colH = ROW_H * (half + 1) + 8;
  const H = bodyY + colH + 70;

  const leftX = M;
  const centerX = M + SIDE_W + GAP;
  const rightX = centerX + CENTER_W + GAP;

  const hasF = !!d.franchise;
  const fH = 130;
  const gap = 20;
  const avail = colH - (hasF ? fH + gap : 0) - 2 * gap;
  const trackH = 260;
  const totH = (avail - trackH) / 2;

  const logoH = 150;
  const logoW = logoH * (847 / 511);
  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  out += `<rect width="${W}" height="${H}" fill="${COLORS.bg}"/>`;
  if (logoDataUri) out += `<image href="${logoDataUri}" x="${(W - logoW) / 2}" y="22" width="${logoW}" height="${logoH}"/>`;
  out += text(W / 2, 232, prettyDate(d.date), { size: 52, weight: 700, anchor: 'middle', spacing: 4 });
  out += `<rect x="${W / 2 - 60}" y="246" width="120" height="5" rx="2.5" fill="${COLORS.red}"/>`;

  out += branchColumn(leftX, bodyY, left);
  out += branchColumn(rightX, bodyY, right);

  let y = bodyY;
  out += totalsCard(centerX, y, totH, 'DAILY TOTALS', d.daily); y += totH + gap;
  out += totalsCard(centerX, y, totH, 'MONTH TO DATE', d.mtd); y += totH + gap;
  out += trackingCard(centerX, y, trackH, d); y += trackH + gap;
  if (hasF) out += franchiseCard(centerX, y, fH, d.franchise);

  out += text(W / 2, H - 28, `${d.branches.length} BRANCHES  •  WE'RE ON TOP OF EVERYTHING`, { size: 17, weight: 600, fill: COLORS.mute, anchor: 'middle', spacing: 3 });
  return out + '</svg>';
}
