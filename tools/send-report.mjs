// Nightly report email: fetches the day's numbers from the site, renders the images, and emails
// the images AND the GroupMe-format text so accounting can post whichever they prefer.
// Runs in GitHub Actions (.github/workflows/nightly-report.yml); can also be run by hand:
//   SITE_URL=... ADMIN_PASSWORD=... RESEND_API_KEY=... REPORT_FROM=... REPORT_TO=a@x.com,b@x.com node tools/send-report.mjs
//
// Env: SITE_URL, ADMIN_PASSWORD, RESEND_API_KEY, REPORT_FROM, REPORT_TO (comma list)   -- required
//      TZ_NAME (default America/New_York), REPORT_DATE (YYYY-MM-DD, default today in TZ_NAME)
//      GATE_HOUR   only send if the local hour in TZ_NAME equals this (used by the scheduled run)
//      TEST_TO     send only to this address instead of REPORT_TO
//      DRY_RUN=1   write ./out/* and print the email instead of sending
//      FORCE=1     send even if nobody has submitted yet
//      RESEND_API_URL  override (tests)
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { renderMobileSet } from './render.mjs';
import { groupmeText } from '../functions/_lib/report-text.js';
import { reportToData } from '../functions/_lib/report-data.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function localParts(tz, now) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

const prettyDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
};

export function buildEmail({ data, pngs, text, from, to }) {
  const missing = data.missing || [];
  const mmddyy = text.split('\n')[2];
  const subject = `Company Numbers – ${mmddyy}${missing.length ? ` (${missing.length} not reported)` : ''}`;

  const warn = missing.length
    ? `<div style="background:#fff4d6;border:1px solid #e8c766;border-radius:8px;padding:12px 14px;margin:0 0 18px;color:#5a4300">
         <strong>${missing.length} branch${missing.length === 1 ? '' : 'es'} had not reported when this was sent:</strong><br>${missing.map(esc).join(', ')}
         <div style="margin-top:6px;font-size:13px">They show as zeros below. Add their numbers on the dashboard and re-send if needed.</div></div>`
    : '';
  const imgs = pngs.map((p) => `<p style="margin:0 0 14px"><img src="cid:${p.name}" alt="${esc(p.name)}" style="width:100%;max-width:540px;border-radius:8px;display:block"></p>`).join('');

  const html = `<!doctype html><html><body style="margin:0;padding:20px;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1b2430">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;padding:22px">
    <h2 style="margin:0 0 4px">Company Numbers</h2>
    <div style="color:#667085;margin-bottom:18px">${esc(prettyDate(data.date))}</div>
    ${warn}
    <h3 style="margin:0 0 6px">Option 1 — Images</h3>
    <div style="color:#667085;font-size:14px;margin-bottom:12px">Post in this order: summary, then the two branch lists. Also attached to this email as PNG files.</div>
    ${imgs}
    <h3 style="margin:22px 0 6px">Option 2 — GroupMe text</h3>
    <div style="color:#667085;font-size:14px;margin-bottom:10px">Same format as always. Select the box and copy.</div>
    <pre style="white-space:pre-wrap;word-break:break-word;background:#f4f5f7;border:1px solid #dde1e7;border-radius:8px;padding:14px;font:14px/1.45 Menlo,Consolas,monospace;margin:0">${esc(text)}</pre>
  </div></body></html>`;

  const plain = `${missing.length ? `NOT REPORTED (${missing.length}): ${missing.join(', ')}\n(They show as zeros below.)\n\n` : ''}${text}\n\n(The images are attached.)`;

  return {
    from, to, subject, html, text: plain,
    attachments: pngs.map((p) => ({ filename: `${p.name}-${data.date}.png`, content: p.png.toString('base64'), content_id: p.name })),
  };
}

export async function run(env = process.env, { fetchImpl = fetch, now = new Date() } = {}) {
  for (const k of ['SITE_URL', 'ADMIN_PASSWORD', 'REPORT_FROM']) if (!env[k]) throw new Error(`${k} is required`);
  if (!env.DRY_RUN && !env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is required');
  const to = (env.TEST_TO || env.REPORT_TO || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!to.length && !env.DRY_RUN) throw new Error('REPORT_TO (or TEST_TO) is required');

  const tz = env.TZ_NAME || 'America/New_York';
  const local = localParts(tz, now);
  if (env.GATE_HOUR && Number(env.GATE_HOUR) !== local.hour) {
    console.log(`Local time in ${tz} is hour ${local.hour}, not ${env.GATE_HOUR}; nothing to do.`);
    return { skipped: 'hour' };
  }
  const date = env.REPORT_DATE || local.date;

  const res = await fetchImpl(`${env.SITE_URL.replace(/\/$/, '')}/api/admin/report?date=${date}`, { headers: { 'x-admin-password': env.ADMIN_PASSWORD } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Report fetch failed (${res.status}): ${body.error || 'unknown error'}`);

  if (!body.submittedCount && !env.FORCE) {
    console.log(`No branches have submitted for ${date}; not sending (set FORCE=1 to send anyway).`);
    return { skipped: 'empty' };
  }

  const data = reportToData(body);
  const email = buildEmail({ data, pngs: renderMobileSet(data), text: groupmeText(data), from: env.REPORT_FROM, to });

  if (env.DRY_RUN) {
    mkdirSync('out', { recursive: true });
    for (const a of email.attachments) writeFileSync(`out/${a.filename}`, Buffer.from(a.content, 'base64'));
    writeFileSync('out/email.html', email.html);
    writeFileSync('out/groupme.txt', email.text);
    console.log(`DRY RUN: "${email.subject}" to ${to.join(', ') || '(nobody)'} — files written to ./out`);
    return { dryRun: true, email };
  }

  const send = await fetchImpl(`${env.RESEND_API_URL || 'https://api.resend.com'}/emails`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify(email),
  });
  if (!send.ok) throw new Error(`Resend rejected the email (${send.status}): ${await send.text()}`);
  console.log(`Sent "${email.subject}" to ${to.length} recipient(s); ${body.submittedCount} of ${body.rows.length} branches reported.`);
  return { sent: true, email };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  run().catch((e) => { console.error(e.message); process.exit(1); });
}
