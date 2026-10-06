// Nightly report image: data -> SVG string. Pure (no Node APIs) so it runs in a Worker and locally.
// Layout: logo + centered date on top; branch columns left and right; Daily / MTD / Tracking in the middle.
// Fonts used: "Barlow Condensed" (500/600/700) -- the renderer must be given those font files.

const W = 1800;
const M = 30;            // outer margin
const GAP = 24;
const CENTER_W = 460;
const SIDE_W = (W - 2 * M - 2 * GAP - CENTER_W) / 2;
const ROW_H = 38;
const FONT = 25;         // branch name / number size
export const COLORS = {
  bg: '#0f141c', panel: '#171e29', line: '#263142', red: '#e32727',
  text: '#f2f5f9', mute: '#8793a6', dim: '#4a566a', good: '#4ade80',
};

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
export const num = (n) => Math.round(n).toLocaleString('en-US');
export const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
export const moneyCents = (n) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function prettyDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }).toUpperCase();
}

export const text = (x, y, s, { size = 18, weight = 500, fill = COLORS.text, anchor = 'start', spacing = 0 } = {}) =>
  `<text x="${x}" y="${y}" font-family="Barlow Condensed" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${spacing ? ` letter-spacing="${spacing}"` : ''}>${esc(s)}</text>`;

// ---- branch column -------------------------------------------------------------------------
const COLS = [ // right edge offset from column left, header label, formatter
  { key: 'contingency', label: 'CONT', right: 296, fmt: num },
  { key: 'approved', label: 'APPR', right: 372, fmt: num },
  { key: 'contracts', label: 'CNTR', right: 448, fmt: num },
  { key: 'revenue', label: 'REVENUE', right: 556, fmt: money },
  { key: 'soft_sets', label: 'SOFT', right: 610, fmt: num },
];

function branchColumn(x0, y0, branches, rows) {
  let out = `<rect x="${x0}" y="${y0}" width="${SIDE_W}" height="${ROW_H * (rows + 1) + 8}" rx="10" fill="${COLORS.panel}"/>`;
  const hy = y0 + 27;
  out += text(x0 + 16, hy, 'BRANCH', { size: 18, weight: 600, fill: COLORS.mute, spacing: 1.5 });
  for (const c of COLS) out += text(x0 + c.right, hy, c.label, { size: 18, weight: 600, fill: COLORS.mute, anchor: 'end', spacing: 1 });
  out += `<rect x="${x0 + 10}" y="${y0 + ROW_H - 1}" width="${SIDE_W - 20}" height="1.5" fill="${COLORS.line}"/>`;
  branches.forEach((b, i) => {
    const y = y0 + ROW_H + 4 + i * ROW_H;
    const active = b.contracts > 0 || b.revenue > 0;
    if (i % 2 === 1) out += `<rect x="${x0 + 6}" y="${y - 3}" width="${SIDE_W - 12}" height="${ROW_H}" rx="4" fill="#ffffff" fill-opacity="0.03"/>`;
    out += text(x0 + 16, y + 25, b.name, { size: FONT, weight: active ? 700 : 500, fill: active ? COLORS.text : '#c4ccd8' });
    for (const c of COLS) {
      const v = b[c.key];
      out += text(x0 + c.right, y + 25, c.fmt(v), {
        size: FONT, anchor: 'end',
        weight: v > 0 ? 700 : 500,
        fill: c.key === 'revenue' && v > 0 ? COLORS.good : v > 0 ? COLORS.text : COLORS.dim,
      });
    }
  });
  return out;
}

// ---- center cards (laid out proportionally so they fill whatever height the branch columns need) ----
const heroSize = (str) => Math.min(100, Math.floor((CENTER_W - 60) / (str.length * 0.47)));

function tile(cx, y, label, value, sub) {
  let out = text(cx, y, label, { size: 17, weight: 600, fill: COLORS.mute, anchor: 'middle', spacing: 1.5 }) +
    text(cx, y + 44, value, { size: 41, weight: 700, anchor: 'middle' });
  if (sub) out += text(cx, y + 76, sub, { size: 20, weight: 600, fill: COLORS.mute, anchor: 'middle' });
  return out;
}

function card(x, y, h, title) {
  return `<rect x="${x}" y="${y}" width="${CENTER_W}" height="${h}" rx="12" fill="${COLORS.panel}"/>` +
    `<rect x="${x}" y="${y}" width="6" height="${h}" rx="3" fill="${COLORS.red}"/>` +
    text(x + 28, y + 42, title, { size: 26, weight: 700, fill: COLORS.red, spacing: 3 });
}

function hero(x, y, h, value, label, fill = COLORS.text) {
  const size = heroSize(value);
  const base = y + 64 + size * 0.8 + Math.max(0, (h - 330) * 0.12);
  return text(x + CENTER_W / 2, base, value, { size, weight: 700, anchor: 'middle', fill }) +
    text(x + CENTER_W / 2, base + 34, label, { size: 18, weight: 600, fill: COLORS.mute, anchor: 'middle', spacing: 3 });
}

