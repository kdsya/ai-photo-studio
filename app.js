const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  tg.setHeaderColor?.('#09090b');
  tg.setBackgroundColor?.('#09090b');
}

const $ = id => document.getElementById(id);
const screens = ['homeScreen','categoryScreen','uploadScreen','styleScreen','profileScreen','adminScreen'];
let currentStyle = null, selectedFile = null, me = null, allStyles = [], category = 'her';
const initData = tg?.initData || '';
const unsafeUser = tg?.initDataUnsafe?.user || {};
const localAdmin = String(unsafeUser.username || '').toLowerCase() === 'tgfsb';

const DEMO_KEY = 'photoai_demo_v3';
const demoStyles = [
  {id:1, title:'Luxury', category:'Для неё', description:'Премиальный образ', price_credits:3, preview_images:[], is_active:1, is_popular:1},
  {id:2, title:'Business', category:'Для него', description:'Деловой образ', price_credits:2, preview_images:[], is_active:1, is_popular:0},
  {id:3, title:'Cinematic', category:'Все', description:'Кадр как из фильма', price_credits:3, preview_images:[], is_active:1, is_popular:1},
  {id:4, title:'Fitness', category:'Для него', description:'Спортивная атмосфера', price_credits:2, preview_images:[], is_active:1, is_popular:0},
  {id:5, title:'Instagram', category:'Для неё', description:'Стиль для соцсетей', price_credits:2, preview_images:[], is_active:1, is_popular:1},
  {id:6, title:'Парная фотосессия ❤️', category:'Пары', description:'Совместные кадры', price_credits:4, preview_images:[], is_active:1, is_popular:1}
];

function demoState() {
  try {
    return JSON.parse(localStorage.getItem(DEMO_KEY)) || {credits:0, free:1, history:[], payments:[], styles:demoStyles, users:[]};
  } catch {
    return {credits:0, free:1, history:[], payments:[], styles:demoStyles, users:[]};
  }
}

function saveDemo(x) {
  localStorage.setItem(DEMO_KEY, JSON.stringify(x));
  return x;
}

function demoApi(path, options = {}) {
  const st = demoState();
  const method = (options.method || 'GET').toUpperCase();
  const u = unsafeUser;
  
  if (path === '/api/showcase') return st.styles.filter(x => x.is_active);
  
  if (path === '/api/me') {
    const user = {
      id: u.id || 'demo',
      telegram_id: String(u.id || 'demo'),
      username: u.username || 'tgfsb',
      first_name: u.first_name || 'Пользователь',
      last_name: u.last_name || ''
    };
    return {
      user,
      credits: st.credits,
      freeAvailable: st.free,
      history: st.history,
      purchases: st.payments,
      isAdmin: localAdmin
    };
  }
  
  if (path === '/api/admin/overview') {
    if (!localAdmin) throw new Error('Admin access denied');
    return {
      users: st.users.length,
      generations: st.history.length,
      paidCredits: st.payments.reduce((a,p) => a + p.credits, 0),
      activeShowcase: st.styles.filter(x => x.is_active).length
    };
  }
  
  if (path === '/api/admin/settings' && method === 'GET') {
    if (!localAdmin) throw new Error('Admin access denied');
    return { freeGenerationLimit: st.freeLimit ?? 1 };
  }
  
  if (path === '/api/admin/users') {
    if (!localAdmin) throw new Error('Admin access denied');
    return st.users;
  }
  
  if (path === '/api/admin/showcase') {
    if (!localAdmin) throw new Error('Admin access denied');
    return st.styles;
  }
  
  if (path === '/api/admin/settings' && method === 'PATCH') {
    if (!localAdmin) throw new Error('Admin access denied');
    const body = JSON.parse(options.body || '{}');
    st.freeLimit = Number(body.freeGenerationLimit || 0);
    saveDemo(st);
    return { ok: true };
  }
  
  if (path === '/api/credits/topup' && method === 'POST') {
    const body = JSON.parse(options.body || '{}');
    const n = Number(body.credits || 0);
    st.credits += n;
    st.payments.unshift({ credits: n, status: 'demo', description: 'Демо-пополнение' });
    saveDemo(st);
    return { ok: true };
  }
  
  if (path === '/api/generations' && method === 'POST') {
    const body = JSON.parse(options.body || '{}');
    const style = st.styles.find(x => x.id === Number(body.showcaseStyleId));
    if (!style) throw new Error('Style not found');
    const useFree = st.free > 0;
    if (useFree) st.free--;
    else if (st.credits >= style.price_credits) st.credits -= style.price_credits;
    else throw new Error('Not enough credits');
    st.history.unshift({ style_title: style.title, status: 'queued', credits_spent: useFree ? 0 : style.price_credits });
    saveDemo(st);
    return { ok: true, message: 'Демо-генерация поставлена в очередь. Для реального AI подключите бэкенд.' };
  }
  
  const m = path.match(/^\/api\/admin\/users\/(\d+)\/credits$/);
  if (m && method === 'POST') {
    if (!localAdmin) throw new Error('Admin access denied');
    const body = JSON.parse(options.body || '{}');
    const u0 = st.users.find(x => x.id === Number(m[1]));
    if (!u0) throw new Error('User not found');
    u0.balance = Math.max(0, u0.balance + Number(body.amount || 0));
    saveDemo(st);
    return { ok: true };
  }
  
  const rf = path.match(/^\/api\/admin\/users\/(\d+)\/reset-free$/);
  if (rf && method === 'POST') {
    if (!localAdmin) throw new Error('Admin access denied');
    saveDemo(st);
    return { ok: true };
  }
  
  const ts = path.match(/^\/api\/admin\/showcase\/(\d+)$/);
  if (ts && method === 'PATCH') {
    if (!localAdmin) throw new Error('Admin access denied');
    const body = JSON.parse(options.body || '{}');
    const x = st.styles.find(x => x.id === Number(ts[1]));
    Object.assign(x, body);
    saveDemo(st);
    return { ok: true };
  }
  
  if (path === '/api/admin/showcase' && method === 'POST') {
    if (!localAdmin) throw new Error('Admin access denied');
    const fd = options.body;
    const title = fd.get('title');
    const s = {
      id: Date.now(),
      title,
      category: fd.get('category') || 'Другое',
      description: fd.get('description') || '',
      price_credits: Number(fd.get('priceCredits') || 1),
      is_active: 1,
      is_popular: fd.get('isPopular') ? 1 : 0,
      preview_images: []
    };
    st.styles.push(s);
    saveDemo(st);
    return { ok: true, id: s.id };
  }
  
  throw new Error('API недоступен в GitHub Pages. Для полного режима запустите Node-бэкенд.');
}

