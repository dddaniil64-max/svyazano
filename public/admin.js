'use strict';
/* Админ-панель: вход → вкладки «Обращения», «Игрушки», «Настройки». Все действия — через интерфейс. */
const $ = document.getElementById('app'); let sel = null, selToy = null, timer = null, visibilityRefresh = null;
function stopRefresh() { clearInterval(timer); timer = null; if (visibilityRefresh) document.removeEventListener('visibilitychange', visibilityRefresh); visibilityRefresh = null; }
function h(tag, a = {}, ...kids) { const e = document.createElement(tag);
  for (const [k, v] of Object.entries(a)) { if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v != null && v !== false) e.setAttribute(k, v); }
  for (const c of kids.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(String(c))); return e; }
async function api(url, method, body) { const r = await fetch('/api/admin' + url, { method: method || 'GET', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' }, body: body && JSON.stringify(body) });
  const d = await r.json().catch(() => ({})); if (r.status === 401 && url !== '/login') { loginView(); throw new Error('auth'); } if (!r.ok) throw new Error(d.error || 'Ошибка'); return d; }
const when = t => new Date(t).toLocaleString('ru-RU'), rub = n => Number(n).toLocaleString('ru-RU') + ' ₽';
const label = { new: 'новое', answered: 'отвечено', closed: 'закрыто' };
const fld = (l, el) => [h('label', {}, l), el];
const inp = (v, a = {}) => { const e = h('input', a); e.value = v ?? ''; return e; };

function loginView() { stopRefresh();
  const login = h('input', { autocomplete: 'username' }), pw = h('input', { type: 'password', autocomplete: 'current-password' }), err = h('div', { class: 'note err', role: 'alert' });
  const go = async () => { err.textContent = ''; try { await api('/login', 'POST', { login: login.value, password: pw.value }); panel('tickets'); } catch (e) { err.textContent = e.message; } };
  pw.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  $.replaceChildren(h('div', { class: 'card' }, h('h2', {}, 'Вход для администратора'), fld('Логин', login), fld('Пароль', pw), err, h('div', { class: 'row' }, h('button', { class: 'btn', onclick: go }, 'Войти')))); }

function panel(tab) { stopRefresh(); const body = h('div');
  const tabBtn = (id, t) => h('button', { class: 'pill' + (tab === id ? ' on' : ''), onclick: () => panel(id) }, t);
  $.replaceChildren(h('div', { class: 'nav' }, h('a', { class: 'logo', href: '/admin' }, h('img',{src:'/logo.svg',alt:'',width:'34',height:'34'}), 'Связано · Админ-панель'),
    h('div', { class: 'row' }, h('a', { class: 'pill', href: '/' }, 'На сайт'), h('button', { class: 'pill', onclick: async () => { await api('/logout', 'POST', {}); loginView(); } }, 'Выйти'))),
    h('div', { class: 'tabs' }, tabBtn('tickets', 'Обращения'), tabBtn('toys', 'Игрушки'), tabBtn('settings', 'Настройки'), tabBtn('status', 'Статус / ошибки')), body);
  ({ toys: toysView, settings: settingsView, status: statusView }[tab] || ticketsView)(body).catch(e => { if (e.message !== 'auth') body.textContent = e.message; }); }

/* ---------- Обращения ---------- */
async function ticketsView(box) { const list = h('div'), view = h('div'), days = inp(180, { type: 'number', min: '1', max: '730' }), pinfo = h('div', { class: 'note' });
  box.replaceChildren(h('div', { class: 'layout' }, h('div', {}, list, h('div', { class: 'card' }, h('h3', {}, 'Очистка'), h('label', {}, 'Удалить обращения без активности старше (дней)'), days, pinfo,
    h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: async () => { if (!confirm('Удалить старые обращения?')) return; await api('/tickets-purge', 'POST', { days: +days.value }); pinfo.textContent = 'Готово.'; load(); } }, 'Удалить старые')))), view));
  async function load() { const rows = await api('/tickets');
    list.replaceChildren(...(rows.length ? rows : [h('p', { class: 'muted' }, 'Обращений пока нет.')]).map(t => t.id ? h('button', { class: 'item' + (t.id === sel ? ' sel' : ''), onclick: () => { sel = t.id; load(); open(t.id); } },
      h('div', { class: 'row' }, h('strong', {}, t.name), h('span', { class: 'badge ' + t.status }, label[t.status])), h('div', { class: 'last' }, t.last), h('div', { class: 'note' }, when(t.updated_at))) : t)); }
  async function open(id, flash) { const t = await api('/tickets/' + id), ta = h('textarea', { maxlength: '3000', placeholder: 'Ответ клиенту' }), info = h('div', { class: 'note err' });
    view.replaceChildren(h('div', { class: 'card' }, flash ? h('div', { class: 'msg adm' }, flash) : null, h('h3', {}, t.name), t.email ? h('div', { class: 'muted' }, 'Почта: ' + t.email + ' (отвечать письмом нужно вручную из вашей почты)') : h('div', { class: 'muted' }, 'Контакты не указаны — клиент увидит ответ на сайте'), t.consentAt ? h('div', { class: 'note' }, 'Согласие на обработку данных: ' + when(t.consentAt)) : null,
      ...t.messages.map(m => h('div', { class: 'msg' + (m.from_admin ? ' adm' : '') }, (m.from_admin ? 'Вы: ' : 'Клиент: ') + m.text)), fld('Ответ', ta), info,
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: async () => { try { await api('/tickets/' + id + '/reply', 'POST', { text: ta.value }); await load(); await open(id, 'Ответ отправлен — клиент увидит его на странице.'); } catch (e) { info.textContent = e.message; } } }, 'Ответить'),
        h('button', { class: 'btn ghost', onclick: async () => { await api('/tickets/' + id + '/close', 'POST', {}); load(); open(id); } }, 'Закрыть'),
        h('button', { class: 'btn ghost', onclick: async () => { if (confirm('Удалить обращение навсегда?')) { await api('/tickets/' + id, 'DELETE'); sel = null; view.replaceChildren(); load(); } } }, 'Удалить')))); }
  await load();
  visibilityRefresh = () => { if (!document.hidden) load().catch(() => {}); };
  timer = setInterval(visibilityRefresh, 30000);
  document.addEventListener('visibilitychange', visibilityRefresh);
  if (sel) open(sel).catch(() => {}); }

