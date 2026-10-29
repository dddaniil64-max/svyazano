/* База данных D1 (SQLite): таблицы создаются автоматически при первом обращении */
import { hmac } from './crypto.js';
import { err } from './util.js';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS toys(id INTEGER PRIMARY KEY, name TEXT NOT NULL, emoji TEXT DEFAULT '🧸', image TEXT DEFAULT '', images TEXT DEFAULT '[]', price INTEGER NOT NULL DEFAULT 0, size TEXT DEFAULT '', time TEXT DEFAULT '', material TEXT DEFAULT '', desc TEXT DEFAULT '', tags TEXT DEFAULT '[]', published INTEGER DEFAULT 1, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS images(id TEXT PRIMARY KEY, mime TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS tickets(id INTEGER PRIMARY KEY, token TEXT UNIQUE NOT NULL, name TEXT NOT NULL, email_enc TEXT DEFAULT '', toy_id INTEGER DEFAULT 0, status TEXT DEFAULT 'new', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, consent_at INTEGER DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY, ticket_id INTEGER NOT NULL, from_admin INTEGER NOT NULL, text TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_msg_ticket ON messages(ticket_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tickets_upd ON tickets(updated_at)`,
  `CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, exp INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS rl(k TEXT PRIMARY KEY, n INTEGER NOT NULL, reset INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY, order_no TEXT UNIQUE NOT NULL, customer_name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT DEFAULT '', address TEXT DEFAULT '', comment TEXT DEFAULT '', items TEXT NOT NULL, total INTEGER NOT NULL, status TEXT DEFAULT 'new', consent_at INTEGER DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_upd ON orders(updated_at)`,
  `CREATE TABLE IF NOT EXISTS system_logs(id INTEGER PRIMARY KEY, level TEXT NOT NULL, area TEXT NOT NULL, message TEXT NOT NULL, created_at INTEGER NOT NULL)`
];
const DEMO = [
  ['Зайка Ася', '🐰', 2400, '28 см', '3 дня', 'Плюшевая пряжа, хлопок', 'Нежный зайка в белом комбинезоне. Глаза вышиты, наполнитель гипоаллергенный.', ['подарок']],
  ['Мишка Бублик', '🧸', 2900, '32 см', '4 дня', 'Хлопок, акрил', 'Мягкий медвежонок с бантиком, подвижные лапки.', ['классика']],
  ['Лисичка Рыжик', '🦊', 2600, '25 см', '3 дня', 'Хлопок', 'Озорная лисичка с пушистым хвостом.', ['подарок']]
];
const ready = new WeakSet();
const schemaInFlight = new WeakMap();
export async function ensureSchema(env) {
  if (!env.DB) throw err(503, 'Не подключена база данных D1 (см. инструкцию по запуску)');
  if (ready.has(env.DB)) return;
  const running = schemaInFlight.get(env.DB);
  if (running) return running;
  const init = (async () => {
  await env.DB.batch(SCHEMA.map(s => env.DB.prepare(s)));
  const cols = (await env.DB.prepare('PRAGMA table_info(toys)').all()).results.map(x => x.name);
  if (!cols.includes('images')) await env.DB.prepare("ALTER TABLE toys ADD COLUMN images TEXT NOT NULL DEFAULT '[]'").run();
  const orderCols = (await env.DB.prepare('PRAGMA table_info(orders)').all()).results.map(x => x.name);
  if (orderCols.length && !orderCols.includes('consent_at')) await env.DB.prepare('ALTER TABLE orders ADD COLUMN consent_at INTEGER NOT NULL DEFAULT 0').run();
  /* Демо-игрушки создаются один раз и СКРЫТЫ от посетителей: отредактируйте и опубликуйте или удалите их в админке.
     Маркер записывается атомарно до добавления демо-данных: параллельные первые запросы не конфликтуют по settings.key. */
  const seedMarker = await env.DB.prepare("INSERT OR IGNORE INTO settings(key,value) VALUES('seeded','1')").run();
  if (seedMarker.meta?.changes) {
    await env.DB.batch(DEMO.map(d => env.DB.prepare('INSERT INTO toys(name,emoji,price,size,time,material,desc,tags,published,created_at) VALUES(?,?,?,?,?,?,?,?,0,?)').bind(d[0], d[1], d[2], d[3], d[4], d[5], d[6], JSON.stringify(d[7]), Date.now())));
  }
  ready.add(env.DB);
  })();
  schemaInFlight.set(env.DB, init);
  try {
    await init;
  } catch (e) {
    schemaInFlight.delete(env.DB);
    throw e;
  }
}

export const DEFAULTS = {
  contacts: { phone: '', email: '', telegram: '', max: '', vk: '', address: '', hours: 'Ежедневно, 10:00–20:00', note: 'Отвечаем в течение дня' },
  seller: { status: '', name: '', inn: '', ogrn: '', address: '', email: '', phone: '' },
  options: { collectEmail: false, retentionDays: 180 },
  terms: { text: '' }
};
export async function getSettings(env) {
  const out = JSON.parse(JSON.stringify(DEFAULTS));
  const { results } = await env.DB.prepare('SELECT key,value FROM settings').all();
  for (const r of results) if (DEFAULTS[r.key]) out[r.key] = { ...DEFAULTS[r.key], ...JSON.parse(r.value) };
  return out;
}

/* Ограничение частоты запросов (счётчики в D1). IP хранится только в виде необратимого хеша */
export async function ipKey(request, env) {
  if (!env.APP_SECRET || env.APP_SECRET.length < 32) throw err(503, 'Сайт ещё не настроен: добавьте секрет APP_SECRET (см. инструкцию)');
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  return (await hmac(env.APP_SECRET, ip + '|' + new Date().toISOString().slice(0, 10))).slice(0, 24);
}
export async function hit(env, key, windowMs, limit) { const now = Date.now();
  const n = await env.DB.prepare('INSERT INTO rl(k,n,reset) VALUES(?,1,?) ON CONFLICT(k) DO UPDATE SET n=CASE WHEN reset<? THEN 1 ELSE n+1 END, reset=CASE WHEN reset<? THEN ? ELSE reset END RETURNING n').bind(key, now + windowMs, now, now, now + windowMs).first('n');
  return n > limit; }
export async function rlCount(env, key) { const r = await env.DB.prepare('SELECT n,reset FROM rl WHERE k=?').bind(key).first(); return r && r.reset > Date.now() ? r.n : 0; }
export const rlReset = (env, key) => env.DB.prepare('DELETE FROM rl WHERE k=?').bind(key).run();

/* Удаление устаревших данных (вызывается при новых обращениях и кнопкой в админке) */
export async function purge(env, days) {
  const cut = Date.now() - days * 86400e3, now = Date.now();
  await env.DB.batch([env.DB.prepare('DELETE FROM messages WHERE ticket_id IN (SELECT id FROM tickets WHERE updated_at<?)').bind(cut), env.DB.prepare('DELETE FROM tickets WHERE updated_at<?').bind(cut),
    env.DB.prepare('DELETE FROM rl WHERE reset<?').bind(now), env.DB.prepare('DELETE FROM sessions WHERE exp<?').bind(now)]);
}
