-- D1 schema + seed. Run once:  npx wrangler d1 execute bcr-numbers --remote --file=schema.sql
-- Safe to re-run: tables use IF NOT EXISTS and seed rows use INSERT OR IGNORE.

CREATE TABLE IF NOT EXISTS branches (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS submissions (
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  date TEXT NOT NULL,
  knock REAL NOT NULL DEFAULT 0, talk REAL NOT NULL DEFAULT 0, walk REAL NOT NULL DEFAULT 0,
  contingency REAL NOT NULL DEFAULT 0, approved REAL NOT NULL DEFAULT 0, contracts REAL NOT NULL DEFAULT 0,
  revenue REAL NOT NULL DEFAULT 0, soft_sets REAL NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'form',
  submitted_at TEXT NOT NULL,
  PRIMARY KEY (branch_id, date)
);
CREATE TABLE IF NOT EXISTS submission_log (
  id INTEGER PRIMARY KEY,
  branch_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  payload TEXT NOT NULL,
  source TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS holidays (date TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS baselines (
  month TEXT PRIMARY KEY,
  through_date TEXT NOT NULL,
  knock REAL NOT NULL DEFAULT 0, talk REAL NOT NULL DEFAULT 0, walk REAL NOT NULL DEFAULT 0,
  contingency REAL NOT NULL DEFAULT 0, approved REAL NOT NULL DEFAULT 0, contracts REAL NOT NULL DEFAULT 0,
  revenue REAL NOT NULL DEFAULT 0, soft_sets REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS auth_failures (ip TEXT NOT NULL, at INTEGER NOT NULL);

-- Branch list from the accounting spreadsheet (rows 4-58), in sheet order.
INSERT OR IGNORE INTO branches (name, sort) VALUES
  ('Hendersonville', 0),
  ('Memphis', 1),
  ('Winston Salem', 2),
  ('Bowling Green', 3),
  ('Jacksonville', 4),
  ('Clarksville', 5),
  ('Chesapeake', 6),
  ('Richmond', 7),
  ('Birmingham', 8),
  ('Columbia', 9),
  ('Roanoke', 10),
  ('Evansville', 11),
  ('Hickory NC', 12),
  ('Augusta', 13),
  ('Rockhill', 14),
  ('Greenville NC', 15),
  ('Jackson MS', 16),
  ('Gainesville', 17),
  ('Asheville', 18),
  ('Vegas', 19),
  ('Savannah', 20),
  ('Marietta', 21),
  ('South Florida', 22),
  ('Hattiesburg', 23),
  ('Wilmington', 24),
  ('Louisville', 25),
  ('Knoxville', 26),
  ('Huntsville', 27),
  ('Lexington', 28),
  ('Tupelo', 29),
  ('Cookeville', 30),
  ('Athens', 31),
  ('Chattanooga', 32),
  ('Dayton', 33),
  ('Charleston', 34),
  ('Montgomery', 35),
  ('Fayetteville', 36),
  ('Tallahassee', 37),
  ('Murfreeboro', 38),
  ('Tri-Cities', 39),
  ('Dothan', 40),
  ('Shreveport', 41),
  ('Covington KY', 42),
  ('Fredericksburg', 43),
  ('Monroe', 44),
  ('Somerset', 45),
  ('Indianapolis', 46),
  ('Baton Rouge', 47),
  ('Lafayette', 48),
  ('Paducah', 49),
  ('Jackson TN', 50),
  ('Valdosta', 51),
  ('Waycross', 52),
  ('Thomasville', 53),
  ('Columbus GA', 54);

-- MTD as of the spreadsheet's last update (row 63, 10/03/26). Knock (B63) was a formula that
-- evaluated to 0 in the file, so it starts at 0 and can be corrected on the dashboard Setup tab.
INSERT OR IGNORE INTO baselines (month, through_date, knock, talk, walk, contingency, approved, contracts, revenue, soft_sets)
VALUES ('2026-10', '2026-10-03', 0, 4495, 504, 213, 31, 100, 1496511.86, 396);