/* ---------- Игрушки: добавить / изменить / скрыть / удалить, с загрузкой фото ---------- */
async function shrink(file) { const bmp = await createImageBitmap(file); const side = 1800, k = Math.min(1, side / Math.max(bmp.width, bmp.height)); let blob;
  for (const q of [0.88, 0.78, 0.68, 0.56, 0.45]) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
    c.getContext('2d', { alpha: false }).drawImage(bmp, 0, 0, c.width, c.height); blob = await new Promise(r => c.toBlob(r, 'image/jpeg', q)); if (blob && blob.size <= 900 * 1024) { bmp.close?.(); return blob; } }
  bmp.close?.(); throw new Error('Не удалось подготовить фото. Попробуйте JPG или WEBP меньшего размера.'); }
async function upload(blob) { const r = await fetch('/api/admin/upload', { method: 'POST', headers: { 'Content-Type': blob.type, 'X-Requested-With': 'fetch' }, body: blob });
  const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Не удалось загрузить фото'); return d.url; }

async function toysView(box) { const list = h('div'), form = h('div'); box.replaceChildren(h('div', { class: 'layout' }, list, form));
  async function load() { const rows = await api('/toys');
    list.replaceChildren(h('button', { class: 'btn', onclick: () => edit(null) }, '+ Добавить игрушку'), h('div', { class: 'note' }, rows.length ? '' : 'Каталог пуст.'),
      ...rows.map(t => h('button', { class: 'item' + (t.id === selToy ? ' sel' : ''), onclick: () => edit(t) }, h('div', { class: 'row' }, h('strong', {}, t.emoji + ' ' + t.name), h('span', { class: 'badge' + (t.published ? ' answered' : '') }, t.published ? 'на сайте' : 'скрыта')), h('div', { class: 'last' }, (t.price == null ? 'Цена не указана' : rub(t.price)) + ' · ' + (t.size || '—'))))); }
  function edit(t) { selToy = t ? t.id : null; load(); let images = t ? [...(Array.isArray(t.images) && t.images.length ? t.images : (t.image ? [t.image] : []))] : [];
    const v = t || { name: '', emoji: '🧸', price: '', size: '', time: '', material: '', desc: '', tags: [], published: true };
    const name = inp(v.name, { maxlength: '80' }), price = inp(v.price, { type: 'number', min: '0', inputmode: 'numeric' }), size = inp(v.size, { maxlength: '40', placeholder: 'например, 28 см' }),
      time = inp(v.time, { maxlength: '40', placeholder: 'например, 3 дня' }), material = inp(v.material, { maxlength: '120' }), emoji = inp(v.emoji, { maxlength: '8' }),
      tags = inp((v.tags || []).join(', '), { placeholder: 'через запятую: подарок, для малышей' }), desc = h('textarea', { maxlength: '2000' }),
      pub = h('input', { type: 'checkbox', id: 'pub' }), prev = h('div', { class: 'pic thumb c1' }), msg = h('div', { class: 'note', role: 'status' });
    desc.value = v.desc; pub.checked = !!v.published;
    const photoList = h('div', { class: 'photo-list' }); const showPrev = () => { prev.replaceChildren(images.length ? h('img', { src: images[0], alt: '' }) : (emoji.value || '🧸')); photoList.replaceChildren(...images.map((src, i) => h('div', { class: 'photo-item' }, h('img', { src, alt: 'Фото ' + (i + 1) }), h('button', { class: 'pill', onclick: () => { images.splice(i, 1); showPrev(); } }, 'Убрать')))); }; showPrev(); emoji.addEventListener('input', showPrev);
    const file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/avif', multiple: true });
    file.addEventListener('change', async () => { const chosen = [...file.files].slice(0, Math.max(0, 8 - images.length)); if (!chosen.length) { msg.textContent = 'Можно добавить не более 8 фотографий.'; return; } msg.className = 'note'; msg.textContent = 'Загружаю фотографии…'; file.disabled = true; try { for (const f of chosen) { images.push(await upload(await shrink(f))); showPrev(); } msg.className = 'note ok'; msg.textContent = 'Фотографии загружены. Нажмите «Сохранить».'; } catch (e) { msg.className = 'note err'; msg.textContent = e.message; } finally { file.disabled = false; file.value = ''; } });
    const save = async () => { msg.className = 'note'; msg.textContent = '';
      const body = { name: name.value, price: price.value, size: size.value, time: time.value, material: material.value, desc: desc.value, tags: tags.value, emoji: emoji.value, images, image: images[0] || '', published: pub.checked };
      try { if (t) await api('/toys/' + t.id, 'PUT', body); else { const r = await api('/toys', 'POST', body); selToy = r.id; t = { id: r.id }; } await load(); msg.className = 'note ok'; msg.textContent = 'Сохранено' + (pub.checked ? ' — игрушка уже на сайте.' : ' (скрыта от посетителей).'); }
      catch (e) { msg.className = 'note err'; msg.textContent = e.message; } };
    form.replaceChildren(h('div', { class: 'card' }, h('h3', {}, t ? 'Редактирование' : 'Новая игрушка'), prev, fld('Фотографии (до 8 JPG/PNG/WEBP; большие изображения уменьшаются автоматически)', file), photoList,
      fld('Название *', name), fld('Цена, ₽ (необязательно)', price), fld('Размер', size), fld('Срок изготовления', time), fld('Материал', material), fld('Описание', desc), fld('Теги', tags), fld('Эмодзи (если нет фото)', emoji),
      h('div', { class: 'chk' }, pub, h('label', { for: 'pub' }, 'Показывать на сайте')), msg,
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: save }, 'Сохранить'),
        t ? h('button', { class: 'btn ghost', onclick: async () => { if (confirm('Удалить игрушку навсегда?')) { await api('/toys/' + t.id, 'DELETE'); selToy = null; form.replaceChildren(); load(); } } }, 'Удалить') : null))); }
  await load(); }