const api = async (path, options = {}) => {
  options.headers = {
    ...(options.headers || {}),
    'X-Telegram-Init-Data': initData
  };
  try {
    const r = await fetch(path, options);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Ошибка');
    return d;
  } catch (e) {
    return demoApi(path, options);
  }
};

function show(id) {
  screens.forEach(x => $(x).classList.add('hidden'));
  $(id).classList.remove('hidden');
  window.scrollTo(0, 0);
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
  const n = document.querySelector(`.nav-item[data-nav="${id}"]`);
  if (n) n.classList.add('active');
}

function navCategory(c) {
  category = c;
  const map = {
    her: ['Для неё', 'ЖЕНСКАЯ КОЛЛЕКЦИЯ', 'Эстетика, lifestyle, fashion и кадры для соцсетей.'],
    him: ['Для него', 'МУЖСКАЯ КОЛЛЕКЦИЯ', 'Business, fitness, travel и уверенные мужские образы.'],
    couple: ['Парные', 'КОЛЛЕКЦИЯ ДЛЯ ДВОИХ', 'Совместные кадры — романтика, lifestyle и кино.']
  };
  const m = map[c];
  $('categoryTitle').textContent = m[0];
  $('categoryEyebrow').textContent = m[1];
  $('categoryDesc').textContent = m[2];
  const words = c === 'her' ? ['девуш','женск','her','instagram','beauty','fashion','luxury'] :
                 c === 'him' ? ['парн','муж','him','business','fitness','gaming','travel'] :
                 ['пар','couple','для двоих'];
  const rows = allStyles.filter(s => words.some(w => (s.category + ' ' + s.title).toLowerCase().includes(w)));
  renderCards(rows, $('categoryShowcase'));
  show('categoryScreen');
}

function renderCards(rows, target) {
  target.innerHTML = rows.length ? rows.map(s => `
    <button class="showcase-item" data-id="${s.id}">
      <div class="showcase-image">${s.preview_images?.[0] ? `<img src="${s.preview_images[0]}" alt="">` : '✦'}</div>
      <b>${s.title}</b>
      <span>${s.category} · ${s.price_credits}💎</span>
    </button>
  `).join('') : '<div class="empty" style="grid-column:1/-1">Скоро добавим новые образы</div>';
  target.querySelectorAll('[data-id]').forEach(b => b.onclick = () => selectStyle(Number(b.dataset.id)));
}

