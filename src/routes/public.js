import { json, err, readJson, clean, line, okMail, looksLikePD, PD_MSG, b64decode } from '../lib/util.js';
import { randomHex, encrypt } from '../lib/crypto.js';
import { getSettings, ipKey, hit, purge } from '../lib/db.js';
import { toyOut } from '../lib/validate.js';

const byToken = (env, t) => env.DB.prepare('SELECT id,status FROM tickets WHERE token=?').bind(String(t).slice(0, 64)).first();
const msgs = async (env, id) => (await env.DB.prepare('SELECT from_admin,text,created_at FROM messages WHERE ticket_id=? ORDER BY id').bind(id).all()).results;

export default [
  ['GET', '/api/toys', async (req, env) => json((await env.DB.prepare('SELECT * FROM toys WHERE published=1 ORDER BY id').all()).results.map(toyOut), 200, { 'Cache-Control': 'public, max-age=20' })],
  ['GET', '/api/site', async (req, env) => { const s = await getSettings(env); return json({ contacts: s.contacts, seller: s.seller, terms: s.terms.text, collectEmail: s.options.collectEmail, retentionDays: s.options.retentionDays }, 200, { 'Cache-Control': 'public, max-age=20' }); }],
  ['POST', '/api/tickets', async (req, env) => {
    const b = await readJson(req), S = await getSettings(env);
    // ловушки для ботов: скрытое поле и слишком быстрая отправка (<2 с) — делаем вид, что приняли
    if (b.website || !(Date.now() - Number(b.ts) >= 2000)) return json({ token: randomHex(24) });
    if (await hit(env, 't:' + await ipKey(req, env), 3600e3, 8)) throw err(429, 'Слишком много обращений. Попробуйте позже.');
    const text = clean(b.message, 1500); if (text.length < 5) throw err(400, 'Сообщение слишком короткое');
    let name = 'Гость', email = '', consent = 0;
    if (S.options.collectEmail) { // режим со сбором контактов: нужно отдельное согласие
      if (b.consent !== true) throw err(400, 'Нужно согласие на обработку персональных данных');
      name = line(b.name, 60) || 'Гость'; email = line(b.email, 254); if (email && !okMail(email)) throw err(400, 'Проверьте адрес почты'); consent = Date.now();
    } else if (looksLikePD(text)) throw err(400, PD_MSG);
    const now = Date.now(), token = randomHex(24);
    const r = await env.DB.prepare('INSERT INTO tickets(token,name,email_enc,toy_id,created_at,updated_at,consent_at) VALUES(?,?,?,?,?,?,?)').bind(token, name, await encrypt(env.APP_SECRET, email), Math.max(0, parseInt(b.toyId) || 0), now, now, consent).run();
    await env.DB.prepare('INSERT INTO messages(ticket_id,from_admin,text,created_at) VALUES(?,?,?,?)').bind(r.meta.last_row_id, 0, text, now).run();
    await purge(env, S.options.retentionDays);
    return json({ token });
  }],
  ['GET', '/api/tickets/:token', async (req, env, p) => { const t = await byToken(env, p.token); if (!t) throw err(404, 'Не найдено'); return json({ status: t.status, messages: await msgs(env, t.id) }); }],
  ['POST', '/api/tickets/:token/messages', async (req, env, p) => {
    const b = await readJson(req), S = await getSettings(env), t = await byToken(env, p.token), text = clean(b.message, 1500);
    if (!t || text.length < 2) throw err(400, 'Ошибка');
    if (await hit(env, 'm:' + await ipKey(req, env), 3600e3, 30)) throw err(429, 'Слишком много сообщений. Попробуйте позже.');
    if (!S.options.collectEmail && looksLikePD(text)) throw err(400, PD_MSG);
    await env.DB.batch([env.DB.prepare('INSERT INTO messages(ticket_id,from_admin,text,created_at) VALUES(?,?,?,?)').bind(t.id, 0, text, Date.now()), env.DB.prepare("UPDATE tickets SET status='new', updated_at=? WHERE id=?").bind(Date.now(), t.id)]);
    return json({ ok: true });
  }],
  ['GET', '/img/:id', async (req, env, p) => {
    if (!/^[a-f0-9]{32}$/.test(p.id)) throw err(404, 'Не найдено');
    const r = await env.DB.prepare('SELECT mime,data FROM images WHERE id=?').bind(p.id).first(); if (!r) throw err(404, 'Не найдено');
    return new Response(b64decode(r.data), { headers: { 'Content-Type': r.mime, 'Cache-Control': 'public, max-age=31536000, immutable', 'Content-Security-Policy': "default-src 'none'", 'X-Content-Type-Options': 'nosniff' } });
  }]
];
