// Phone-first version of the nightly report, meant to be pasted into a GroupMe chat and read on a phone.
// Returns three portrait images, 1080px wide, with large text:
//   1. summary  (date, Daily Totals, Month to Date, Tracking, Franchise)
//   2-3. branch roster, alphabetical, split in half (A-?, ?-Z)
import { COLORS, num, money, moneyCents, prettyDate, text } from './report-svg.js';

const W = 1080;
const M = 30;
const CW = W - 2 * M;
const ROW_H = 60;
const FONT = 36;
const ZERO = '#5c6a80';
const LOGO_RATIO = 847 / 511;

const wrap = (H, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
  `<rect width="${W}" height="${H}" fill="${COLORS.bg}"/>${body}</svg>`;

const logo = (uri, x, y, h) => (uri ? `<image href="${uri}" x="${x}" y="${y}" width="${h * LOGO_RATIO}" height="${h}"/>` : '');

// ---- summary cards ---------------------------------------------------------------------------
const heroSize = (str) => Math.min(170, Math.floor((CW - 80) / (str.length * 0.47)));

function card(y, h, title) {
  return `<rect x="${M}" y="${y}" width="${CW}" height="${h}" rx="18" fill="${COLORS.panel}"/>` +
    `<rect x="${M}" y="${y}" width="9" height="${h}" rx="4" fill="${COLORS.red}"/>` +
    text(M + 40, y + 62, title, { size: 40, weight: 700, fill: COLORS.red, spacing: 4 });
}

function hero(y, value, label, fill = COLORS.text) {
  const size = heroSize(value);
  const base = y + 100 + size * 0.8;
  return text(W / 2, base, value, { size, weight: 700, anchor: 'middle', fill }) +
    text(W / 2, base + 48, label, { size: 28, weight: 600, fill: COLORS.mute, anchor: 'middle', spacing: 4 });
}

function tile(cx, y, label, value, sub) {
  let out = text(cx, y, label, { size: 26, weight: 600, fill: COLORS.mute, anchor: 'middle', spacing: 2 }) +
    text(cx, y + 70, value, { size: 68, weight: 700, anchor: 'middle' });
  if (sub) out += text(cx, y + 116, sub, { size: 30, weight: 600, fill: COLORS.mute, anchor: 'middle' });
  return out;
}

function totalsCard(y, title, t) {
  const h = 690;
  const tw = (CW - 40) / 4;
  const cx = (i) => M + 20 + tw * (i + 0.5);
  let out = card(y, h, title) + hero(y, money(t.revenue), 'REVENUE');
  const r1 = y + 400;
  const r2 = y + 550;
  [['KNOCK', t.knock], ['TALK', t.talk], ['WALK', t.walk], ['CONTINGENCY', t.contingency]]
    .forEach(([l, v], i) => { out += tile(cx(i), r1, l, num(v)); });
  [['APPROVED', t.approved], ['CONTRACTS', t.contracts], ['SOFT SETS', t.soft_sets]]
    .forEach(([l, v], i) => { out += tile(cx(i), r2, l, num(v)); });
  if (t.completed) out += tile(cx(3), r2, 'COMPLETED', num(t.completed.count), moneyCents(t.completed.amount));
  return { svg: out, h };
}

function trackingCard(y, d) {
  const h = 560;
  let out = card(y, h, 'TRACKING') + hero(y, money(d.tracking), 'PROJECTED MONTH REVENUE', COLORS.good);
  out += tile(M + CW * 0.27, y + 390, 'DAYS WORKED', `${d.daysWorked} of ${d.totalDays}`);
  out += tile(M + CW * 0.73, y + 390, 'DAILY PACE', money(d.mtd.revenue / d.daysWorked));
  return { svg: out, h };
}

function franchiseCard(y, f) {
  const h = 290;
  const tw = (CW - 40) / 6;
  let out = card(y, h, 'FRANCHISE');
  [['CONT', f.contingency, num], ['APPR', f.approved, num], ['CNTR', f.contracts, num], ['REVENUE', f.revenue, money], ['SOFT', f.soft_sets, num], ['KNOCK', f.knock, num]]
    .forEach(([l, v, fmt], i) => {
      const cx = M + 20 + i * tw + tw / 2;
      out += text(cx, y + 150, l, { size: 24, weight: 600, fill: COLORS.mute, anchor: 'middle', spacing: 1 });
      out += text(cx, y + 218, fmt(v), { size: 40, weight: 700, anchor: 'middle' });
    });
  return { svg: out, h };
}

function summaryImage(d, logoDataUri) {
  let body = logo(logoDataUri, (W - 230 * LOGO_RATIO) / 2, 30, 230);
  body += text(W / 2, 340, prettyDate(d.date), { size: 66, weight: 700, anchor: 'middle', spacing: 3 });
  body += `<rect x="${W / 2 - 80}" y="364" width="160" height="7" rx="3.5" fill="${COLORS.red}"/>`;
  body += text(W / 2, 424, `${d.branches.length} BRANCHES REPORTING`, { size: 34, weight: 600, fill: COLORS.mute, anchor: 'middle', spacing: 5 });
  let y = 470;
  const gap = 28;
  const cards = [totalsCard(y, 'DAILY TOTALS', d.daily)];
  y += cards[0].h + gap; cards.push(totalsCard(y, 'MONTH TO DATE', d.mtd));
  y += cards[1].h + gap; cards.push(trackingCard(y, d));
  y += cards[2].h + gap;
  if (d.franchise) { cards.push(franchiseCard(y, d.franchise)); y += cards[3].h + gap; }
  body += cards.map((c) => c.svg).join('');
  body += text(W / 2, y + 44, "WE'RE ON TOP OF EVERYTHING", { size: 30, weight: 600, fill: COLORS.mute, anchor: 'middle', spacing: 6 });
  return wrap(y + 90, body);
}

// ---- roster images ---------------------------------------------------------------------------
const COLS = [
  { key: 'contingency', label: 'CONT', right: 478, fmt: num },
  { key: 'approved', label: 'APPR', right: 556, fmt: num },
  { key: 'contracts', label: 'CNTR', right: 634, fmt: num },
  { key: 'revenue', label: 'REVENUE', right: 812, fmt: money },
  { key: 'soft_sets', label: 'SOFT', right: 906, fmt: num },
  { key: 'knock', label: 'KNOCK', right: 1034, fmt: num },
];

const initial = (b) => b.name[0].toUpperCase();

function rosterImage(d, rows, part, parts, logoDataUri) {
  const headH = 170;
  const tableY = headH + 20;
  const tableH = ROW_H * (rows.length + 1) + 16;
  let body = logo(logoDataUri, M + 10, 28, 110);
  body += text(W - M - 10, 74, prettyDate(d.date), { size: 40, weight: 700, anchor: 'end', spacing: 2 });
  body += text(W - M - 10, 124, `BRANCHES ${initial(rows[0])}–${initial(rows[rows.length - 1])}  (${part} OF ${parts})`, { size: 30, weight: 600, fill: COLORS.mute, anchor: 'end', spacing: 3 });
  body += `<rect x="${M}" y="${tableY}" width="${CW}" height="${tableH}" rx="16" fill="${COLORS.panel}"/>`;
  const hy = tableY + 42;
  body += text(M + 20, hy, 'BRANCH', { size: 26, weight: 600, fill: COLORS.mute, spacing: 2 });
  for (const c of COLS) body += text(M + c.right - 30, hy, c.label, { size: 26, weight: 600, fill: COLORS.mute, anchor: 'end', spacing: 1 });
  body += `<rect x="${M + 14}" y="${tableY + ROW_H - 2}" width="${CW - 28}" height="2" fill="${COLORS.line}"/>`;
  rows.forEach((b, i) => {
    const y = tableY + ROW_H + 6 + i * ROW_H;
    const active = b.contracts > 0 || b.revenue > 0;
    if (i % 2 === 1) body += `<rect x="${M + 8}" y="${y - 4}" width="${CW - 16}" height="${ROW_H}" rx="6" fill="#ffffff" fill-opacity="0.035"/>`;
    body += text(M + 20, y + 40, b.name, { size: FONT, weight: active ? 700 : 500, fill: active ? COLORS.text : '#c9d1dc' });
    for (const c of COLS) {
      const v = b[c.key];
      body += text(M + c.right - 30, y + 40, c.fmt(v), {
        size: FONT, anchor: 'end', weight: v > 0 ? 700 : 500,
        fill: c.key === 'revenue' && v > 0 ? COLORS.good : v > 0 ? COLORS.text : ZERO,
      });
    }
  });
  return wrap(tableY + tableH + 30, body);
}

const byName = (a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });

/** -> [{ name, svg }, ...] in the order they should be pasted into the chat. */
export function reportSvgsMobile(d, { logoDataUri } = {}) {
  const sorted = [...d.branches].sort(byName);
  const half = Math.ceil(sorted.length / 2);
  return [
    { name: 'summary', svg: summaryImage(d, logoDataUri) },
    { name: 'branches-1', svg: rosterImage(d, sorted.slice(0, half), 1, 2, logoDataUri) },
    { name: 'branches-2', svg: rosterImage(d, sorted.slice(half), 2, 2, logoDataUri) },
  ];
}