function selectStyle(id) {
  currentStyle = allStyles.find(x => x.id === id);
  $('styles').innerHTML = allStyles.map(s => `
    <button class="style ${currentStyle?.id === s.id ? 'active' : ''}" data-id="${s.id}">
      <span>${s.is_popular ? '🔥 ' : ''}${s.title}</span>
      <small>${s.price_credits}💎 · ${s.category}</small>
    </button>
  `).join('');
  $('styles').querySelectorAll('[data-id]').forEach(b => {
    b.onclick = () => {
      currentStyle = allStyles.find(x => x.id == b.dataset.id);
      $('styles').querySelectorAll('.style').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
    };
  });
  show('styleScreen');
}

async function loadMe() {
  try {
    me = await api('/api/me');
    $('profileBalance').textContent = me.credits;
    $('profileName').textContent = [me.user.first_name, me.user.last_name].filter(Boolean).join(' ') || 'Пользователь';
    $('profileUsername').textContent = me.user.username ? `@${me.user.username}` : '';
    $('freeInfo').textContent = me.freeAvailable > 0 ? `🎁 Бесплатных генераций: ${me.freeAvailable}` : 'Бесплатная генерация уже использована';
    renderHistory(me);
    
    // Проверяем, админ ли пользователь (из данных с сервера)
    const isAdmin = me.isAdmin === true || localAdmin;
    $('adminLinkWrap').classList.toggle('hidden', !isAdmin);
  } catch (e) {
    $('profileName').textContent = 'Открой из Telegram';
    $('freeInfo').textContent = 'Авторизация доступна только внутри Telegram Mini App';
  }
}

function renderHistory(x) {
  $('history').innerHTML = x.history.length ? x.history.map(g => `
    <div class="history-item">
      <b>${g.style_title || 'Образ'}</b>
      <span>${g.status} · ${g.credits_spent}💎</span>
    </div>
  `).join('') : '<div class="empty">Пока нет генераций</div>';
  $('payments').innerHTML = x.purchases.length ? x.purchases.map(p => `
    <div class="history-item">
      <b>${p.description || 'Пополнение'}</b>
      <span>+${p.credits}💎 · ${p.status}</span>
    </div>
  `).join('') : '<div class="empty">Пока нет платежей</div>';
}

async function loadShowcase() {
  allStyles = await api('/api/showcase');
  renderCards(allStyles.slice(0, 6), $('showcase'));
  $('styles').innerHTML = allStyles.map(s => `
    <button class="style" data-id="${s.id}">
      <span>${s.is_popular ? '🔥 ' : ''}${s.title}</span>
      <small>${s.price_credits}💎 · ${s.category}</small>
    </button>
  `).join('');
  $('styles').querySelectorAll('[data-id]').forEach(b => {
    b.onclick = () => {
      currentStyle = allStyles.find(x => x.id == b.dataset.id);
      $('styles').querySelectorAll('.style').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
    };
  });
}

// Навигация
document.querySelectorAll('.nav-item').forEach(b => {
  b.onclick = async () => {
    const n = b.dataset.nav;
    if (['her', 'him', 'couple'].includes(n)) navCategory(n);
    else if (n === 'profileScreen') {
      await loadMe();
      show(n);
    } else show(n);
  };
});

$('startBtn').onclick = () => show('uploadScreen');
$('profileBtn').onclick = async () => {
  await loadMe();
  show('profileScreen');
};
$('backBtn').onclick = () => show('homeScreen');
$('styleBackBtn').onclick = () => show('uploadScreen');
$('profileBackBtn')?.addEventListener('click', () => show('homeScreen'));
$('adminBackBtn').onclick = () => {
  loadMe();
  show('profileScreen');
};

$('photoInput').onchange = e => {
  const f = e.target.files?.[0];
  if (!f) return;
  if (f.size > 10 * 1024 * 1024) return alert('Фото больше 10 МБ');
  selectedFile = f;
  $('previewImg').src = URL.createObjectURL(f);
  $('photoPreview').classList.remove('hidden');
  $('continueBtn').classList.remove('disabled');
};

$('continueBtn').onclick = () => show('styleScreen');

$('generateBtn').onclick = async () => {
  if (!currentStyle) return alert('Выбери образ');
  try {
    const result = await api('/api/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ showcaseStyleId: currentStyle.id, sourceImage: selectedFile?.name })
    });
    alert(result.message);
    await loadMe();
    show('profileScreen');
  } catch (e) {
    alert(e.message === 'Not enough credits' ? '
