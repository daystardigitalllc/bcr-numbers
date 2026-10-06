// Minimal D1-compatible wrapper over node:sqlite so tests run the real schema.sql and service queries.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

export function createD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const stmt = (sql, args = []) => {
    const st = db.prepare(sql);
    return {
      bind: (...a) => stmt(sql, a),
      first: async () => st.get(...args) ?? null,
      all: async () => ({ results: st.all(...args) }),
      run: async () => ({ meta: { changes: st.run(...args).changes } }),
      _run: () => st.run(...args),
    };
  };
  return {
    prepare: (sql) => stmt(sql),
    async batch(stmts) {
      db.exec('BEGIN');
      try { for (const s of stmts) s._run(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}
