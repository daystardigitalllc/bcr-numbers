// Pure date/rollup math. Mirrors the spreadsheet: daily total (row 60), old/new MTD
// (rows 62-63), days worked / total days (row 69) and the tracking figures (rows 66-67).

const METRICS = ['knock', 'talk', 'walk', 'contingency', 'approved', 'contracts', 'revenue', 'soft_sets'];

const zero = () => Object.fromEntries(METRICS.map((m) => [m, 0]));
const round2 = (n) => Math.round(n * 100) / 100;

function add(a, b) {
  const out = {};
  for (const m of METRICS) out[m] = round2((a[m] || 0) + (b[m] || 0));
  return out;
}

function sub(a, b) {
  const out = {};
  for (const m of METRICS) out[m] = round2((a[m] || 0) - (b[m] || 0));
  return out;
}

const pad = (n) => String(n).padStart(2, '0');
const fmt = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

function isValidDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// Workable days are Monday-Saturday excluding company holidays.
function isWorkday(dateStr, holidays) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow !== 0 && !holidays.has(dateStr);
}

function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// -> { worked, total } for the month containing `dateStr`; worked counts through `dateStr` inclusive.
function workdayCounts(dateStr, holidays) {
  const [y, m, day] = dateStr.split('-').map(Number);
  let worked = 0;
  let total = 0;
  for (let d = 1; d <= daysInMonth(y, m); d++) {
    if (!isWorkday(fmt(y, m, d), holidays)) continue;
    total++;
    if (d <= day) worked++;
  }
  return { worked, total };
}

function tracking(mtd, worked, total) {
  const daily = {};
  const month = {};
  for (const m of METRICS) {
    daily[m] = worked > 0 ? round2(mtd[m] / worked) : 0;
    month[m] = worked > 0 ? round2((mtd[m] * total) / worked) : 0;
  }
  return { daily, month };
}

/**
 * @param date       'YYYY-MM-DD' being reported
 * @param dayTotal   rollup of that day's submissions
 * @param priorSubs  rollup of the month's submissions strictly before `date` and after the baseline
 * @param baseline   { through_date, ...metrics } carried-in MTD from the spreadsheet, or null
 */
function buildRollup({ date, dayTotal, priorSubs, baseline, holidays }) {
  let oldMtd;
  let newMtd;
  let note = null;
  if (baseline && date > baseline.through_date) {
    oldMtd = add(baseline, priorSubs);
    newMtd = add(oldMtd, dayTotal);
  } else if (baseline && date === baseline.through_date) {
    newMtd = add(zero(), baseline);
    oldMtd = sub(newMtd, dayTotal);
    note = 'Showing the MTD carried over from the original spreadsheet.';
  } else {
    oldMtd = priorSubs;
    newMtd = add(priorSubs, dayTotal);
    if (baseline) note = `Before the spreadsheet carry-over date (${baseline.through_date}); MTD only includes submissions.`;
  }
  const { worked, total } = workdayCounts(date, holidays);
  const t = tracking(newMtd, worked, total);
  return { oldMtd, newMtd, daysWorked: worked, totalDays: total, trackingDaily: t.daily, trackingMonth: t.month, note };
}

module.exports = { METRICS, zero, add, sub, isValidDate, isWorkday, workdayCounts, tracking, buildRollup };
