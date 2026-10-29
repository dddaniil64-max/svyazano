import { json, err, readJson, readBody, clean, sniff, b64encode } from '../lib/util.js';
import { randomHex, sha256, safeEq, decrypt } from '../lib/crypto.js';
import { getSettings, ipKey, hit, rlCount, rlReset, purge } from '../lib/db.js';
import { toyOut, toyIn, imageId, contactsIn, sellerIn, optionsIn, termsIn } from '../lib/validate.js';

const COOKIE = '__Host-sid';
const readCookie = req => { const m = new RegExp('(?:^|;\\s*)' + COOKIE + '=([a-f0-9]{64})').exec(req.headers.get('Cookie') || ''); return m ? m[1] : null; };
async function isAdmin(req, env) { const t = readCookie(req); if (!t) return false; return !!(await env.DB.prepare('SELECT id FROM sessions WHERE id=? AND exp>?').bind(await sha256(t), Date.now()).first()); }
/* Защита всех админских запросов: действующая сессия + защита от CSRF (SameSite=Strict + обязательный свой заголовок) */
async function guard(req, env) {
  if (!(await isAdmin(req, env))) throw err(401, 'Требуется вход');
  if (req.method !== 'GET' && req.headers.get('X-Requested-With') !== 'fetch') throw err(403, 'Запрещено');
}
const A = fn => async (req, env, p) => { await guard(req, env); return fn(req, env, p); };
const delImage = (env, url) => { const id = imageId(url); return id ? env.DB.prepare('DELETE FROM images WHERE id=?').bind(id).run() : null; };
const ok = () => json({ ok: true });

