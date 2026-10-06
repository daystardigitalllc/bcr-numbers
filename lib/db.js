const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { METRICS } = require('./calc');

// Branch list from the accounting spreadsheet (rows 4-58), in sheet order.
const SEED_BRANCHES = [
  'Hendersonville', 'Memphis', 'Winston Salem', 'Bowling Green', 'Jacksonville', 'Clarksville',
  'Chesapeake', 'Richmond', 'Birmingham', 'Columbia', 'Roanoke', 'Evansville', 'Hickory NC',
  'Augusta', 'Rockhill', 'Greenville NC', 'Jackson MS', 'Gainesville', 'Asheville', 'Vegas',
  'Savannah', 'Marietta', 'South Florida', 'Hattiesburg', 'Wilmington', 'Louisville', 'Knoxville',
  'Huntsville', 'Lexington', 'Tupelo', 'Cookeville', 'Athens', 'Chattanooga', 'Dayton',
  'Charleston', 'Montgomery', 'Fayetteville', 'Tallahassee', 'Murfreeboro', 'Tri-Cities',
  'Dothan', 'Shreveport', 'Covington KY', 'Fredericksburg', 'Monroe', 'Somerset', 'Indianapolis',
  'Baton Rouge', 'Lafayette', 'Paducah', 'Jackson TN', 'Valdosta', 'Waycross', 'Thomasville',
  'Columbus GA',
];

// MTD as of the spreadsheet's last update (row 63, 10/03/26). Knock (B63) was a formula that
// evaluated to 0 in the file, so it starts at 0 and can be corrected in Setup.
const SEED_BASELINE = {
  month: '2026-10', through_date: '2026-10-03',
  knock: 0, talk: 4495, walk: 504, contingency: 213, approved: 31, contracts: 100, revenue: 1496511.86, soft_sets: 396,
};

function open(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS branches (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      sort INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS submissions (
      branch_id INTEGER NOT NULL REFERENCES branches(id),
      date TEXT NOT NULL,
      ${METRICS.map((m) => `${m} REAL NOT NULL DEFAULT 0`).join(',\n      ')},
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
      ${METRICS.map((m) => `${m} REAL NOT NULL DEFAULT 0`).join(',\n      ')}
    );
  `);
  if (db.prepare('SELECT COUNT(*) AS n FROM branches').get().n === 0) {
    const ins = db.prepare('INSERT INTO branches (name, sort) VALUES (?, ?)');
    SEED_BRANCHES.forEach((n, i) => ins.run(n, i));
    const b = SEED_BASELINE;
    db.prepare(`INSERT INTO baselines (month, through_date, ${METRICS.join(',')}) VALUES (?, ?, ${METRICS.map(() => '?').join(',')})`)
      .run(b.month, b.through_date, ...METRICS.map((m) => b[m]));
  }
  return db;
}

module.exports = { open };
