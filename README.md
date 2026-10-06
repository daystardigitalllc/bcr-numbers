# BCR Numbers

Replaces the nightly GroupMe number reports. GMs fill out a form; accounting sees every branch's numbers,
the daily total, MTD and tracking figures calculated automatically (what the spreadsheet did by hand).

- `/` — GM form (Knock, Talk, Walk, Contingency, Approved, Contracts, Revenue, Soft Sets)
- `/dashboard` — accounting view: per-branch table, who hasn't reported, Daily Total, Old/New MTD,
  Tracking Daily, Tracking For Month, edit/enter on behalf of a GM, copy GroupMe-style recap, setup tab

## Run

Needs Node 22.13+ (no npm dependencies; data is a SQLite file).

    ADMIN_PASSWORD=choose-one GM_CODE=optional-shared-code npm start

| Env | Purpose |
|---|---|
| `ADMIN_PASSWORD` | **Required.** Accounting dashboard password |
| `GM_CODE` | Optional shared code GMs enter on the form |
| `TZ_NAME` | Timezone for "today" (default `America/New_York`) |
| `DB_FILE` | SQLite path (default `data/numbers.db`) — keep this on persistent storage / back it up |
| `PORT` | default 3000 |

`npm test` runs the calculation tests.

## How the math works (matches the spreadsheet)

- **Daily Total (row 60)** = sum of all branches' submissions for the date.
- **New MTD (row 63)** = Old MTD + Daily Total; **Old MTD (row 62)** = the previous day's New MTD. Calculated from stored
  submissions, so nothing is carried over by hand. A branch resubmitting for the same date *replaces* its earlier numbers.
- **Days worked / total days (row 69)** = Mon–Sat minus holidays (Setup tab), counted through the report date.
  October 2026 = 27, 3 worked through 10/3, as in the sheet.
- **Tracking Daily** = MTD ÷ days worked. **Tracking For Month** = MTD × total days ÷ days worked
  (the sheet's `B66` formula, which is the month projection). Shown for every column, not just revenue.
- **Carry-in:** the spreadsheet's 10/3 MTD is preloaded (Setup tab). Submissions after 10/3 stack on top.
  Add a carry-in for any other month you need to start mid-way; a month with none starts at zero.
