/* Автотест воркера: запускает его код напрямую с имитацией D1 и проверяет работу сайта, админки и защиты. Запуск: npm test */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import worker from '../src/index.js'; import { makeD1 } from './d1-shim.mjs';
const PUB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.txt': 'text/plain' };
const assets = { async fetch(req) { let p = new URL(req.url).pathname; if (p === '/') p = '/index.html'; if (p === '/admin') p = '/admin.html'; const f = path.join(PUB, p);
  if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return new Response(fs.readFileSync(path.join(PUB, 'index.html')), { headers: { 'Content-Type': 'text/html' } }); return new Response(fs.readFileSync(f), { headers: { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' } }); } };
const PW = 'Очень-длинный-пароль-12345', SECRET = 'x'.repeat(40);
const mkEnv = (extra = {}) => ({ DB: makeD1(), ASSETS: assets, ADMIN_LOGIN: 'owner', ADMIN_PASSWORD: PW, APP_SECRET: SECRET, ...extra });
let ok = 0, bad = 0; const t = (n, c) => { c ? ok++ : bad++; console.log((c ? '  ✓ ' : '  ✗ ') + n); };
function client(env) { let cookie = '';
  const call = async (p, o = {}) => { const h = { 'CF-Connecting-IP': o.ip || '203.0.113.7', ...(o.json ? { 'Content-Type': 'application/json' } : {}), ...(o.admin ? { 'X-Requested-With': 'fetch', Cookie: o.cookie ?? cookie } : {}), ...(o.headers || {}) };
    const res = await worker.fetch(new Request('https://shop.workers.dev' + p, { method: o.method || 'GET', headers: h, body: o.json ? JSON.stringify(o.json) : o.body }), env);
    const txt = await res.text(); let j = null; try { j = JSON.parse(txt); } catch {} return { s: res.status, j, txt, h: res.headers }; };
  call.login = async (pw = PW) => { const r = await call('/api/admin/login', { method: 'POST', admin: true, cookie: '', json: { login: 'owner', password: pw } }); const sc = r.h.get('set-cookie') || ''; if (r.s === 200) cookie = sc.split(';')[0]; return r; };
  call.setCookie = c => { cookie = c; }; return call; }
const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(80)]);
const early = () => Date.now() - 5000;

(async () => {
  const env = mkEnv(), c = client(env);
  console.log('Публичная часть');
  let r = await c('/'); t('главная страница отдаётся как статический файл', r.s === 200 && r.txt.includes('app.js'));
  r = await c('/api/toys'); t('каталог пуст, пока админ не опубликует игрушки (демо скрыты)', r.s === 200 && Array.isArray(r.j) && r.j.length === 0);
  t('защитные заголовки на ответах API', /default-src 'self'/.test(r.h.get('content-security-policy')) && r.h.get('x-frame-options') === 'DENY' && /max-age/.test(r.h.get('strict-transport-security')));
  r = await c('/api/site'); t('настройки сайта: по умолчанию персональные данные НЕ собираются', r.j.collectEmail === false);
  r = await c('/api/nope'); t('неизвестный адрес API → 404', r.s === 404);
  r = await c('/api/toys', { method: 'DELETE' }); t('неверный метод → 405', r.s === 405);
  r = await c('/img/zzz'); t('неверный адрес картинки → 404', r.s === 404);
  t('в ответах нет секретов', !JSON.stringify(r).includes(SECRET));

  console.log('Обращения (режим без сбора персональных данных)');
  r = await c('/api/tickets', { method: 'POST', json: { message: 'ab', ts: early() } }); t('короткое сообщение отклоняется', r.s === 400);
  r = await c('/api/tickets', { method: 'POST', json: { message: 'Мой телефон +7 900 123-45-67, перезвоните', ts: early() } }); t('телефон в тексте отклоняется (защита от сбора ПДн)', r.s === 400 && /личные данные/.test(r.j.error));
  r = await c('/api/tickets', { method: 'POST', json: { message: 'Пишите на anna@example.com', ts: early() } }); t('почта в тексте отклоняется', r.s === 400);
  r = await c('/api/tickets', { method: 'POST', json: { message: 'Есть ли зайка Ася в голубом цвете? Цены 2400 и 3000', ts: early(), name: 'Анна', email: 'anna@example.com', toyId: 1 } });
  const token = r.j && r.j.token; t('вопрос без личных данных принимается, выдан токен', r.s === 200 && /^[0-9a-f]{48}$/.test(token));
  r = await c('/api/tickets/' + token); t('клиент видит свою переписку и статус new', r.s === 200 && r.j.status === 'new' && r.j.messages.length === 1);
  r = await c('/api/tickets/' + 'f'.repeat(48)); t('чужой токен не открывается', r.s === 404);
  r = await c('/api/tickets', { method: 'POST', json: { message: 'Спам спам спам спам', ts: early(), website: 'http://spam' } }); t('бот (скрытое поле) «обманут»', r.s === 200);
  r = await c('/api/tickets', { method: 'POST', json: { message: 'Слишком быстрая отправка', ts: Date.now() } }); t('слишком быстрая отправка (<2 c) «обманута»', r.s === 200);
  r = await c('/api/tickets', { method: 'POST', json: { message: 'a'.repeat(30000), ts: early() } }); t('огромный запрос → 413', r.s === 413);
  r = await c('/api/tickets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' }); t('битый JSON → 400', r.s === 400);

  console.log('Вход администратора');
  r = await c('/api/admin/tickets'); t('без входа список обращений закрыт (401)', r.s === 401);
  r = await c('/api/admin/toys', { method: 'POST', json: { name: 'x', price: 1 } }); t('без входа добавить игрушку нельзя', r.s === 401);
  r = await c('/api/admin/login', { method: 'POST', json: { login: 'owner', password: PW } }); t('вход без служебного заголовка запрещён (CSRF)', r.s === 403);
  r = await c.login('неверный'); t('неверный пароль → 401', r.s === 401);
  r = await c.login(); const sc = r.h.get('set-cookie') || ''; t('верный пароль → вход, cookie __Host-, HttpOnly, Secure, SameSite=Strict', r.s === 200 && /^__Host-sid=[0-9a-f]{64}/.test(sc) && /HttpOnly/.test(sc) && /Secure/.test(sc) && /SameSite=Strict/.test(sc));
  r = await c('/api/admin/me', { admin: true }); t('сессия действует (/me)', r.j.auth === true);
  r = await c('/api/admin/tickets', { admin: true, cookie: '__Host-sid=' + 'a'.repeat(64) }); t('подделанная сессия отклоняется', r.s === 401);
  r = await c('/api/admin/tickets/1/close', { method: 'POST', cookie: undefined, json: {}, headers: { Cookie: sc.split(';')[0] } }); t('запрос без заголовка X-Requested-With отклоняется (CSRF)', r.s === 403);
  const env2 = mkEnv(), c2 = client(env2); for (let i = 0; i < 5; i++) await c2.login('плохой-пароль-' + i);
  r = await c2.login(); t('после 5 ошибок вход блокируется даже с верным паролем (429)', r.s === 429);
  const env3 = mkEnv({ ADMIN_PASSWORD: 'short' }), c3 = client(env3); r = await c3.login('short'); t('слишком короткий пароль в секретах → вход запрещён (503)', r.s === 503);
  const env4 = mkEnv({ APP_SECRET: undefined }), c4 = client(env4); r = await c4.login(); t('без APP_SECRET сайт сообщает, что не настроен (503), а не падает', r.s === 503);

  console.log('Работа с обращениями');
  r = await c('/api/admin/tickets', { admin: true }); const tid = r.j[0] && r.j[0].id; t('админ видит единственное настоящее обращение', r.s === 200 && r.j.length === 1);
  r = await c('/api/admin/tickets/' + tid, { admin: true }); t('в обращении нет имени и почты (не собирались)', r.j.name === 'Гость' && r.j.email === '' && r.j.consentAt === 0);
  r = await c('/api/admin/tickets/' + tid + '/reply', { method: 'POST', admin: true, json: { text: 'Здравствуйте! Голубая будет готова за 3 дня.' } }); t('админ отвечает', r.s === 200);
  r = await c('/api/tickets/' + token); t('клиент видит ответ, статус answered', r.j.status === 'answered' && r.j.messages.length === 2 && r.j.messages[1].from_admin === 1);
  r = await c('/api/tickets/' + token + '/messages', { method: 'POST', json: { message: 'Спасибо, беру!' } }); t('клиент может продолжить переписку', r.s === 200);
  r = await c('/api/tickets/' + token + '/messages', { method: 'POST', json: { message: 'Звоните 89001234567' } }); t('в продолжении переписки телефон тоже отклоняется', r.s === 400);
  r = await c('/api/admin/tickets/' + tid + '/close', { method: 'POST', admin: true, json: {} }); t('админ закрывает обращение', r.s === 200);

  console.log('Игрушки через интерфейс администратора');
  r = await c('/api/admin/toys', { admin: true }); t('админ видит 3 скрытые демо-игрушки', r.j.length === 3 && r.j.every(x => !x.published));
  const demo = r.j[0];
  r = await c('/api/admin/toys', { method: 'POST', admin: true, json: { name: '', price: 100 } }); t('игрушка без названия отклоняется', r.s === 400);
  r = await c('/api/admin/upload', { method: 'POST', admin: true, headers: { 'Content-Type': 'image/png' }, body: Buffer.from('<?php echo 1; ?>') }); t('файл не-картинка отклоняется (проверка по содержимому)', r.s === 415);
  r = await c('/api/admin/upload', { method: 'POST', admin: true, headers: { 'Content-Type': 'image/png' }, body: Buffer.concat([PNG, Buffer.alloc(1100 * 1024)]) }); t('слишком большое фото отклоняется (413)', r.s === 413);
  r = await c('/api/admin/upload', { method: 'POST', admin: true, headers: { 'Content-Type': 'image/png' }, body: PNG }); const img = r.j && r.j.url; t('фото загружается, имя случайное', r.s === 200 && /^\/img\/[0-9a-f]{32}$/.test(img));
  r = await c(img); t('фото открывается и отдаётся с верным типом и кэшем', r.s === 200 && r.h.get('content-type') === 'image/png' && /immutable/.test(r.h.get('cache-control')));
  r = await c('/api/admin/toys/' + demo.id, { method: 'PUT', admin: true, json: { ...demo, name: 'Зайка Ася (мой)', price: 2500, tags: 'подарок, малышам', image: img, published: true } }); t('админ редактирует и публикует игрушку', r.s === 200);
  r = await c('/api/toys'); t('игрушка сразу на сайте с фото, ценой и тегами', r.j.length === 1 && r.j[0].image === img && r.j[0].price === 2500 && r.j[0].tags.length === 2);
  r = await c('/api/admin/toys', { method: 'POST', admin: true, json: { name: 'Новая <b>игрушка</b>', price: '1500', desc: 'Описание', tags: 'новинка', emoji: '🐘', image: '/img/../../etc/passwd', published: true } }); const nid = r.j && r.j.id; t('админ добавляет новую игрушку', r.s === 200 && nid > 0);
  r = await c('/api/admin/toys', { method: 'POST', admin: true, json: { name: 'Игрушка без цены', desc: 'Цена уточняется', published: true } }); const noPriceId = r.j && r.j.id; t('игрушку можно сохранить без цены', r.s === 200 && noPriceId > 0);
  r = await c('/api/toys'); t('у игрушки без цены API возвращает null вместо нулевой цены', r.j.find(x => x.id === noPriceId)?.price === null);
  if (noPriceId) await c('/api/admin/toys/' + noPriceId, { method: 'DELETE', admin: true });
  r = await c('/api/toys'); t('поддельный путь к картинке отброшен', r.j.find(x => x.id === nid).image === '');
  r = await c('/api/admin/toys/' + demo.id, { method: 'PUT', admin: true, json: { ...demo, name: 'Зайка', image: '', images: [], price: 2500, published: false } }); r = await c(img); t('при замене/удалении фото старый файл удаляется из базы', r.s === 404);
  r = await c('/api/toys'); t('скрытая игрушка пропадает с сайта', r.j.length === 1 && r.j[0].id === nid);
  r = await c('/api/admin/toys/' + nid, { method: 'DELETE', admin: true }); t('админ удаляет игрушку', r.s === 200);

  console.log('Контакты, продавец и параметры (через интерфейс)');
  r = await c('/api/admin/settings', { admin: true }); const S = r.j;
  const put = patch => c('/api/admin/settings', { method: 'PUT', admin: true, json: { ...S, ...patch } });
  r = await put({ contacts: { ...S.contacts, vk: 'http://evil.example' } }); t('небезопасная ссылка VK отклоняется', r.s === 400);
  r = await put({ contacts: { ...S.contacts, telegram: 'a b<script>' } }); t('некорректный Telegram отклоняется', r.s === 400);
  r = await put({ seller: { ...S.seller, inn: '123' } }); t('неверный ИНН отклоняется', r.s === 400);
  r = await put({ contacts: { ...S.contacts, phone: '+7 900 000-00-00', email: 'shop@example.com', telegram: '@my_shop', vk: 'https://vk.com/my_shop', address: 'Москва' }, seller: { status: 'самозанятый (НПД)', name: 'Иванова Мария Ивановна', inn: '123456789012', ogrn: '', address: '', email: 'shop@example.com', phone: '' }, terms: { text: 'Оплата при получении.' } });
  t('админ сохраняет контакты и данные продавца', r.s === 200);
  r = await c('/api/site'); t('контакты и продавец сразу видны на сайте', r.j.contacts.telegram === 'my_shop' && r.j.contacts.vk === 'https://vk.com/my_shop' && r.j.seller.inn === '123456789012' && r.j.terms === 'Оплата при получении.');

  console.log('Режим со сбором почты (включается админом сознательно)');
  r = await put({ options: { collectEmail: true, retentionDays: 30 } }); t('админ включает сбор контактов', r.s === 200);
  r = await c('/api/tickets', { method: 'POST', json: { message: 'Хочу заказать зайку', ts: early(), name: 'Анна', email: 'anna@example.com' } }); t('без согласия обращение не принимается', r.s === 400 && /согласие/.test(r.j.error));
  r = await c('/api/tickets', { method: 'POST', json: { message: 'Хочу заказать зайку', ts: early(), name: 'Анна', email: 'плохая', consent: true } }); t('неверная почта отклоняется', r.s === 400);
  r = await c('/api/tickets', { method: 'POST', json: { message: 'Хочу заказать зайку', ts: early(), name: 'Анна', email: 'anna@example.com', consent: true } }); t('с согласием обращение принимается', r.s === 200);
  r = await c('/api/admin/tickets', { admin: true }); const t2 = r.j.find(x => x.name === 'Анна'); r = await c('/api/admin/tickets/' + t2.id, { admin: true });
  t('админ видит расшифрованную почту и дату согласия', r.j.email === 'anna@example.com' && r.j.consentAt > 0);
  const raw = (await env.DB.prepare('SELECT email_enc FROM tickets WHERE name=?').bind('Анна').first()).email_enc; t('почта в базе зашифрована (нет открытого текста)', raw && !raw.includes('anna') && !raw.includes('@'));

  console.log('Автоудаление и выход');
  env.DB._db.exec("UPDATE tickets SET updated_at=1000 WHERE id=" + t2.id);
  r = await c('/api/admin/tickets-purge', { method: 'POST', admin: true, json: { days: 30 } }); r = await c('/api/admin/tickets', { admin: true }); t('устаревшие обращения удаляются', !r.j.find(x => x.id === t2.id));
  const before = JSON.stringify((await env.DB.prepare('SELECT * FROM rl').all()).results); t('в счётчиках нет IP-адресов (только хеши)', !before.includes('203.0.113.7'));
  r = await c('/api/admin/logout', { method: 'POST', admin: true, json: {} }); r = await c('/api/admin/tickets', { admin: true }); t('после выхода сессия недействительна на сервере', r.s === 401);
  console.log(`\nИтого: ${ok} успешно, ${bad} с ошибками`); process.exit(bad ? 1 : 0);
})();
