# BCR Numbers

Replaces the nightly GroupMe number reports. GMs fill out a form; accounting sees every branch's numbers,
the daily total, MTD and tracking figures calculated automatically (what the spreadsheet did by hand).

- `/` — GM form (Knock, Talk, Walk, Contingency, Approved, Contracts, Revenue, Soft Sets). The date is locked to today
  (server-side, in `TZ_NAME`), and each branch can submit **once per day**; a repeat gets an "already submitted" error.
- `/dashboard` — accounting view: per-branch table, who hasn't reported, Daily Total, Old/New MTD,
  Tracking Daily, Tracking For Month, a "Not yet submitted" list for the day, Edit / Enter / Delete on any branch
  (delete lets the branch resubmit; every change is kept in `submission_log`), copy GroupMe-style recap, Setup tab

Built for **Cloudflare Pages + D1**, same layout as the mirewood site: static files in `public/`, API as a
Pages Function in `functions/api/`, no build step, no runtime dependencies.

```
public/            static pages (Pages "build output directory")
functions/api/     [[route]].js  -> every /api/* endpoint
functions/_lib/    calc.js (rollup math), service.js (D1 queries)
schema.sql         D1 tables + seed (55 branches, October 2026 carry-in)
test/              npm test  (runs the real schema.sql + queries against SQLite)
```

## Deploy (one time)

1. **Create the database** (needs Node + a Cloudflare login):
   ```
   npx wrangler login
   npx wrangler d1 create bcr-numbers
   npx wrangler d1 execute bcr-numbers --remote --file=schema.sql
   ```
2. **Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git** → pick this repo.
   - Framework preset: *None*
   - Build command: *(leave empty)*
   - **Build output directory: `public`**
3. In the new project: **Settings → Bindings → Add → D1 database**: variable name **`DB`**, select `bcr-numbers`
   (add it for both Production and Preview).
4. **Settings → Variables and Secrets** (Production):

   | Name | Type | Purpose |
   |---|---|---|
   | `ADMIN_PASSWORD` | Secret, **required** | accounting dashboard password |
   | `GM_CODE` | Secret, optional | shared code GMs enter on the form |
   | `TZ_NAME` | Text, optional | timezone for "today" (default `America/Chicago`) |

5. Redeploy once (Deployments → Retry) so the binding and secrets take effect. Optionally add a custom domain.

Every push to the connected branch redeploys automatically. Backups: D1 has built-in Time Travel
(`npx wrangler d1 time-travel info bcr-numbers`).

## Nightly email (images + GroupMe text)

`tools/send-report.mjs` pulls the day's numbers from the site, renders the phone-friendly images, and emails
**both** the images and the exact GroupMe-format text via Resend. It runs in GitHub Actions
(`.github/workflows/nightly-report.yml`), not on Cloudflare: rendering PNGs needs more CPU than Cloudflare's free
plan allows, and Actions is free.

One-time setup, in the GitHub repo -> Settings -> Secrets and variables -> Actions.

**Sending through Gmail (free, no domain needed)** - recommended:
1. Make a Gmail account just for this (e.g. `bcrnumbers@gmail.com`) and turn on 2-Step Verification.
2. Go to <https://myaccount.google.com/apppasswords>, create an app password (16 characters).
3. Add to GitHub:

| Kind | Name | Value |
|---|---|---|
| Secret | `ADMIN_PASSWORD` | the same dashboard password set in Cloudflare |
| Secret | `SMTP_PASS` | the 16-character app password |
| Variable | `SMTP_USER` | the Gmail address |
| Variable | `SITE_URL` | your Pages URL, e.g. `https://bcr-numbers.pages.dev` |
| Variable | `REPORT_TO` | comma-separated recipient list |
| Variable (optional) | `SEND_HOUR` | local hour to send, 0-23 (default `22` = 10pm Central) |
| Variable (optional) | `TZ_NAME` | default `America/Chicago` (HQ time; also sets what "today" means on the form) |

Gmail allows ~500 emails/day per account, far more than needed.

**Not Gmail? Any provider with SMTP works** - set `SMTP_USER`, `SMTP_PASS`, plus `SMTP_HOST` (and `SMTP_PORT` if not 465):

| Provider | `SMTP_HOST` | `SMTP_PORT` | `SMTP_USER` / `SMTP_PASS` |
|---|---|---|---|
| Yahoo Mail (free) | `smtp.mail.yahoo.com` | 465 (default) | full Yahoo address / an app password (Account Security -> Generate app password) |
| Brevo (free, 300/day) | `smtp-relay.brevo.com` | `587` | Brevo login email / an SMTP key; also set variable `REPORT_FROM` to a sender address verified in Brevo |

(Zoho's free plan does not allow SMTP, so it can't be used.)

**Or Resend** (needs a verified domain): set secret `RESEND_API_KEY` and variable `REPORT_FROM` instead of the two `SMTP_*` entries.

The workflow must be on the repository's **default branch** for the schedule and the "Run workflow" button to work.
Test it any time: Actions -> *Nightly numbers email* -> Run workflow (fill `test_to` to send only to yourself,
or tick `dry_run` to render without sending). Scheduled runs skip themselves if nobody has submitted yet; GitHub can
start scheduled runs a few minutes late, and a run delayed past the send hour is skipped (re-run it by hand).

Preview the images locally: `npm ci --prefix tools && node tools/preview.mjs sample/2026-10-05.json out --mobile`.

## Local development

    echo "ADMIN_PASSWORD=pw" > .dev.vars          # gitignored
    npx wrangler pages dev public --d1 DB
    # first run only: apply schema.sql to the local DB file under .wrangler/state/v3/d1/
    npm ci --prefix tools && npm test              # calculation, data-layer, text-format and email tests

## How the math works (matches the spreadsheet)

- **Daily Total (row 60)** = sum of all branches' submissions for the date.
- **New MTD (row 63)** = Old MTD + Daily Total; **Old MTD (row 62)** = the previous day's New MTD. Calculated from stored
  submissions, so nothing is carried over by hand. A branch resubmitting for the same date *replaces* its earlier numbers.
- **Days worked / total days (row 69)** = Mon–Sat minus holidays (Setup tab), counted through the report date.
  October 2026 = 27, 3 worked through 10/3, as in the sheet.
- **Tracking Daily** = MTD ÷ days worked. **Tracking For Month** = MTD × total days ÷ days worked
  (the sheet's `B66` formula, which is the month projection). Shown for every column, not just revenue.
- **Carry-in:** the spreadsheet's 10/3 MTD is preloaded. Submissions after 10/3 stack on top.
  Add a carry-in for any other month you need to start mid-way; a month with none starts at zero.
