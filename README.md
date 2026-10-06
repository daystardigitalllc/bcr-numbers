# BCR Numbers

Replaces the nightly GroupMe number reports. GMs fill out a form; accounting sees every branch's numbers,
the daily total, MTD and tracking figures calculated automatically (what the spreadsheet did by hand).

- `/` — GM form (Knock, Talk, Walk, Contingency, Approved, Contracts, Revenue, Soft Sets)
- `/dashboard` — accounting view: per-branch table, who hasn't reported, Daily Total, Old/New MTD,
  Tracking Daily, Tracking For Month, edit/enter on behalf of a GM, copy GroupMe-style recap, Setup tab

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
   | `TZ_NAME` | Text, optional | timezone for "today" (default `America/New_York`) |

5. Redeploy once (Deployments → Retry) so the binding and secrets take effect. Optionally add a custom domain.

Every push to the connected branch redeploys automatically. Backups: D1 has built-in Time Travel
(`npx wrangler d1 time-travel info bcr-numbers`).

## Local development

    echo "ADMIN_PASSWORD=pw" > .dev.vars          # gitignored
    npx wrangler pages dev public --d1 DB
    # first run only: apply schema.sql to the local DB file under .wrangler/state/v3/d1/
    npm test                                       # calculation + data-layer tests

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
