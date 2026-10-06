import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { createService } from '../functions/_lib/service.js';
import { createD1 } from './d1shim.js';

// Needs the tools deps (resvg, fonts):  npm ci --prefix tools
const { run } = await import('../tools/send-report.mjs');

const sample = JSON.parse(readFileSync(new URL('../sample/2026-10-05.json', import.meta.url), 'utf8'));
const NOW = new Date('2026-10-06T02:30:00Z'); // 10:30pm Mon Oct 5 in New York (EDT)

async function world({ skip = [], submit = true } = {}) {
  const svc = createService(createD1());
  const list = await svc.branches();
  if (submit) {
    for (const [i, b] of sample.branches.entries()) {
      if (skip.includes(b.name)) continue;
      const extra = i === 0 ? { knock: sample.daily.knock, talk: sample.daily.talk, walk: sample.daily.walk } : {};
      await svc.submit({ branchId: list.find((x) => x.name === b.name).id, date: sample.date, metrics: { ...b, ...extra } });
    }
  }
  const sent = [];
  let resendStatus = 200;
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const chunks = [];
    for await (const c of req) chunks.push(c);
    if (url.pathname === '/api/admin/report') {
      if (req.headers['x-admin-password'] !== 'pw') { res.writeHead(401, { 'content-type': 'application/json' }); return res.end('{"error":"nope"}'); }
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(await svc.report(url.searchParams.get('date'))));
    }
    if (url.pathname === '/emails') {
      sent.push({ auth: req.headers.authorization, body: JSON.parse(Buffer.concat(chunks).toString()) });
      res.writeHead(resendStatus, { 'content-type': 'application/json' });
      return res.end(resendStatus === 200 ? '{"id":"x"}' : '{"message":"bad"}');
    }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const env = { SITE_URL: base, ADMIN_PASSWORD: 'pw', RESEND_API_KEY: 're_test', RESEND_API_URL: base, REPORT_FROM: 'Numbers <n@example.com>', REPORT_TO: 'a@x.com, b@x.com' };
  return { env, sent, close: () => server.close(), setResend: (s) => { resendStatus = s; } };
}

test('sends one email with the 3 images AND the exact GroupMe text', async () => {
  const w = await world();
  try {
    const r = await run({ ...w.env, GATE_HOUR: '22' }, { now: NOW });
    assert.equal(r.sent, true);
    const { auth, body } = w.sent[0];
    assert.equal(auth, 'Bearer re_test');
    assert.deepEqual(body.to, ['a@x.com', 'b@x.com']);
    assert.equal(body.subject, 'Company Numbers – 10/05/26');
    assert.deepEqual(body.attachments.map((a) => a.content_id), ['summary', 'branches-1', 'branches-2']);
    for (const a of body.attachments) assert.equal(Buffer.from(a.content, 'base64').subarray(1, 4).toString(), 'PNG');
    assert.ok(body.html.includes('cid:summary') && body.html.includes('Option 2'));
    const expected = readFileSync(new URL('../sample/2026-10-05.groupme.txt', import.meta.url), 'utf8');
    assert.ok(body.text.startsWith(expected), 'plain-text part starts with the exact GroupMe post');
    assert.ok(body.html.includes('Hendersonville: 3-0-0-$0.00-1'));
    assert.ok(!body.html.includes('not reported when'));
  } finally { w.close(); }
});

test('flags branches that have not reported, in the subject and body', async () => {
  const w = await world({ skip: ['Memphis', 'Vegas', 'Tupelo'] });
  try {
    await run(w.env, { now: NOW });
    const { body } = w.sent[0];
    assert.equal(body.subject, 'Company Numbers – 10/05/26 (3 not reported)');
    assert.ok(['Memphis', 'Tupelo', 'Vegas'].every((n) => body.html.includes(n)));
    assert.ok(body.text.startsWith('NOT REPORTED (3)'));
  } finally { w.close(); }
});

test('does nothing outside the send hour, with no submissions, or when TEST_TO/DRY_RUN apply', async () => {
  const w = await world();
  const empty = await world({ submit: false });
  try {
    assert.deepEqual(await run({ ...w.env, GATE_HOUR: '21' }, { now: NOW }), { skipped: 'hour' });
    assert.deepEqual(await run(empty.env, { now: NOW }), { skipped: 'empty' });
    assert.equal(w.sent.length + empty.sent.length, 0);

    await run({ ...w.env, TEST_TO: 'me@x.com' }, { now: NOW });
    assert.deepEqual(w.sent[0].body.to, ['me@x.com']);

    const dry = await run({ ...w.env, DRY_RUN: '1' }, { now: NOW });
    assert.equal(dry.dryRun, true);
    assert.equal(w.sent.length, 1, 'dry run sends nothing');
  } finally { w.close(); empty.close(); }
});

test('fails loudly (so the workflow goes red) on a bad password or a Resend error', async () => {
  const w = await world();
  try {
    await assert.rejects(run({ ...w.env, ADMIN_PASSWORD: 'wrong' }, { now: NOW }), /Report fetch failed \(401\)/);
    w.setResend(422);
    await assert.rejects(run(w.env, { now: NOW }), /Resend rejected the email \(422\)/);
    await assert.rejects(run({ ...w.env, REPORT_FROM: '' }, { now: NOW }), /REPORT_FROM is required/);
  } finally { w.close(); }
});