/* ---------- Подробный статус и диагностика ---------- */
async function statusView(box){box.replaceChildren(h('h2',{},'Статус сайта и отчёт о проблемах'),h('p',{class:'muted'},'Проверка подключения к базе, секретов, каталога, изображений, обращений и журнала ошибок.'),h('p',{class:'note'},'Проверка выполняется при открытии страницы; обновите её для нового отчёта.'),h('div',{class:'row'},h('button',{class:'btn',onclick:()=>statusView(box)},'Обновить отчёт')));try{const d=await api('/health'),c=d.config||{},checks=[['База данных D1',c.db,'Проверяется запросами к таблицам'],['APP_SECRET',c.appSecret,c.appSecret?'Секрет установлен':'Добавьте APP_SECRET длиной не менее 32 символов'],['Доступ администратора',c.admin,c.admin?'Секреты заданы и пароль достаточной длины':'Проверьте ADMIN_LOGIN и ADMIN_PASSWORD (не менее 14 символов)'],['Каталог',true,'Товаров: '+d.counts.toys],['Фотографии',true,'Изображений: '+d.counts.images],['Обращения',true,'Всего обращений: '+d.counts.tickets]];box.append(h('div',{class:'card sec'},h('h3',{},'Проверки системы'),...checks.map(([n,ok,desc])=>h('div',{class:'status-line'},h('span',{class:'status-dot '+(ok?'good':'bad')},ok?'✓':'!'),h('div',{},h('strong',{},n),h('div',{class:'muted'},desc)))),h('p',{class:'note'},'Проверено: '+when(d.checkedAt))),h('div',{class:'card sec'},h('h3',{},'Журнал ошибок и проблем'),d.logs.length?d.logs.map(l=>h('div',{class:'msg '+(l.level==='error'?'err':'')},h('strong',{},'['+l.level+'] '+l.area),h('p',{},l.message),h('div',{class:'note'},when(l.created_at)))):h('p',{class:'muted'},'Записанных серверных ошибок нет. Это не исключает ошибок браузера или проблем внешней платформы.')),h('div',{class:'card sec'},h('h3',{},'Что проверить при проблеме'),h('ul',{},h('li',{},'Если API не отвечает — проверьте Cloudflare Workers → Logs.'),h('li',{},'Если D1 недоступна — проверьте binding DB и миграции.'),h('li',{},'Если изображения не открываются — проверьте таблицу images и доступность /img/… .'),h('li',{},'Если не работает вход — проверьте секреты и срок сессии.'),h('li',{},'Если форма поддержки не отправляется — проверьте сообщения формы и журнал Worker.'))));}catch(e){box.append(h('div',{class:'card sec err'},h('h3',{},'Не удалось получить отчёт'),h('p',{},e.message),h('p',{class:'muted'},'Проверьте подключение к D1, активную сессию администратора и журналы Cloudflare Workers.')))}}

