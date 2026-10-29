/* Локальный сервер для просмотра сайта в браузере БЕЗ Cloudflare (для проверок). Обычный запуск — `npm run dev` (wrangler). */
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import worker from '../src/index.js'; import { makeD1 } from './d1-shim.mjs';
const PUB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.txt': 'text/plain' };
const assets = { async fetch(req) { let p = new URL(req.url).pathname; if (p === '/') p = '/index.html'; if (p === '/admin') p = '/admin.html'; const f = path.join(PUB, p);
  if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return new Response(fs.readFileSync(path.join(PUB, 'index.html')), { headers: { 'Content-Type': 'text/html' } });
  return new Response(fs.readFileSync(f), { headers: { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' } }); } };
const env = { DB: makeD1(), ASSETS: assets, ADMIN_LOGIN: 'owner', ADMIN_PASSWORD: 'Очень-длинный-пароль-12345', APP_SECRET: 'x'.repeat(40) };
http.createServer(async (rq, rs) => {
  const chunks = []; for await (const c of rq) chunks.push(c); const body = Buffer.concat(chunks);
  const headers = new Headers(); for (const [k, v] of Object.entries(rq.headers)) headers.set(k, Array.isArray(v) ? v.join(',') : v); headers.set('CF-Connecting-IP', '203.0.113.9');
  const res = await worker.fetch(new Request('http://localhost:' + process.env.PORT + rq.url, { method: rq.method, headers, body: ['GET', 'HEAD'].includes(rq.method) ? undefined : body }), env);
  const h = {}; res.headers.forEach((v, k) => { if (k !== 'set-cookie') h[k] = v; }); const sc = res.headers.getSetCookie?.() || []; if (sc.length) h['set-cookie'] = sc;
  rs.writeHead(res.status, h); rs.end(Buffer.from(await res.arrayBuffer()));
}).listen(+process.env.PORT || 8787, () => console.log('ready'));
