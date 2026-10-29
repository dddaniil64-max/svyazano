/* Криптография на Web Crypto (доступна в Workers): хеши, HMAC, сравнение без утечки времени, AES-256-GCM */
import { b64encode, b64decode } from './util.js';
const enc = new TextEncoder();
export const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
export const randomHex = n => hex(crypto.getRandomValues(new Uint8Array(n)));
export const sha256 = async s => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
export async function hmac(secret, msg) { const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return hex(await crypto.subtle.sign('HMAC', k, enc.encode(msg))); }
export async function safeEq(a, b) { const x = await sha256('eq|' + a), y = await sha256('eq|' + b); let d = 0; for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i); return d === 0; }
const aesKey = async secret => crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', enc.encode('enc|' + secret)), 'AES-GCM', false, ['encrypt', 'decrypt']);
export async function encrypt(secret, text) { if (!text) return ''; const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(secret), enc.encode(text)); return b64encode(iv) + '.' + b64encode(new Uint8Array(ct)); }
export async function decrypt(secret, blob) { if (!blob) return ''; try { const [iv, ct] = blob.split('.').map(b64decode);
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await aesKey(secret), ct)); } catch { return ''; } }
