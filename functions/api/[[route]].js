// Cloudflare Pages Function: every /api/* request.
//   Public:      GET /api/config, POST /api/submit
//   Accounting:  /api/admin/*  (header x-admin-password)
// Bindings / secrets (Pages project -> Settings):
//   DB (D1 binding), ADMIN_PASSWORD (secret, required), GM_CODE (secret, optional), TZ_NAME (optional)
import { createService, HttpError } from '../_lib/service.js';

const json = (data, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } });

// Constant-time compare via SHA-256 digests so length and content don't leak.
async function safeEq(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([a, b].map(async (s) => new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(String(s))))));
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function readJson(request) {
  try { return await request.json(); } catch { throw new HttpError(400, 'bad JSON'); }
}

async function handle({ request, env }) {
  if (!env.DB) throw new HttpError(500, 'Database is not configured (missing D1 binding named DB).');
  if (!env.ADMIN_PASSWORD) throw new HttpError(500, 'ADMIN_PASSWORD is not configured.');
  const svc = createService(env.DB);
  const tz = env.TZ_NAME || 'America/New_York';
  const url = new URL(request.url);
  const p = url.pathname.replace(/\/+$/, '');
  const m = request.method;
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';

  if (m === 'GET' && p === '/api/config')
    return json({ branches: await svc.branches(), today: svc.today(tz), needsCode: !!env.GM_CODE });

  if (m === 'POST' && p === '/api/submit') {
    const b = await readJson(request);
    if (env.GM_CODE) {
      const ok = await safeEq(b.code || '', env.GM_CODE);
      await svc.throttle(ip, ok);
      if (!ok) throw new HttpError(401, 'Wrong access code');
    }
    const today = svc.today(tz);
    const date = b.date || today;
    if (date > today) throw new HttpError(400, "Date can't be in the future");
    const r = await svc.submit({ branchId: Number(b.branchId), date, metrics: b, source: 'form' });
    return json({ ok: true, date, ...r });
  }

  if (!p.startsWith('/api/admin/')) throw new HttpError(404, 'not found');

  // Everything below is accounting-only.
  const authed = await safeEq(request.headers.get('x-admin-password') || '', env.ADMIN_PASSWORD);
  await svc.throttle(ip, authed);
  if (!authed) throw new HttpError(401, 'Wrong or missing accounting password');

  const id = p.split('/').pop();
  if (m === 'POST' && p === '/api/admin/check') return json({ ok: true });
  if (m === 'GET' && p === '/api/admin/report') return json(await svc.report(url.searchParams.get('date') || svc.today(tz)));
  if (m === 'POST' && p === '/api/admin/submit') {
    const b = await readJson(request);
    return json({ ok: true, ...(await svc.submit({ branchId: Number(b.branchId), date: b.date, metrics: b, source: 'accounting' })) });
  }
  if (m === 'GET' && p === '/api/admin/setup')
    return json({ branches: await svc.branches(true), holidays: await svc.holidays(), baselines: await svc.baselines() });
  if (m === 'POST' && p === '/api/admin/branches') { await svc.addBranch((await readJson(request)).name); return json({ ok: true }); }
  if (m === 'PATCH' && p.startsWith('/api/admin/branches/')) { await svc.setBranch(Number(id), await readJson(request)); return json({ ok: true }); }
  if (m === 'POST' && p === '/api/admin/holidays') { const b = await readJson(request); await svc.addHoliday(b.date, b.name); return json({ ok: true }); }
  if (m === 'DELETE' && p.startsWith('/api/admin/holidays/')) { await svc.removeHoliday(id); return json({ ok: true }); }
  if (m === 'POST' && p === '/api/admin/baselines') { await svc.setBaseline(await readJson(request)); return json({ ok: true }); }
  if (m === 'DELETE' && p.startsWith('/api/admin/baselines/')) { await svc.removeBaseline(id); return json({ ok: true }); }

  throw new HttpError(404, 'not found');
}

export async function onRequest(ctx) {
  try {
    return await handle(ctx);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'Server error' }, 500);
  }
}
