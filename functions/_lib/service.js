// Data layer on Cloudflare D1. `db` is the D1 binding (env.DB).
import { METRICS, zero, add, isValidDate, buildRollup } from './calc.js';

const COUNT_FIELDS = METRICS.filter((m) => m !== 'revenue');
const MAX_COUNT = 1_000_000;
const MAX_REVENUE = 100_000_000;
const DAY = 86_400_000;

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Accepts "$1,234.50" style input; blank means 0. Returns a clean metrics object or throws 400.
export function parseMetrics(input) {
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

const shiftDate = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

export function createService(db, { now = () => new Date() } = {}) {
  const all = async (sql, ...args) => (await db.prepare(sql).bind(...args).all()).results;
  const first = (sql, ...args) => db.prepare(sql).bind(...args).first();
  const run = (sql, ...args) => db.prepare(sql).bind(...args).run();

  const branches = (includeInactive = false) =>
    all(`SELECT id, name, active FROM branches ${includeInactive ? '' : 'WHERE active = 1'} ORDER BY sort, id`);

  const usDate = (d) => `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)}`;

  // Form submissions never overwrite: a branch can only submit once per date (409 if it already has).
  // Accounting passes replace:true to correct a branch's numbers.
  async function submit({ branchId, date, metrics, source = 'form', replace = false }) {
    if (!isValidDate(date)) throw new HttpError(400, 'invalid date');
    const branch = await first('SELECT id, name, active FROM branches WHERE id = ?', branchId);
    if (!branch || (!branch.active && source === 'form')) throw new HttpError(400, 'unknown branch');
    const m = parseMetrics(metrics);
    const at = now().toISOString();
    const dup = new HttpError(409, `Numbers for ${branch.name.trim()} have already been submitted for ${usDate(date)}. If something is wrong, contact accounting to have it corrected.`);
    const existed = !!(await first('SELECT 1 AS x FROM submissions WHERE branch_id = ? AND date = ?', branch.id, date));
    if (existed && !replace) throw dup;
    const cols = `branch_id, date, ${METRICS.join(',')}, source, submitted_at`;
    const marks = `?, ?, ${METRICS.map(() => '?').join(',')}, ?, ?`;
    const upsert = replace
      ? ` ON CONFLICT (branch_id, date) DO UPDATE SET ${METRICS.map((k) => `${k} = excluded.${k}`).join(', ')}, source = excluded.source, submitted_at = excluded.submitted_at`
      : '';
    try {
      await db.batch([
        db.prepare(`INSERT INTO submissions (${cols}) VALUES (${marks})${upsert}`)
          .bind(branch.id, date, ...METRICS.map((k) => m[k]), source, at),
        db.prepare('INSERT INTO submission_log (branch_id, date, payload, source, at) VALUES (?, ?, ?, ?, ?)')
          .bind(branch.id, date, JSON.stringify(m), source, at),
      ]);
    } catch (e) {
      if (!replace && /UNIQUE|constraint/i.test(String(e.message))) throw dup; // lost a race with a simultaneous submit
      throw e;
    }
    return { updated: existed, metrics: m };
  }

  // Accounting: remove a submission entirely so the branch can submit again. Kept in the audit log.
  async function deleteSubmission(branchId, date) {
    if (!isValidDate(date)) throw new HttpError(400, 'invalid date');
    const row = await first('SELECT * FROM submissions WHERE branch_id = ? AND date = ?', branchId, date);
    if (!row) throw new HttpError(404, 'No submission found for that branch and date');
    await db.batch([
      db.prepare('DELETE FROM submissions WHERE branch_id = ? AND date = ?').bind(branchId, date),
      db.prepare('INSERT INTO submission_log (branch_id, date, payload, source, at) VALUES (?, ?, ?, ?, ?)')
        .bind(branchId, date, JSON.stringify({ deleted: Object.fromEntries(METRICS.map((k) => [k, row[k]])) }), 'accounting-delete', now().toISOString()),
    ]);
  }

  async function sumRange(from, to) {
    const row = await first(`SELECT ${METRICS.map((m) => `COALESCE(SUM(${m}),0) AS ${m}`).join(',')}
                             FROM submissions WHERE date >= ? AND date <= ?`, from, to);
    return add(zero(), row);
  }

  async function report(date) {
    if (!isValidDate(date)) throw new HttpError(400, 'invalid date');
    const month = date.slice(0, 7);
    const baseline = (await first('SELECT * FROM baselines WHERE month = ?', month)) || null;
    const holidays = new Set((await all('SELECT date FROM holidays')).map((r) => r.date));

    const subs = new Map((await all('SELECT * FROM submissions WHERE date = ?', date)).map((r) => [r.branch_id, r]));
    const rows = (await branches(true))
      .filter((b) => b.active || subs.has(b.id))
      .map((b) => {
        const s = subs.get(b.id);
        return { branchId: b.id, branch: b.name, active: b.active, submitted: !!s, submittedAt: s ? s.submitted_at : null, source: s ? s.source : null,
          ...Object.fromEntries(METRICS.map((m) => [m, s ? s[m] : null])) };
      });

    const dayTotal = await sumRange(date, date);
    const priorFrom = baseline && date > baseline.through_date ? shiftDate(baseline.through_date, 1) : `${month}-01`;
    const priorTo = shiftDate(date, -1);
    const priorSubs = priorTo >= priorFrom ? await sumRange(priorFrom, priorTo) : zero();

    const roll = buildRollup({ date, dayTotal, priorSubs, baseline, holidays });
    return {
      date, rows, dayTotal,
      missing: rows.filter((r) => !r.submitted && r.active).map((r) => r.branch),
      submittedCount: rows.filter((r) => r.submitted).length,
      ...roll,
    };
  }

  return {
    branches, submit, deleteSubmission, report,
    today: (tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now()),

    async addBranch(name) {
      name = String(name || '').trim();
      if (!name) throw new HttpError(400, 'name required');
      if (await first('SELECT 1 AS x FROM branches WHERE name = ?', name)) throw new HttpError(409, 'branch already exists');
      const { n } = await first('SELECT COALESCE(MAX(sort),-1)+1 AS n FROM branches');
      await run('INSERT INTO branches (name, sort) VALUES (?, ?)', name, n);
    },
    async setBranch(id, { name, active }) {
      const b = await first('SELECT * FROM branches WHERE id = ?', id);
      if (!b) throw new HttpError(404, 'not found');
      await run('UPDATE branches SET name = ?, active = ? WHERE id = ?',
        name === undefined ? b.name : String(name).trim() || b.name, active === undefined ? b.active : active ? 1 : 0, id);
    },
    holidays: () => all('SELECT date, name FROM holidays ORDER BY date'),
    async addHoliday(date, name = '') {
      if (!isValidDate(date)) throw new HttpError(400, 'invalid date');
      await run('INSERT OR REPLACE INTO holidays (date, name) VALUES (?, ?)', date, String(name).slice(0, 80));
    },
    removeHoliday: (date) => run('DELETE FROM holidays WHERE date = ?', date),
    baselines: () => all('SELECT * FROM baselines ORDER BY month DESC'),
    async setBaseline({ month, through_date, ...rest }) {
      if (!/^\d{4}-\d{2}$/.test(month || '') || !isValidDate(through_date) || !through_date.startsWith(month))
        throw new HttpError(400, 'month (YYYY-MM) and a through_date inside that month are required');
      const m = parseMetrics(rest);
      await run(`INSERT OR REPLACE INTO baselines (month, through_date, ${METRICS.join(',')}) VALUES (?, ?, ${METRICS.map(() => '?').join(',')})`,
        month, through_date, ...METRICS.map((k) => m[k]));
    },
    removeBaseline: (month) => run('DELETE FROM baselines WHERE month = ?', month),

    // Failed-login throttle kept in D1 (Workers isolates don't share memory).
    async throttle(ip, ok) {
      const t = now().getTime();
      const { n } = await first('SELECT COUNT(*) AS n FROM auth_failures WHERE ip = ? AND at > ?', ip, t - 60_000);
      if (n >= 10) throw new HttpError(429, 'Too many attempts, wait a minute');
      if (!ok) {
        await run('DELETE FROM auth_failures WHERE at < ?', t - 3_600_000);
        await run('INSERT INTO auth_failures (ip, at) VALUES (?, ?)', ip, t);
      }
    },
  };
}
