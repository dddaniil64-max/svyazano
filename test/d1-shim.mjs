/* Имитация Cloudflare D1 на встроенном SQLite Node.js — чтобы тестировать воркер локально без интернета */
import { DatabaseSync } from 'node:sqlite';
export function makeD1(file = ':memory:') {
  const db = new DatabaseSync(file);
  const wrap = (sql, params = []) => ({
    bind: (...p) => wrap(sql, p),
    _run() { const r = db.prepare(sql).run(...params); return { success: true, meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } }; },
    async run() { return this._run(); },
    async first(col) { const r = db.prepare(sql).get(...params); if (!r) return null; return col ? r[col] : { ...r }; },
    async all() { return { success: true, results: db.prepare(sql).all(...params).map(r => ({ ...r })) }; }
  });
  return { prepare: s => wrap(s), async batch(list) { const out = []; db.exec('BEGIN'); try { for (const s of list) out.push(s._run()); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } return out; }, _db: db };
}
