import { err, clean, line, okMail } from './util.js';
const IMG = /^\/img\/[a-f0-9]{32}$/;
export const toyOut = r => ({ id: r.id, name: r.name, emoji: r.emoji, image: r.image || (JSON.parse(r.images || '[]')[0] || ''), images: (() => { try { const a = JSON.parse(r.images || '[]'); return a.length ? a : (r.image ? [r.image] : []); } catch { return r.image ? [r.image] : []; } })(), price: r.price == null || Number(r.price) <= 0 ? null : r.price, size: r.size, time: r.time, material: r.material, desc: r.desc, tags: JSON.parse(r.tags || '[]'), published: !!r.published });
export function toyIn(b) {
  const name = line(b.name, 80), rawPrice = b.price == null || String(b.price).trim() === '' ? null : Number(b.price), price = rawPrice == null ? 0 : Math.round(rawPrice);
  if (!name) throw err(400, 'Укажите название');
  if (rawPrice != null && !(Number.isFinite(rawPrice) && price >= 0 && price <= 10000000)) throw err(400, 'Укажите корректную цену или оставьте поле пустым');
  const tags = (Array.isArray(b.tags) ? b.tags : String(b.tags || '').split(',')).map(t => line(t, 30)).filter(Boolean).slice(0, 8);
  const rawImages = Array.isArray(b.images) ? b.images : (b.image ? [b.image] : []);
  const images = [...new Set(rawImages.filter(x => typeof x === 'string' && IMG.test(x)))].slice(0, 8);
  const image = images[0] || (IMG.test(b.image || '') ? b.image : '');
  return { name, emoji: line(b.emoji, 8) || '🧸', image, images: JSON.stringify(images.length ? images : (image ? [image] : [])), price, size: line(b.size, 40), time: line(b.time, 40), material: line(b.material, 120), desc: clean(b.desc, 2000), tags: JSON.stringify(tags), published: b.published ? 1 : 0 };
}
export const imageId = url => (IMG.test(url || '') ? url.slice(5) : null);
export function contactsIn(b = {}) {
  const email = line(b.email, 120); if (email && !okMail(email)) throw err(400, 'Неверная почта в контактах');
  const tg = line(b.telegram, 60).replace(/^(https?:\/\/)?(t\.me\/|@)/i, ''); if (tg && !/^[A-Za-z0-9_]{3,32}$/.test(tg)) throw err(400, 'Telegram: только имя пользователя, например my_shop');
  const vk = line(b.vk, 100); if (vk && !/^https:\/\/(vk\.com|vk\.ru)\/[A-Za-z0-9_.\-\/]{1,60}$/.test(vk)) throw err(400, 'VK: ссылка вида https://vk.com/название');
  const phone = line(b.phone, 30); if (phone && !/^[0-9+()\-\s]{5,30}$/.test(phone)) throw err(400, 'Телефон: цифры, +, скобки, дефисы');
  const max = line(b.max, 120); if (max && !/^https:\/\/(?:max\.ru|web\.max\.ru)\/[A-Za-z0-9_.?=&%\-]{1,90}$/.test(max)) throw err(400, 'MAX: укажите ссылку на чат или профиль MAX');
  return { phone, email, telegram: tg, max, vk, address: line(b.address, 160), hours: line(b.hours, 80), note: line(b.note, 160) };
}
export function sellerIn(b = {}) {
  const email = line(b.email, 120); if (email && !okMail(email)) throw err(400, 'Неверная почта продавца');
  const inn = line(b.inn, 12); if (inn && !/^\d{10}$|^\d{12}$/.test(inn)) throw err(400, 'ИНН: 10 или 12 цифр');
  const ogrn = line(b.ogrn, 15); if (ogrn && !/^\d{13}$|^\d{15}$/.test(ogrn)) throw err(400, 'ОГРН/ОГРНИП: 13 или 15 цифр');
  const phone = line(b.phone, 30); if (phone && !/^[0-9+()\-\s]{5,30}$/.test(phone)) throw err(400, 'Телефон продавца: цифры, +, скобки, дефисы');
  return { status: line(b.status, 60), name: line(b.name, 160), inn, ogrn, address: line(b.address, 200), email, phone };
}
export const optionsIn = (b = {}) => ({ collectEmail: b.collectEmail === true, retentionDays: Math.min(730, Math.max(7, Math.round(Number(b.retentionDays)) || 180)) });
export const termsIn = (b = {}) => ({ text: clean(b.text, 6000) });
