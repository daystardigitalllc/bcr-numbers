const { METRICS, zero, add, isValidDate, buildRollup } = require('./calc');

const COUNT_FIELDS = METRICS.filter((m) => m !== 'revenue');
const MAX_COUNT = 1_000_000;
const MAX_REVENUE = 100_000_000;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Accepts "$1,234.50" style input; blank means 0. Returns a clean metrics object or throws 400.
function parseMetrics(input) {
  const out = {};
  for (const m of METRICS) {
    let v = input[m];
    if (v === undefined || v === null || String(v).trim() === '') v = 0;
    if (typeof v === 'string') v = v.replace(/[$,\s]/g, '');
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) throw new HttpError(400, `${m.replace('_', ' ')} must be a number, 0 or more`);
    if (COUNT_FIELDS.includes(m)) {
      if (!Number.isInteger(n) || n > MAX_COUNT) throw new HttpError(400, `${m.replace('_', ' ')} must be a whole number`);
      out[m] = n;
    } else {
      if (n > MAX_REVENUE) throw new HttpError(400, 'revenue is too large');
      out[m] = Math.round(n * 100) / 100;
    }
  }
  return out;
}

function createService(db, { now = () => new Date() } = {}) {
  const q = (sql) => db.prepare(sql);

  const branches = (all = false) =>
    q(`SELECT id, name, active FROM branches ${all ? '' : 'WHERE active = 1'} ORDER BY sort, id`).all();

  const holidaySet = () => new Set(q('SELECT date FROM holidays').all().map((r) => r.date));

  function submit({ branchId, date, metrics, source = 'form' }) {
    if (!isValidDate(date)) throw new HttpError(400, 'invalid date');
    const branch = q('SELECT id, active FROM branches WHERE id = ?').get(branchId);
    if (!branch || (!branch.active && source === 'form')) throw new HttpError(400, 'unknown branch');
    const m = parseMetrics(metrics);
    const at = now().toISOString();
    const existed = !!q('SELECT 1 FROM submissions WHERE branch_id = ? AND date = ?').get(branch.id, date);
    db.exec('BEGIN');
    try {
      q(`INSERT INTO submissions (branch_id, date, ${METRICS.join(',')}, source, submitted_at)
         VALUES (?, ?, ${METRICS.map(() => '?').join(',')}, ?, ?)
         ON CONFLICT (branch_id, date) DO UPDATE SET
           ${METRICS.map((k) => `${k} = excluded.${k}`).join(', ')}, source = excluded.source, submitted_at = excluded.submitted_at`)
        .run(branch.id, date, ...METRICS.map((k) => m[k]), source, at);
      q('INSERT INTO submission_log (branch_id, date, payload, source, at) VALUES (?, ?, ?, ?, ?)')
        .run(branch.id, date, JSON.stringify(m), source, at);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    return { updated: existed, metrics: m };
  }

  function sumRange(from, to) {
    const row = q(`SELECT ${METRICS.map((m) => `COALESCE(SUM(${m}),0) AS ${m}`).join(',')}
                   FROM submissions WHERE date >= ? AND date <= ?`).get(from, to);
    return add(zero(), row);
  }

  function report(date) {
    if (!isValidDate(date)) throw new HttpError(400, 'invalid date');
    const month = date.slice(0, 7);
    const monthStart = `${month}-01`;
    const baseline = q('SELECT * FROM baselines WHERE month = ?').get(month) || null;

    const subs = new Map(q('SELECT * FROM submissions WHERE date = ?').all(date).map((r) => [r.branch_id, r]));
    const rows = branches(true)
      .filter((b) => b.active || subs.has(b.id))
      .map((b) => {
        const s = subs.get(b.id);
        return { branchId: b.id, branch: b.name, submitted: !!s, submittedAt: s ? s.submitted_at : null, source: s ? s.source : null,
          ...Object.fromEntries(METRICS.map((m) => [m, s ? s[m] : null])) };
      });

    const dayTotal = sumRange(date, date);
    const priorFrom = baseline && date > baseline.through_date
      ? new Date(Date.parse(`${baseline.through_date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)
      : monthStart;
    const priorTo = new Date(Date.parse(`${date}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
    const priorSubs = priorTo >= priorFrom ? sumRange(priorFrom, priorTo) : zero();

    const roll = buildRollup({ date, dayTotal, priorSubs, baseline, holidays: holidaySet() });
    return {
      date, rows, dayTotal,
      missing: rows.filter((r) => !r.submitted && r.active !== 0).map((r) => r.branch),
      submittedCount: rows.filter((r) => r.submitted).length,
      ...roll,
    };
  }

  return {
    HttpError, branches, submit, report,
    today: (tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now()),

    addBranch(name) {
      name = String(name || '').trim();
      if (!name) throw new HttpError(400, 'name required');
      if (q('SELECT 1 FROM branches WHERE name = ?').get(name)) throw new HttpError(409, 'branch already exists');
      const next = q('SELECT COALESCE(MAX(sort),-1)+1 AS n FROM branches').get().n;
      q('INSERT INTO branches (name, sort) VALUES (?, ?)').run(name, next);
    },
    setBranch(id, { name, active }) {
      const b = q('SELECT * FROM branches WHERE id = ?').get(id);
      if (!b) throw new HttpError(404, 'not found');
      q('UPDATE branches SET name = ?, active = ? WHERE id = ?')
        .run(name === undefined ? b.name : String(name).trim() || b.name, active === undefined ? b.active : active ? 1 : 0, id);
    },
    holidays: () => q('SELECT date, name FROM holidays ORDER BY date').all(),
    addHoliday(date, name = '') {
      if (!isValidDate(date)) throw new HttpError(400, 'invalid date');
      q('INSERT OR REPLACE INTO holidays (date, name) VALUES (?, ?)').run(date, String(name).slice(0, 80));
    },
    removeHoliday: (date) => q('DELETE FROM holidays WHERE date = ?').run(date),
    baselines: () => q('SELECT * FROM baselines ORDER BY month DESC').all(),
    setBaseline({ month, through_date, ...rest }) {
      if (!/^\d{4}-\d{2}$/.test(month || '') || !isValidDate(through_date) || !through_date.startsWith(month))
        throw new HttpError(400, 'month (YYYY-MM) and a through_date inside that month are required');
      const m = parseMetrics(rest);
      q(`INSERT OR REPLACE INTO baselines (month, through_date, ${METRICS.join(',')}) VALUES (?, ?, ${METRICS.map(() => '?').join(',')})`)
        .run(month, through_date, ...METRICS.map((k) => m[k]));
    },
    removeBaseline: (month) => q('DELETE FROM baselines WHERE month = ?').run(month),
  };
}

module.exports = { createService, parseMetrics, HttpError };
