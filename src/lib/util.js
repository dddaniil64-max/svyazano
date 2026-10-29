/* Общие утилиты: ответы, ошибки, проверка данных, чтение тела запроса */
export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
export const err = (status, message) => new HttpError(status, message);

export const SEC = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; object-src 'none'; base-uri 'self'",
  'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Resource-Policy': 'same-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
};
export const json = (obj, status = 200, headers = {}) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });

export const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
export const line = (s, max) => clean(s, max).replace(/\s+/g, ' ');
export const okMail = s => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(s);
/* Защита от случайной передачи персональных данных в тексте сообщения (почта, телефон) */
export const looksLikePD = t => /[^\s@]+@[^\s@]+\.[a-zа-я]{2,}/i.test(t) || /(?:\+7|\b8)[\s(.-]*\d{3}[\s).-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}/.test(t) || /\d{10,}/.test(t);
export const PD_MSG = 'Пожалуйста, не указывайте в сообщении телефон, почту и другие личные данные. Для личной связи используйте контакты на странице «Контакты».';

export async function readBody(request, limit) {
  const len = Number(request.headers.get('content-length')); if (len > limit) throw err(413, 'Слишком большой запрос');
  const reader = request.body && request.body.getReader(); if (!reader) return new Uint8Array(0);
  const chunks = []; let n = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; n += value.length; if (n > limit) { reader.cancel(); throw err(413, 'Слишком большой запрос'); } chunks.push(value); }
  const out = new Uint8Array(n); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; } return out;
}
export async function readJson(request, limit = 20000) {
  const buf = await readBody(request, limit); if (!buf.length) return {};
  if (!/^application\/json/i.test(request.headers.get('content-type') || '')) throw err(415, 'Нужен JSON');
  try { const v = JSON.parse(new TextDecoder().decode(buf)); return v && typeof v === 'object' ? v : {}; } catch { throw err(400, 'Неверный JSON'); }
}
/* Тип картинки определяем по содержимому файла, а не по имени */
export const sniff = b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff ? 'image/jpeg' : (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) ? 'image/png'
  : (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) ? 'image/webp' : null;
export function b64encode(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)); return btoa(s); }
export function b64decode(str) { const bin = atob(str), out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
