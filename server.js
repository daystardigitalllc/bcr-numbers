// Zero-dependency server (Node >= 22.13): GM form, accounting dashboard, JSON API, SQLite storage.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { open } = require('./lib/db');
const { createService, HttpError } = require('./lib/service');

const PORT = Number(process.env.PORT || 3000);
const TZ = process.env.TZ_NAME || 'America/New_York';
const GM_CODE = process.env.GM_CODE || '';          // shared code GMs type on the form (blank = no code)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ''; // accounting password (required)
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data', 'numbers.db');
const PUBLIC = path.join(__dirname, 'public');

if (!ADMIN_PASSWORD) {
  console.error('ADMIN_PASSWORD is required (accounting dashboard password). Example: ADMIN_PASSWORD=secret npm start');
  process.exit(1);
}

const svc = createService(open(DB_FILE));

const safeEq = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};
const isAdmin = (req) => safeEq(req.headers['x-admin-password'] || '', ADMIN_PASSWORD);
const requireAdmin = (req) => { if (!isAdmin(req)) throw new HttpError(401, 'Wrong or missing accounting password'); };

// Light brute-force guard: max failures per IP per minute.
const fails = new Map();
function guard(req, ok) {
  const ip = req.socket.remoteAddress;
  const now = Date.now();
  const rec = (fails.get(ip) || []).filter((t) => now - t < 60_000);
  if (rec.length >= 10) throw new HttpError(429, 'Too many attempts, wait a minute');
  if (!ok) rec.push(now);
  fails.set(ip, rec);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 100_000) { reject(new HttpError(413, 'too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new HttpError(400, 'bad JSON')); } });
  });
}

const send = (res, status, data) => {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
};

async function api(req, res, url) {
  const p = url.pathname;
  const m = req.method;

  if (m === 'GET' && p === '/api/config')
    return send(res, 200, { branches: svc.branches(), today: svc.today(TZ), needsCode: !!GM_CODE });

  if (m === 'POST' && p === '/api/submit') {
    const b = await readJson(req);
    if (GM_CODE) { const ok = safeEq(b.code || '', GM_CODE); guard(req, ok); if (!ok) throw new HttpError(401, 'Wrong access code'); }
    const today = svc.today(TZ);
    const date = b.date || today;
    if (date > today) throw new HttpError(400, "Date can't be in the future");
    const r = svc.submit({ branchId: Number(b.branchId), date, metrics: b, source: 'form' });
    return send(res, 200, { ok: true, date, ...r });
  }

  if (m === 'POST' && p === '/api/admin/check') { guard(req, isAdmin(req)); requireAdmin(req); return send(res, 200, { ok: true }); }

  // Everything below is accounting-only.
  guard(req, isAdmin(req));
  requireAdmin(req);

  if (m === 'GET' && p === '/api/admin/report')
    return send(res, 200, svc.report(url.searchParams.get('date') || svc.today(TZ)));
  if (m === 'POST' && p === '/api/admin/submit') {
    const b = await readJson(req);
    return send(res, 200, { ok: true, ...svc.submit({ branchId: Number(b.branchId), date: b.date, metrics: b, source: 'accounting' }) });
  }
  if (m === 'GET' && p === '/api/admin/setup')
    return send(res, 200, { branches: svc.branches(true), holidays: svc.holidays(), baselines: svc.baselines() });
  if (m === 'POST' && p === '/api/admin/branches') { svc.addBranch((await readJson(req)).name); return send(res, 200, { ok: true }); }
  if (m === 'PATCH' && p.startsWith('/api/admin/branches/')) { svc.setBranch(Number(p.split('/').pop()), await readJson(req)); return send(res, 200, { ok: true }); }
  if (m === 'POST' && p === '/api/admin/holidays') { const b = await readJson(req); svc.addHoliday(b.date, b.name); return send(res, 200, { ok: true }); }
  if (m === 'DELETE' && p.startsWith('/api/admin/holidays/')) { svc.removeHoliday(p.split('/').pop()); return send(res, 200, { ok: true }); }
  if (m === 'POST' && p === '/api/admin/baselines') { svc.setBaseline(await readJson(req)); return send(res, 200, { ok: true }); }
  if (m === 'DELETE' && p.startsWith('/api/admin/baselines/')) { svc.removeBaseline(p.split('/').pop()); return send(res, 200, { ok: true }); }

  throw new HttpError(404, 'not found');
}

const PAGES = { '/': 'index.html', '/dashboard': 'dashboard.html', '/style.css': 'style.css' };
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    const file = PAGES[url.pathname];
    if (!file) throw new HttpError(404, 'not found');
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)], 'cache-control': 'no-cache' });
    res.end(fs.readFileSync(path.join(PUBLIC, file)));
  } catch (e) {
    if (!(e instanceof HttpError)) console.error(e);
    if (res.headersSent) return res.end();
    send(res, e.status || 500, { error: e instanceof HttpError ? e.message : 'Server error' });
  }
}).listen(PORT, () => console.log(`BCR Numbers on http://localhost:${PORT}  (form: /, accounting: /dashboard)`));