function totalsCard(x, y, h, title, t) {
  const tw = (CENTER_W - 40) / 4;
  const cx = (i) => x + 20 + tw * (i + 0.5);
  let out = card(x, y, h, title) + hero(x, y, h, money(t.revenue), 'REVENUE');
  const r1 = y + h * 0.52;
  const r2 = y + h * 0.76;
  [['KNOCK', t.knock], ['TALK', t.talk], ['WALK', t.walk], ['CONTINGENCY', t.contingency]]
    .forEach(([l, v], i) => { out += tile(cx(i), r1, l, num(v)); });
  const row2 = [['APPROVED', num(t.approved)], ['CONTRACTS', num(t.contracts)], ['SOFT SETS', num(t.soft_sets)]];
  if (t.completed) row2.push(['COMPLETED', num(t.completed.count), moneyCents(t.completed.amount)]);
  const tw2 = (CENTER_W - 40) / row2.length;
  row2.forEach(([l, v, sub], i) => { out += tile(x + 20 + tw2 * (i + 0.5), r2, l, v, sub); });
  return out;
}

function trackingCard(x, y, h, d) {
  const pace = d.mtd.revenue / d.daysWorked;
  let out = card(x, y, h, 'TRACKING') + hero(x, y, h, money(d.tracking), 'PROJECTED MONTH REVENUE', COLORS.good);
  out += tile(x + CENTER_W * 0.28, y + h * 0.68, 'DAYS WORKED', `${d.daysWorked} of ${d.totalDays}`);
  out += tile(x + CENTER_W * 0.74, y + h * 0.68, 'DAILY PACE', money(pace));
  return out;
}

function franchiseCard(x, y, h, f) {
  const tw = (CENTER_W - 40) / 6;
  let out = card(x, y, h, 'FRANCHISE');
  [['CONT', f.contingency, num], ['APPR', f.approved, num], ['CNTR', f.contracts, num], ['REVENUE', f.revenue, money], ['SOFT', f.soft_sets, num], ['KNOCK', f.knock, num]]
    .forEach(([l, v, fmt], i) => {
      const cx = x + 20 + i * tw + tw / 2;
      out += text(cx, y + 80, l, { size: 15, weight: 600, fill: COLORS.mute, anchor: 'middle', spacing: 1 });
      out += text(cx, y + 114, fmt(v), { size: 26, weight: 700, anchor: 'middle' });
    });
  return out;
}

// ---- page ----------------------------------------------------------------------------------
const byName = (a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });

export function reportSvg(d, { logoDataUri } = {}) {
  // Alphabetical, reading down the left column and then continuing down the right.
  const sorted = [...d.branches].sort(byName);
  const half = Math.ceil(sorted.length / 2);
  const left = sorted.slice(0, half);
  const right = sorted.slice(half);
  const bodyY = 205;
  const colH = ROW_H * (half + 1) + 8;
  const H = bodyY + colH + 64;

  const leftX = M;
  const centerX = M + SIDE_W + GAP;
  const rightX = centerX + CENTER_W + GAP;

  const hasF = !!d.franchise;
  const fH = 150;
  const gap = 20;
  const trackH = 330;
  const avail = colH - (hasF ? fH + gap : 0) - 2 * gap;
  const totH = (avail - trackH) / 2;

  const logoH = 150;
  const logoW = logoH * (847 / 511);
  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  out += `<rect width="${W}" height="${H}" fill="${COLORS.bg}"/>`;
  if (logoDataUri) out += `<image href="${logoDataUri}" x="${M + 10}" y="25" width="${logoW}" height="${logoH}"/>`;
  out += text(W / 2, 112, prettyDate(d.date), { size: 68, weight: 700, anchor: 'middle', spacing: 5 });
  out += `<rect x="${W / 2 - 70}" y="134" width="140" height="6" rx="3" fill="${COLORS.red}"/>`;
  out += text(W / 2, 176, 'DAILY NUMBERS REPORT', { size: 24, weight: 600, fill: COLORS.mute, anchor: 'middle', spacing: 6 });
  // right side of the header balances the logo
  out += text(W - M - 10, 88, String(d.branches.length), { size: 80, weight: 700, anchor: 'end' });
  out += text(W - M - 10, 124, 'BRANCHES REPORTING', { size: 20, weight: 600, fill: COLORS.mute, anchor: 'end', spacing: 3 });

  out += branchColumn(leftX, bodyY, left, half);
  out += branchColumn(rightX, bodyY, right, half);

  let y = bodyY;
  out += totalsCard(centerX, y, totH, 'DAILY TOTALS', d.daily); y += totH + gap;
  out += totalsCard(centerX, y, totH, 'MONTH TO DATE', d.mtd); y += totH + gap;
  out += trackingCard(centerX, y, trackH, d); y += trackH + gap;
  if (hasF) out += franchiseCard(centerX, y, fH, d.franchise);

  out += text(W / 2, H - 24, "WE'RE ON TOP OF EVERYTHING", { size: 20, weight: 600, fill: COLORS.mute, anchor: 'middle', spacing: 5 });
  return out + '</svg>';
}
