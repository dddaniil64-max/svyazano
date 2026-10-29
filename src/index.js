/* Точка входа Cloudflare Worker: API (/api/*) и картинки (/img/*). Остальное отдаёт платформа как статические файлы. */
import { SEC, HttpError, json } from './lib/util.js';
import { ensureSchema } from './lib/db.js';
import publicRoutes from './routes/public.js';
import adminRoutes from './routes/admin.js';

const routes = [...publicRoutes, ...adminRoutes].map(([method, pattern, fn]) => ({ method, fn, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$') }));

export default {
  async fetch(request, env) {
    let res;
    try {
      const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
      if (!path.startsWith('/api/') && !path.startsWith('/img/')) res = await env.ASSETS.fetch(request);
      else {
        let known = false, hit = null;
        for (const r of routes) { const m = r.re.exec(path); if (!m) continue; known = true; if (r.method === request.method) { hit = [r, m.groups || {}]; break; } }
        if (!hit) res = json({ error: 'Не найдено' }, known ? 405 : 404);
        else { await ensureSchema(env); res = await hit[0].fn(request, env, hit[1]); }
      }
    } catch (e) {
      if (e instanceof HttpError) res = json({ error: e.message }, e.status);
      else { console.error(e && e.stack || e); try { if (env.DB) { await env.DB.prepare('INSERT INTO system_logs(level,area,message,created_at) VALUES(?,?,?,?)').bind('error', new URL(request.url).pathname.slice(0,120), String(e && e.message || e).slice(0,1000), Date.now()).run(); } } catch {} res = json({ error: 'Ошибка сервера. Подробности доступны администратору на странице «Статус».' }, 500); }
    }
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(SEC)) if (!out.headers.has(k)) out.headers.set(k, v);
    return out;
  }
};