export default [
  ['POST', '/api/admin/login', async (req, env) => {
    if (req.headers.get('X-Requested-With') !== 'fetch') throw err(403, 'Запрещено');
    const b = await readJson(req), ip = await ipKey(req, env);
    if (!env.ADMIN_LOGIN || !env.ADMIN_PASSWORD) throw err(503, 'Не заданы секреты ADMIN_LOGIN и ADMIN_PASSWORD (см. инструкцию)');
    if (env.ADMIN_PASSWORD.length < 14) throw err(503, 'Пароль администратора слишком короткий: нужно не менее 14 символов');
    if ((await rlCount(env, 'l:' + ip)) >= 5 || (await rlCount(env, 'l:all')) >= 40) throw err(429, 'Слишком много попыток. Подождите 15 минут.');
    const okL = await safeEq(String(b.login || ''), env.ADMIN_LOGIN), okP = await safeEq(String(b.password || ''), env.ADMIN_PASSWORD);
    if (!(okL && okP)) { await hit(env, 'l:' + ip, 15 * 60e3, 5); await hit(env, 'l:all', 3600e3, 40); throw err(401, 'Неверный логин или пароль'); }
    await rlReset(env, 'l:' + ip);
    const token = randomHex(32);
    await env.DB.prepare('INSERT INTO sessions(id,exp) VALUES(?,?)').bind(await sha256(token), Date.now() + 8 * 3600e3).run();
    return json({ ok: true }, 200, { 'Set-Cookie': `${COOKIE}=${token}; Max-Age=28800; Path=/; HttpOnly; Secure; SameSite=Strict` });
  }],
  ['POST', '/api/admin/logout', async (req, env) => { const t = readCookie(req); if (t) await env.DB.prepare('DELETE FROM sessions WHERE id=?').bind(await sha256(t)).run(); return json({ ok: true }, 200, { 'Set-Cookie': `${COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict` }); }],
  ['GET', '/api/admin/me', async (req, env) => json({ auth: await isAdmin(req, env) })],

  /* ---- Диагностика и журнал ошибок ---- */
  ['GET', '/api/admin/health', A(async (req, env) => { const [toys,images,tickets,logs] = await Promise.all(['toys','images','tickets','system_logs'].map(t=>env.DB.prepare('SELECT COUNT(*) AS n FROM '+t).first())); const recent = await env.DB.prepare('SELECT level,area,message,created_at FROM system_logs ORDER BY id DESC LIMIT 100').all(); return json({checkedAt:Date.now(),counts:{toys:toys.n,images:images.n,tickets:tickets.n},logs:recent.results,config:{appSecret:!!env.APP_SECRET&&env.APP_SECRET.length>=32,admin:!!env.ADMIN_LOGIN&&!!env.ADMIN_PASSWORD&&env.ADMIN_PASSWORD.length>=14,db:!!env.DB}}); })],

  /* ---- Обращения ---- */
  ['GET', '/api/admin/tickets', A(async (req, env) => json((await env.DB.prepare(`SELECT t.id,t.name,t.status,t.toy_id,t.updated_at,(SELECT text FROM messages WHERE ticket_id=t.id ORDER BY id DESC LIMIT 1) AS last FROM tickets t ORDER BY (t.status='new') DESC, t.updated_at DESC LIMIT 200`).all()).results))],
  ['GET', '/api/admin/tickets/:id', A(async (req, env, p) => {
    const t = await env.DB.prepare('SELECT * FROM tickets WHERE id=?').bind(+p.id).first(); if (!t) throw err(404, 'Не найдено');
    return json({ id: t.id, name: t.name, email: await decrypt(env.APP_SECRET, t.email_enc), consentAt: t.consent_at, toyId: t.toy_id, status: t.status, messages: (await env.DB.prepare('SELECT from_admin,text,created_at FROM messages WHERE ticket_id=? ORDER BY id').bind(t.id).all()).results });
  })],
  ['POST', '/api/admin/tickets/:id/reply', A(async (req, env, p) => {
    const b = await readJson(req), text = clean(b.text, 3000), t = await env.DB.prepare('SELECT id FROM tickets WHERE id=?').bind(+p.id).first();
    if (!t || text.length < 2) throw err(400, 'Ошибка'); const now = Date.now();
    await env.DB.batch([env.DB.prepare('INSERT INTO messages(ticket_id,from_admin,text,created_at) VALUES(?,?,?,?)').bind(t.id, 1, text, now), env.DB.prepare("UPDATE tickets SET status='answered', updated_at=? WHERE id=?").bind(now, t.id)]);
    return ok();
  })],
  ['POST', '/api/admin/tickets/:id/close', A(async (req, env, p) => { await env.DB.prepare("UPDATE tickets SET status='closed', updated_at=? WHERE id=?").bind(Date.now(), +p.id).run(); return ok(); })],
  ['DELETE', '/api/admin/tickets/:id', A(async (req, env, p) => { await env.DB.batch([env.DB.prepare('DELETE FROM messages WHERE ticket_id=?').bind(+p.id), env.DB.prepare('DELETE FROM tickets WHERE id=?').bind(+p.id)]); return ok(); })],
  ['POST', '/api/admin/tickets-purge', A(async (req, env) => { const b = await readJson(req); await purge(env, Math.min(730, Math.max(1, Math.round(Number(b.days)) || 180))); return ok(); })],

  /* ---- Игрушки ---- */
  ['GET', '/api/admin/toys', A(async (req, env) => json((await env.DB.prepare('SELECT * FROM toys ORDER BY id DESC').all()).results.map(toyOut)))],
  ['POST', '/api/admin/toys', A(async (req, env) => {
    const t = toyIn(await readJson(req));
    const r = await env.DB.prepare('INSERT INTO toys(name,emoji,image,images,price,size,time,material,desc,tags,published,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(t.name, t.emoji, t.image, t.images, t.price, t.size, t.time, t.material, t.desc, t.tags, t.published, Date.now()).run();
    return json({ id: r.meta.last_row_id });
  })],
  ['PUT', '/api/admin/toys/:id', A(async (req, env, p) => {
    const old = await env.DB.prepare('SELECT image,images FROM toys WHERE id=?').bind(+p.id).first(); if (!old) throw err(404, 'Не найдено');
    const t = toyIn(await readJson(req));
    await env.DB.prepare('UPDATE toys SET name=?,emoji=?,image=?,images=?,price=?,size=?,time=?,material=?,desc=?,tags=?,published=? WHERE id=?').bind(t.name, t.emoji, t.image, t.images, t.price, t.size, t.time, t.material, t.desc, t.tags, t.published, +p.id).run();
    const keep = new Set(JSON.parse(t.images || '[]')); for (const u of [...new Set([old.image, ...JSON.parse(old.images || '[]')])]) if (u && !keep.has(u)) await delImage(env, u); return ok();
  })],
  ['DELETE', '/api/admin/toys/:id', A(async (req, env, p) => { const old = await env.DB.prepare('SELECT image,images FROM toys WHERE id=?').bind(+p.id).first(); await env.DB.prepare('DELETE FROM toys WHERE id=?').bind(+p.id).run(); if (old) for (const u of [...new Set([old.image, ...JSON.parse(old.images || '[]')])]) if (u) await delImage(env, u); return ok(); })],
  /* Фото хранится в базе (до ~450 КБ после автоматического сжатия в браузере); тип проверяется по содержимому */
  ['POST', '/api/admin/upload', A(async (req, env) => {
    const buf = await readBody(req, 1024 * 1024), mime = sniff(buf); if (!mime) throw err(415, 'Допустимы только JPG, PNG, WEBP');
    const id = randomHex(16);
    await env.DB.prepare('INSERT INTO images(id,mime,data,created_at) VALUES(?,?,?,?)').bind(id, mime, b64encode(buf), Date.now()).run();
    return json({ url: '/img/' + id });
  })],

  /* ---- Настройки: контакты, данные продавца, параметры, условия заказа ---- */
  ['GET', '/api/admin/settings', A(async (req, env) => json(await getSettings(env)))],
  ['PUT', '/api/admin/settings', A(async (req, env) => {
    const b = await readJson(req, 30000);
    const c = contactsIn(b.contacts), s = sellerIn(b.seller), o = optionsIn(b.options), t = termsIn(b.terms);
    await env.DB.batch([['contacts', c], ['seller', s], ['options', o], ['terms', t]].map(([k, v]) => env.DB.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(k, JSON.stringify(v))));
    return ok();
  })]
];
