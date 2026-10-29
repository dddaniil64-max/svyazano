'use strict';
/* Публичная часть сайта. Весь вывод через textContent; ссылки строятся только из проверенных шаблонов. */
const $app = document.getElementById('app'), $nav = document.getElementById('nav'), $foot = document.getElementById('foot');
let TOYS = [], SITE = { contacts: {}, seller: {}, terms: '', collectEmail: false, retentionDays: 180 }, timer = null;
const rub = n => n == null || n === '' ? 'Цена по запросу' : Number(n).toLocaleString('ru-RU') + ' ₽';
const ls = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} } };
function h(tag, a = {}, ...kids) { const e = document.createElement(tag);
  for (const [k, v] of Object.entries(a)) { if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v != null && v !== false) e.setAttribute(k, v); }
  for (const c of kids.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(String(c))); return e; }
async function api(url, opt) { const r = await fetch(url, { cache: 'no-store', ...(opt ? { method: opt.method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' }, body: JSON.stringify(opt.body) } : {}) });
  const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Ошибка'); return d; }
const byId = id => TOYS.find(t => t.id === id);
const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .12 }) : null;
const rv = (el, i = 0) => { el.classList.add('reveal'); el.style.setProperty('--i', Math.min(i, 8)); io ? io.observe(el) : el.classList.add('in'); return el; };

/* Контакты: ссылки собираются только из безопасных шаблонов (tel:, mailto:, https://t.me/, https://vk.com/) */
function contactList() { const c = SITE.contacts || {}, out = [];
  const add = (icon, label, text, href) => out.push(h(href ? 'a' : 'div', { class: 'contact', href, target: href && href.startsWith('http') ? '_blank' : null, rel: href && href.startsWith('http') ? 'noopener noreferrer' : null }, h('span', { 'aria-hidden': 'true' }, icon), h('span', {}, h('b', {}, label), text)));
  if (c.phone) add('📞', 'Телефон', c.phone, 'tel:' + c.phone.replace(/[^\d+]/g, ''));
  if (c.email) add('✉️', 'Почта', c.email, 'mailto:' + c.email);
  if (c.telegram) add('✈️', 'Telegram', '@' + c.telegram, 'https://t.me/' + c.telegram);
  if (c.max) add('💙', 'MAX', c.max.replace('https://', ''), c.max);
  if (c.vk) add('💬', 'ВКонтакте', c.vk.replace('https://', ''), c.vk);
  if (c.address) add('📍', 'Адрес', c.address);
  if (c.hours) add('🕒', 'Время работы', c.hours + (c.note ? ' · ' + c.note : ''));
  return out; }
const sellerLine = () => { const s = SITE.seller || {}; return [s.name, s.status, s.inn && 'ИНН ' + s.inn, s.ogrn && 'ОГРН(ИП) ' + s.ogrn, s.address].filter(Boolean).join(', '); };

function nav() { const r = location.hash.slice(1), L = (id, t, on) => h('a', { class: 'pill' + (on ? ' on' : ''), href: '#' + id }, t);
  $nav.replaceChildren(h('a', { class: 'logo', href: '#' }, h('img', { src: '/logo.svg', alt: '', width: '46', height: '46' }), h('span', {}, h('strong', {}, 'Связано'), h('small', {}, 'Вязаные игрушки ручной работы'))), h('div', { class: 'row nav-links' }, L('', 'Главная', !r), L('catalog', 'Каталог', r === 'catalog' || r.startsWith('toy')), L('about', 'О нас', r === 'about'), L('contacts', 'Контакты', r === 'contacts'), L('support', 'Поддержка', r === 'support'))); }
function footer() { const sl = sellerLine();
  $foot.replaceChildren(
    h('div', { class: 'foot-brand' },
      h('a', { class: 'logo', href: '#' }, h('img', { src: '/logo.svg', alt: '', width: '40', height: '40' }), h('span', {}, h('strong', {}, 'Связано'), h('small', {}, 'Вязаные игрушки ручной работы'))),
      h('p', {}, 'Тёплые вещи, созданные вручную и с любовью.')),
    h('div', { class: 'row' }, h('a', { href: '#catalog' }, 'Каталог'), h('a', { href: '#about' }, 'О нас'), h('a', { href: '#contacts' }, 'Контакты'), h('a', { href: '#privacy' }, 'Политика конфиденциальности'), SITE.collectEmail ? h('a', { href: '#consent' }, 'Согласие на обработку данных') : null),
    h('div', {}, sl ? 'Продавец: ' + sl : '© ' + new Date().getFullYear() + ' Связано. Вязаные игрушки ручной работы.'));
}

const imageList = t => (Array.isArray(t.images) && t.images.length ? t.images : (t.image ? [t.image] : []));
const pic = (t, big) => { const imgs = imageList(t); const el = h('div', { class: 'pic c' + (t.id % 6) + (big ? ' big' : '') }); if (imgs.length) { const im = h('img', { src: imgs[0], alt: t.name, loading: 'lazy', decoding: 'async' }); im.onerror = () => { im.style.display = 'none'; el.append(h('span', {}, t.emoji || '🧸')); }; el.append(im); } else el.append(h('span', {}, t.emoji || '🧸')); return el; };

function home() {
  let tag = 'все';
  const tags = ['все', ...new Set(TOYS.flatMap(t => t.tags || []))];
  const bar = h('div', { class: 'tags' }), grid = h('div', { class: 'grid' });
  const draw = () => {
    bar.replaceChildren(...tags.map(x => h('button', { class: 'pill' + (x === tag ? ' on' : ''), onclick: () => { tag = x; draw(); } }, x)));
    const list = TOYS.filter(t => tag === 'все' || (t.tags || []).includes(tag));
    grid.replaceChildren(...(list.length ? list.map((t, i) => rv(h('button', { class: 'card toy', onclick: () => { location.hash = 'toy-' + t.id; } }, pic(t), h('div', { class: 'toy-caption' }, h('h3', {}, t.name), h('span', { class: 'toy-arrow', 'aria-hidden': 'true' }, '↗')), h('div', { class: 'muted' }, [t.size, t.material].filter(Boolean).join(' · ')), h('div', { class: 'price' }, rub(t.price))), i)) : [h('p', { class: 'muted' }, 'Скоро здесь появятся новые игрушки.')]));
  };
  draw();
  const features = [['♡','Ручная работа','Каждая игрушка создаётся с любовью и вниманием к деталям'],['♧','Мягкие материалы','Подробности о составе указаны в карточке изделия'],['✧','Уникальный дизайн','У каждой игрушки свой характер и настроение'],['♡','Тёплый подарок','Маленькая история, связанная специально для вас']];
  const benefits = [['♡','Качество в деталях','Аккуратная работа и внимание к каждой мелочи'],['♧','Нежные оттенки','Мягкая палитра и уютный стиль'],['✧','Индивидуальный подход','Можно обсудить цвет и детали с мастером'],['☻','Мы на связи','Ответим на вопросы о материалах и изделиях']];
  const about = h('section', { id: 'about', class: 'about sec' },
    h('div', { class: 'about-photo' }, h('div', { class: 'about-collage' }, ...TOYS.slice(0, 3).map(t => h('button', { class: 'about-mini', onclick: () => location.hash = 'toy-' + t.id, title: t.name }, pic(t))))),
    h('div', { class: 'about-copy' }, h('div', { class: 'eyebrow' }, '♡  Немного о нас'), h('h2', {}, 'Больше, чем просто игрушки'), h('p', { class: 'muted' }, 'Мы создаём вязаные игрушки вручную, вкладывая в каждую из них частичку тепла. Здесь вы найдёте готовые работы, познакомитесь с материалами и сможете задать вопрос о понравившейся игрушке.'),
      h('div', { class: 'stats' }, h('div', {}, h('strong', {}, '100%'), h('span', {}, 'ручная работа')), h('div', {}, h('strong', {}, String(TOYS.length || '—')), h('span', {}, 'моделей в каталоге')), h('div', {}, h('strong', {}, '♡'), h('span', {}, 'сделано с любовью')))));
  const gallery = h('div', { class: 'mini-gallery' }, ...TOYS.slice(0, 5).map(t => h('button', { class: 'mini-shot', onclick: () => location.hash = 'toy-' + t.id, title: t.name }, pic(t))));
  const contacts = contactList();
  const hero = h('section', { class: 'hero hero-split' },
    h('div', { class: 'hero-copy' }, h('div', { class: 'eyebrow' }, '♡  Тепло в каждой петельке'), h('h1', {}, 'Вязаные игрушки, в которых живёт любовь'), h('p', { class: 'muted' }, 'Уникальные авторские игрушки, созданные с теплом и заботой. Каждая — особенная, как и тот, для кого она сделана.'),
      h('div', { class: 'row hero-actions' }, h('a', { class: 'btn', href: '#catalog', onclick: e => { e.preventDefault(); location.hash = 'catalog'; setTimeout(() => document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' }), 0); } }, 'Перейти в каталог  →'), h('a', { class: 'btn ghost', href: '#about' }, 'Наша история'))),
    h('div', { class: 'hero-art' }, h('div', { class: 'hero-halo' }), h('div', { class: 'hero-toy' }, h('img', { src: imageList(TOYS[0] || {})[0] || '', alt: 'Вязаная игрушка', onerror: e => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement.append(h('span', {}, '🐰')); } })), h('span', { class: 'handwritten' }, 'Связано с любовью ♡'), h('span', { class: 'hero-dot dot1' }, '♡'), h('span', { class: 'hero-dot dot2' }, '✧')));
  const featureStrip = h('section', { class: 'feature-strip' }, ...features.map(f => h('div', { class: 'feature' }, h('span', { class: 'feature-icon' }, f[0]), h('h3', {}, f[1]), h('p', { class: 'muted' }, f[2]))));
  const catalog = h('section', { id: 'catalog', class: 'sec catalog-section' }, h('div', { class: 'section-head' }, h('div', {}, h('div', { class: 'eyebrow' }, 'Найдите своего друга'), h('h2', {}, 'Каталог'), h('p', { class: 'muted' }, 'Выберите игрушку, которая подарит улыбку')), h('a', { class: 'pill', href: '#catalog' }, 'Все игрушки  →')), bar, grid);
  const benefitsSection = h('section', { class: 'sec benefits-section' }, h('div', { class: 'eyebrow' }, '♡  С любовью к каждой детали'), h('h2', {}, 'Почему выбирают «Связано»'), h('div', { class: 'benefits-grid' }, ...benefits.map(x => h('div', { class: 'benefit-card' }, h('span', { class: 'feature-icon' }, x[0]), h('h3', {}, x[1]), h('p', { class: 'muted' }, x[2])))));
  const works = TOYS.length ? h('section', { class: 'sec' }, h('div', { class: 'section-head' }, h('div', {}, h('div', { class: 'eyebrow' }, 'Вдохновляйтесь'), h('h2', {}, 'Наши работы')), h('div', { class: 'muted' }, 'Нажмите на фото, чтобы посмотреть игрушку')), gallery) : null;
  const contactSection = h('section', { id: 'contacts', class: 'sec contacts-section' }, h('div', { class: 'eyebrow' }, 'Будем рады знакомству'), h('h2', {}, 'Контакты'), h('p', { class: 'muted' }, 'Выберите удобный способ связи — ответим на вопросы о наших игрушках.'), h('div', { class: 'contacts' }, ...(contacts.length ? contacts : [h('p', { class: 'muted' }, 'Контакты скоро появятся.')])), h('a', { class: 'btn sec', href: '#support' }, 'Написать нам'));
  const faq = h('section', { class: 'sec faq-section' }, h('h2', {}, 'Частые вопросы'), ...[['Из чего сделаны игрушки?', 'Материал и наполнитель указаны в карточке каждой игрушки.'], ['Сколько по времени делается игрушка?', 'Срок изготовления указан в карточке. По наличию и срокам можно уточнить у мастера.'], ['Можно обсудить цвет или детали?', 'Да, напишите нам через поддержку или удобный мессенджер.'], ['Как узнать о наличии?', 'Откройте карточку игрушки и свяжитесь с нами — уточним актуальную информацию.']].map(f => h('details', {}, h('summary', {}, f[0]), h('p', { class: 'muted' }, f[1]))));
  return h('div', { class: 'site-home' }, hero, featureStrip, catalog, about, benefitsSection, works, contactSection, rv(faq));
}

function toyPage(t) {
  const i=TOYS.indexOf(t), prev=TOYS[(i+TOYS.length-1)%TOYS.length], next=TOYS[(i+1)%TOYS.length];
  const imgs=imageList(t); let ix=0; const gallery=h('div',{class:'gallery card'}), mainPic=h('div',{class:'pic big c'+(t.id%6)});
  const mainImg=h('img',{src:imgs[0]||'',alt:t.name,decoding:'async'});
  if(imgs.length){mainImg.onerror=()=>{mainImg.style.display='none';};mainPic.append(mainImg);}else mainPic.append(h('span',{},t.emoji||'🧸'));
  const count=h('div',{class:'gallery-count'},imgs.length?'1 / '+imgs.length:'');
  const drawGallery=()=>{if(imgs.length){mainImg.style.display='';mainImg.src=imgs[ix];mainImg.alt=t.name+' — фото '+(ix+1);count.textContent=(ix+1)+' / '+imgs.length;}};
  gallery.append(mainPic);
  if(imgs.length>1)gallery.append(h('div',{class:'gallery-controls'},h('button',{class:'pill','aria-label':'Предыдущее фото',onclick:()=>{ix=(ix+imgs.length-1)%imgs.length;drawGallery();}},'‹'),count,h('button',{class:'pill','aria-label':'Следующее фото',onclick:()=>{ix=(ix+1)%imgs.length;drawGallery();}},'›')));else gallery.append(count);
  if(imgs.length>1)gallery.append(h('div',{class:'gallery-thumbs'},imgs.map((src,j)=>h('button',{class:'gallery-thumb','aria-label':'Фото '+(j+1),onclick:()=>{ix=j;drawGallery();}},h('img',{src,alt:'',loading:'lazy'})))));
  
  return h('div',{},h('div',{class:'row'},h('a',{class:'pill',href:'#'},'← Все игрушки'),h('a',{class:'pill',href:'#toy-'+prev.id},'‹ '+prev.name),h('a',{class:'pill',href:'#toy-'+next.id},next.name+' ›')),
    h('div',{class:'detail sec'},gallery,h('div',{class:'card'},h('h2',{},t.name),h('div',{class:'price'},rub(t.price)),h('p',{},t.desc),h('div',{class:'tags'},t.tags.map(x=>h('span',{},x))),
      t.size?h('p',{class:'muted'},'Размер: '+t.size):null,t.material?h('p',{class:'muted'},'Материал: '+t.material):null,t.time?h('p',{class:'muted'},'Срок изготовления: '+t.time):null,
      h('div',{class:'row sec'},h('a',{class:'btn',href:'#contacts'},'Уточнить наличие'),h('button',{class:'btn ghost',onclick:()=>{ls.set('ask',t.id);location.hash='support';}},'Задать вопрос'))))); 
}


function support() { const box = h('div'), thread = h('div'), opened = Date.now(), pd = SITE.collectEmail;
  const name = h('input', { maxlength: '60', autocomplete: 'name' }), mail = h('input', { type: 'email', maxlength: '254', autocomplete: 'email', placeholder: 'необязательно — для ответа на почту' }),
    sel = h('select', {}, h('option', { value: '0' }, 'Общий вопрос'), ...TOYS.map(t => h('option', { value: t.id }, t.name))), txt = h('textarea', { maxlength: '1500' }),
    hp = h('input', { class: 'hp', name: 'website', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' }), cons = h('input', { type: 'checkbox', id: 'cons' }),
    err = h('div', { class: 'note err', role: 'alert' }), btn = h('button', { class: 'btn', type: 'button' }, 'Отправить');
  sel.value = String(ls.get('ask', 0));
  btn.onclick = async () => { err.textContent = ''; const tk = ls.get('tk');
    if (pd && !tk && !cons.checked) { err.textContent = 'Поставьте галочку согласия на обработку данных.'; return; }
    btn.disabled = true;
    try { const body = { message: txt.value };
      if (tk) await api('/api/tickets/' + tk + '/messages', { method: 'POST', body });
      else { const r = await api('/api/tickets', { method: 'POST', body: { ...body, name: name.value, email: mail.value, toyId: +sel.value, website: hp.value, consent: cons.checked, ts: opened } }); ls.set('tk', r.token); }
      txt.value = ''; ls.set('ask', 0); poll(); } catch (e) { err.textContent = e.message; } btn.disabled = false; };
  async function poll() { const tk = ls.get('tk'); if (!tk) return;
    try { const d = await api('/api/tickets/' + tk); thread.replaceChildren(h('h3', {}, 'Ваша переписка'),
      ...d.messages.filter(m => typeof m.text === 'string' && m.text.trim()).map(m => h('div', { class: 'msg' + (m.from_admin ? ' adm' : '') }, (m.from_admin ? '💬 Магазин: ' : 'Вы: ') + m.text.trim())),
      d.status === 'answered' ? null : h('div', { class: 'msg wait' }, 'Ждём ответа — оставайтесь на странице, ответ появится здесь автоматически.'),
      h('p', { class: 'note' }, 'Переписка сохраняется в этом браузере: вернувшись на сайт с этого же устройства, вы увидите ответ.'),
      h('button', { class: 'pill', onclick: () => { ls.set('tk', null); thread.replaceChildren(); render(); } }, 'Начать новое обращение')); }
    catch { ls.set('tk', null); } }
  clearInterval(timer); timer = setInterval(poll, 8000); poll();
  const first = !ls.get('tk');
  box.append(h('h2', {}, 'Поддержка'), h('p', { class: 'muted' }, pd ? 'Задайте вопрос о каталоге или игрушке. Укажите почту, если хотите получить ответ и письмом.' : 'Задайте вопрос по каталогу — ответ появится на этой странице.'),
    h('div', { class: 'card' }, first ? (pd ? [h('div', { class: 'two' }, h('div', {}, h('label', {}, 'Имя'), name), h('div', {}, h('label', {}, 'Почта'), mail)), h('label', {}, 'Тема'), sel] : [h('label', {}, 'Тема'), sel]) : null, h('label', {}, first ? 'Сообщение' : 'Дополнить обращение'), txt, hp,
      first && !pd ? h('div', { class: 'notice' }, '🔒 Не указывайте в сообщении телефон, почту и другие личные данные — сайт их не принимает. Для личной связи и вопросов о товарах воспользуйтесь контактами ниже.') : null,
      first && pd ? h('div', { class: 'chk' }, cons, h('label', { for: 'cons' }, 'Я даю ', h('a', { href: '#consent', target: '_blank' }, 'согласие на обработку персональных данных'), ' и ознакомился с ', h('a', { href: '#privacy', target: '_blank' }, 'Политикой конфиденциальности'), '.')) : null,
      err, h('div', { class: 'row' }, btn)), thread,
    !pd ? h('div', { class: 'sec' }, h('h3', {}, 'Личная связь'), h('div', { class: 'contacts' }, contactList())) : null); return box; }

function contactsPage() { const sl = sellerLine(), s = SITE.seller || {};
  return h('div', {}, h('h2', {}, 'Контакты'), h('p', { class: 'muted' }, 'Выберите удобный способ связи.'), h('div', { class: 'contacts sec' }, contactList().length ? contactList() : [h('p', { class: 'muted' }, 'Контакты скоро появятся. Пока напишите нам через форму поддержки.')]),
    sl ? h('div', { class: 'card sec' }, h('h3', {}, 'Сведения о продавце'), h('p', {}, sl), s.email || s.phone ? h('p', { class: 'muted' }, [s.phone && 'Телефон: ' + s.phone, s.email && 'Почта: ' + s.email].filter(Boolean).join(' · ')) : null) : null,
    h('p', {}, h('a', { class: 'btn', href: '#support' }, 'Написать в поддержку'))); }

function termsPage() { return h('div', { class: 'prose' }, h('h2', {}, 'Информация о товарах и связи'), ...(SITE.terms || '').split(/\n+/).filter(Boolean).map(p => h('p', {}, p)),
  h('p', { class: 'muted' }, 'Цены указаны в рублях. Размер, материал и срок изготовления — в карточке игрушки.'), sellerLine() ? h('div', { class: 'card' }, h('h3', {}, 'Продавец'), h('p', {}, sellerLine())) : null); }

const operator = () => sellerLine(), opMail = () => (SITE.seller || {}).email || (SITE.contacts || {}).email || '';
const S = (t, ...ps) => [h('h3', {}, t), ...ps.map(p => Array.isArray(p) ? h('ul', {}, p.map(x => h('li', {}, x))) : h('p', {}, p))];

/* Политика конфиденциальности (ст. 18.1 152-ФЗ). Текст подстраивается под режим сайта. Это шаблон: согласуйте с юристом. */
function privacy() { const pd = SITE.collectEmail, days = SITE.retentionDays;
  return h('div', { class: 'prose' }, h('h2', {}, 'Политика конфиденциальности'), h('p', { class: 'muted' }, 'Редакция от ' + new Date().toLocaleDateString('ru-RU')),
    S('1. Оператор', [operator() ? 'Оператор: ' + operator() + '.' : '', opMail() ? 'Контакт для обращений по персональным данным: ' + opMail() + '.' : ''].filter(Boolean)),
    S('2. Какие данные обрабатываются', [...(pd ? ['Для поддержки: имя и адрес электронной почты, если пользователь добровольно их указывает, текст сообщения, выбранный товар и факт согласия.'] : ['В форме поддержки без контактов принимается текст вопроса; телефон и почта в тексте отклоняются.']), 'Каталог доступен без регистрации. Сайт не предоставляет корзину и не принимает заказы.']),
    S('3. Технические данные', 'Как и при посещении любого сайта, техническая платформа (Cloudflare, Inc., США) обрабатывает технические данные запроса (IP-адрес, сведения о браузере) для доставки сайта и защиты от атак. Сами мы IP-адреса не сохраняем: для ограничения частоты запросов используется необратимый хеш, который удаляется автоматически.'),
    S('4. Цели', 'Ответы на обращения пользователей, отображение каталога и обеспечение безопасности сайта. Сайт не принимает оплату, не оформляет и не сохраняет заказы. Данные не используются для рекламных рассылок и профилирования и не продаются.'),
    S('5. Правовое основание', 'При анонимном заказе сайт сохраняет сведения о товарах и заказе, не запрашивая контактные данные. Если пользователь добровольно передаёт персональные данные через другие каналы связи или включает сбор контактов в форме поддержки, применяются соответствующие правовые основания и отдельные требования законодательства.'),
    S('6. Где хранятся данные', 'Сайт размещён на инфраструктуре Cloudflare. До включения сбора персональных данных оператору необходимо проверить требования к локализации баз данных в РФ и трансграничной передаче.' + (pd ? ' Давая согласие, вы соглашаетесь на такую трансграничную передачу.' : '')),
    S('7. Сроки хранения', 'Обращения поддержки хранятся не дольше ' + days + ' дней с момента последней активности, если иной срок не требуется законом.'),
    S('8. Защита', ['соединение с сайтом защищено протоколом HTTPS;', pd ? 'адрес почты в обращениях хранится в зашифрованном виде (AES-256);' : 'заказ оформляется без контактных данных, форма поддержки не запрашивает контакты;', 'доступ к данным заказов ограничен административной сессией и секретами доступа;', 'доступ к обращениям есть только у администратора и защищён паролем и ограничением попыток входа;', 'число обращений с одного адреса ограничено.']),
    S('9. Cookie и локальное хранилище', 'Рекламные и аналитические cookie не используются. В браузере сохраняется технический код обращения, чтобы показать ответы поддержки. Для администратора используется служебная cookie сессии.'),
    S('10. Ваши права', 'Вы вправе получить сведения об обработке, потребовать уточнения или удаления данных, отозвать согласие. ' + (opMail() ? 'Напишите на ' + opMail() + ' — запрос будет рассмотрен в сроки, установленные законом.' : 'Для реализации прав используйте опубликованные контакты оператора.')),
    S('11. Изменения', 'Актуальная редакция всегда опубликована на этой странице.'), h('p', {}, h('a', { class: 'pill', href: '#' }, '← На главную'))); }

/* Согласие на обработку ПДн — отдельный документ (ч. 1 ст. 9 152-ФЗ в ред. 156-ФЗ от 24.06.2025). Нужен, когда включён сбор имени/почты. */
function consent() { const days = SITE.retentionDays;
  return h('div', { class: 'prose' }, h('h2', {}, 'Согласие на обработку персональных данных'), h('p', { class: 'muted' }, 'Настоящий документ является самостоятельным согласием и не является частью иных документов.'),
    S('Оператор', [operator() ? operator() + '.' : '', opMail() ? 'Почта для обращений: ' + opMail() + '.' : ''].filter(Boolean)),
    h('p', {}, 'Отмечая галочку в форме обращения, я свободно, своей волей и в своём интересе даю оператору согласие на обработку моих персональных данных на следующих условиях:'),
    S('Цель', 'Ответ на мои обращения по каталогу и товарам.'), S('Перечень данных', 'Имя (как я его указал), адрес электронной почты, текст моих сообщений, дата и время обращения.'),
    S('Действия с данными', 'Сбор, запись, систематизация, накопление, хранение, уточнение, использование, удаление. Обработка осуществляется с использованием средств автоматизации.'),
    S('Трансграничная передача', 'Сайт использует инфраструктуру Cloudflare. До включения сбора персональных данных оператор должен проверить законность выбранной инфраструктуры и наличие необходимых правовых оснований для передачи данных.'),
    S('Срок действия', 'До достижения цели обработки, но не дольше ' + days + ' дней с момента последней активности по обращению, либо до отзыва согласия.'),
    S('Отзыв согласия', 'Согласие может быть отозвано через опубликованные контакты оператора. После отзыва обработка прекращается, а данные удаляются в сроки, установленные законом.'), h('p', {}, h('a', { class: 'pill', href: '#support' }, '← Вернуться в поддержку'))); }

function render() { clearInterval(timer); nav(); footer(); const r = location.hash.slice(1), m = /^toy-(\d{1,6})$/.exec(r); $app.replaceChildren();
  $app.append(m && byId(+m[1]) ? toyPage(byId(+m[1])) : r === 'support' ? support() : r === 'contacts' ? contactsPage() : r === 'about' ? home() : r === 'privacy' ? privacy() : r === 'terms' ? termsPage() : r === 'consent' ? consent() : home()); if (r !== 'catalog') window.scrollTo(0, 0); }
addEventListener('hashchange', render);

/* Сначала показываем интерфейс: ошибка API/БД не должна оставлять весь сайт пустым. */
render();

async function loadInitialData() {
  const warningId = 'api-load-warning';
  try {
    const [toysResponse, siteResponse] = await Promise.all([
      fetch('/api/toys'),
      fetch('/api/site')
    ]);
    if (!toysResponse.ok || !siteResponse.ok) {
      throw new Error('API недоступен (игрушки: ' + toysResponse.status + ', настройки: ' + siteResponse.status + ')');
    }
    const [toys, site] = await Promise.all([toysResponse.json(), siteResponse.json()]);
    if (!Array.isArray(toys) || !site || typeof site !== 'object' || Array.isArray(site)) {
      throw new Error('API вернул данные в неожиданном формате');
    }
    TOYS = toys;
    SITE = { ...SITE, ...site };
    render();
  } catch (e) {
    console.error('Не удалось загрузить каталог и настройки:', e);
    document.getElementById(warningId)?.remove();
    const warning = h('div', { id: warningId, class: 'load-warning', role: 'status' },
      h('strong', {}, 'Каталог временно недоступен'),
      h('span', {}, 'Основная страница открыта, но товары и контакты не удалось загрузить. Администратору нужно проверить подключение базы D1 и раздел «Статус / ошибки».')
    );
    $app.prepend(warning);
  }
}
loadInitialData();