/* ---------- Настройки: контакты, сведения о продавце, параметры, условия заказа ---------- */
async function settingsView(box) { const s = await api('/settings'), F = {}, msg = h('div', { class: 'note', role: 'status' });
  const mk = (grp, key, l, v, a) => { const e = inp(v, a); F[grp + key] = e; return [h('label', {}, l), e]; };
  const collect = h('input', { type: 'checkbox', id: 'collect' }); collect.checked = !!s.options.collectEmail;
  const terms = h('textarea', { maxlength: '6000' }); terms.value = s.terms.text; terms.style.minHeight = '140px';
  const save = async () => { msg.className = 'note'; msg.textContent = ''; const g = (grp, keys) => Object.fromEntries(keys.map(k => [k, F[grp + k].value]));
    try { await api('/settings', 'PUT', { contacts: g('c', ['phone', 'email', 'telegram', 'max', 'vk', 'address', 'hours', 'note']), seller: g('s', ['status', 'name', 'inn', 'ogrn', 'address', 'email', 'phone']), options: { collectEmail: collect.checked, retentionDays: F.oretention.value }, terms: { text: terms.value } });
      msg.className = 'note ok'; msg.textContent = 'Сохранено — изменения уже на сайте.'; } catch (e) { msg.className = 'note err'; msg.textContent = e.message; } };
  box.replaceChildren(
    h('div', { class: 'card' }, h('h3', {}, 'Контакты на сайте'), h('p', { class: 'muted' }, 'Их видят посетители в «Контактах» и на странице поддержки. Пустые поля не показываются.'),
      h('div', { class: 'two' }, h('div', {}, mk('c', 'phone', 'Телефон', s.contacts.phone, { maxlength: '30', placeholder: '+7 900 000-00-00' }), mk('c', 'email', 'Почта', s.contacts.email, { maxlength: '120' }), mk('c', 'telegram', 'Telegram (имя пользователя)', s.contacts.telegram, { maxlength: '60', placeholder: 'my_shop' }), mk('c', 'max', 'MAX (ссылка на чат или профиль)', s.contacts.max || '', { maxlength: '120', placeholder: 'https://max.ru/...' })),
        h('div', {}, mk('c', 'vk', 'ВКонтакте (ссылка)', s.contacts.vk, { maxlength: '100', placeholder: 'https://vk.com/my_shop' }), mk('c', 'address', 'Город / адрес', s.contacts.address, { maxlength: '160' }), mk('c', 'hours', 'Время работы', s.contacts.hours, { maxlength: '80' }))), mk('c', 'note', 'Пояснение', s.contacts.note, { maxlength: '160' })),
    h('div', { class: 'card sec' }, h('h3', {}, 'Сведения о продавце (оператор данных)'), h('p', { class: 'muted' }, 'Обязательны для интернет-торговли; подставляются в политику конфиденциальности и в подвал сайта.'),
      h('div', { class: 'two' }, h('div', {}, mk('s', 'status', 'Статус', s.seller.status, { maxlength: '60', placeholder: 'самозанятый (НПД) / ИП / ООО' }), mk('s', 'name', 'ФИО или наименование', s.seller.name, { maxlength: '160' }), mk('s', 'inn', 'ИНН (10 или 12 цифр)', s.seller.inn, { maxlength: '12', inputmode: 'numeric' }), mk('s', 'ogrn', 'ОГРН / ОГРНИП (если есть)', s.seller.ogrn, { maxlength: '15', inputmode: 'numeric' })),
        h('div', {}, mk('s', 'address', 'Адрес (юридический или для связи)', s.seller.address, { maxlength: '200' }), mk('s', 'email', 'Почта продавца', s.seller.email, { maxlength: '120' }), mk('s', 'phone', 'Телефон продавца', s.seller.phone, { maxlength: '30' })))),
    h('div', { class: 'card sec' }, h('h3', {}, 'Информация о товарах и связи'), h('p', { class: 'muted' }, 'Показываются на информационной странице. Опишите реальные условия вашей работы.'), terms),
    h('div', { class: 'card sec' }, h('h3', {}, 'Персональные данные'), h('div', { class: 'notice' }, 'По умолчанию сайт НЕ собирает имя и почту клиентов: база данных Cloudflare находится за пределами РФ, а закон требует хранить персональные данные россиян в базах на территории РФ. Включайте сбор только после консультации с юристом (см. docs/03-ЮРИДИЧЕСКИЙ-ЧЕКЛИСТ.md).'),
      h('div', { class: 'chk' }, collect, h('label', { for: 'collect' }, 'Собирать имя и почту клиентов (с отдельным согласием)')), mk('o', 'retention', 'Хранить обращения без активности (дней, 7–730)', s.options.retentionDays, { type: 'number', min: '7', max: '730' })),
    msg, h('div', { class: 'row sec' }, h('button', { class: 'btn', onclick: save }, 'Сохранить настройки'), h('a', { class: 'btn ghost', href: '/#privacy', target: '_blank' }, 'Открыть политику'))); }

fetch('/api/admin/me').then(r => r.json()).then(d => d.auth ? panel('tickets') : loginView()).catch(loginView);
