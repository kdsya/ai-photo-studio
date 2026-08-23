const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  tg.setHeaderColor?.('#09090b');
  tg.setBackgroundColor?.('#09090b');
}

// === АВАТАРКА В ШАПКЕ ===
function updateProfileAvatar() {
  const avatarImg = document.getElementById('profileAvatar');
  const initialSpan = document.getElementById('profileInitial');
  
  if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
    const user = tg.initDataUnsafe.user;
    
    if (user.photo_url) {
      avatarImg.src = user.photo_url;
      avatarImg.style.display = 'block';
      initialSpan.style.display = 'none';
    } else {
      const firstName = user.first_name || 'П';
      initialSpan.textContent = firstName.charAt(0).toUpperCase();
      initialSpan.style.display = 'block';
      avatarImg.style.display = 'none';
    }
  }
}

updateProfileAvatar();

const $ = id => document.getElementById(id);
const screens = ['homeScreen','categoryScreen','uploadScreen','styleScreen','profileScreen','adminScreen'];
let currentStyle = null, selectedFile = null, me = null, allStyles = [], category = 'her';
const initData = tg?.initData || '';
const unsafeUser = tg?.initDataUnsafe?.user || {};
const localAdmin = String(unsafeUser.username || '').toLowerCase() === 'tgfsb';

const DEMO_KEY = 'photoai_demo_v3';
const demoStyles = [
  {id:1, title:'Элегантный портрет', category:'Девушки', description:'Изысканный кадр', price_credits:3, preview_images:[], is_active:1, is_popular:1},
  {id:2, title:'Деловой образ', category:'Парни', description:'Уверенный стиль', price_credits:3, preview_images:[], is_active:1, is_popular:1},
  {id:3, title:'Романтический', category:'Пары', description:'Нежные объятия', price_credits:4, preview_images:[], is_active:1, is_popular:1},
  {id:4, title:'Кинокадр', category:'Все', description:'Как из фильма', price_credits:3, preview_images:[], is_active:1, is_popular:1},
  {id:5, title:'Аниме-портрет', category:'Все', description:'Твой образ в аниме', price_credits:3, preview_images:[], is_active:1, is_popular:1},
  {id:6, title:'Спортивный', category:'Парни', description:'Энергия и драйв', price_credits:3, preview_images:[], is_active:1, is_popular:0}
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
    return { ok: true, message: 'Демо-генерация поставлена в очередь' };
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
  
  throw new Error('API недоступен в GitHub Pages');
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
  const el = $(id);
  if (el) el.classList.remove('hidden');
  window.scrollTo(0, 0);
}

function navCategory(c) {
  category = c;
  const map = {
    her: ['Девушки', 'ЖЕНСКАЯ КОЛЛЕКЦИЯ', 'Эстетика, lifestyle, fashion и кадры для соцсетей.'],
    him: ['Парни', 'МУЖСКАЯ КОЛЛЕКЦИЯ', 'Деловой, спортивный, брутальный — образы для уверенных парней.'],
    couple: ['Пары', 'КОЛЛЕКЦИЯ ДЛЯ ДВОИХ', 'Романтика, свадьба, семейные портреты и совместные кадры.']
  };
  const m = map[c];
  if (m) {
    $('categoryTitle').textContent = m[0];
    $('categoryEyebrow').textContent = m[1];
    $('categoryDesc').textContent = m[2];
  }
  const words = c === 'her' ? ['девуш','женск','her','instagram','beauty','fashion','luxury'] :
                 c === 'him' ? ['парн','муж','him','business','fitness','gaming','travel'] :
                 ['пар','couple','для двоих'];
  const rows = allStyles.filter(s => words.some(w => (s.category + ' ' + s.title).toLowerCase().includes(w)));
  renderCards(rows, $('categoryShowcase'));
  show('categoryScreen');
}

function renderCards(rows, target) {
  if (!target) return;
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
  const stylesEl = $('styles');
  if (!stylesEl) return;
  stylesEl.innerHTML = allStyles.map(s => `
    <button class="style ${currentStyle?.id === s.id ? 'active' : ''}" data-id="${s.id}">
      <span>${s.is_popular ? '🔥 ' : ''}${s.title}</span>
      <small>${s.price_credits}💎 · ${s.category}</small>
    </button>
  `).join('');
  stylesEl.querySelectorAll('[data-id]').forEach(b => {
    b.onclick = () => {
      currentStyle = allStyles.find(x => x.id == b.dataset.id);
      stylesEl.querySelectorAll('.style').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
    };
  });
  show('styleScreen');
}

async function loadMe() {
  try {
    const response = await api('/api/me');
    me = response;
    
    const profileName = document.getElementById('profileName');
    const profileUsername = document.getElementById('profileUsername');
    const profileBalance = document.getElementById('profileBalance');
    const freeInfo = document.getElementById('freeInfo');
    const adminLinkWrap = document.getElementById('adminLinkWrap');
    const historyEl = document.getElementById('history');
    const paymentsEl = document.getElementById('payments');
    
    if (profileName) {
      profileName.textContent = [me.user?.first_name, me.user?.last_name].filter(Boolean).join(' ') || 'Пользователь';
    }
    if (profileUsername) {
      profileUsername.textContent = me.user?.username ? `@${me.user.username}` : '';
    }
    if (profileBalance) {
      profileBalance.textContent = me.credits || 0;
    }
    if (freeInfo) {
      freeInfo.textContent = me.freeAvailable > 0 ? `🎁 Бесплатных генераций: ${me.freeAvailable}` : 'Бесплатная генерация уже использована';
    }
    
    if (historyEl) {
      historyEl.innerHTML = me.history?.length ? me.history.map(g => `
        <div class="history-item">
          <b>${g.style_title || 'Образ'}</b>
          <span>${g.status} · ${g.credits_spent}💎</span>
        </div>
      `).join('') : '<div class="empty">Пока нет генераций</div>';
    }
    
    if (paymentsEl) {
      paymentsEl.innerHTML = me.purchases?.length ? me.purchases.map(p => `
        <div class="history-item">
          <b>${p.description || 'Пополнение'}</b>
          <span>+${p.credits}💎 · ${p.status}</span>
        </div>
      `).join('') : '<div class="empty">Пока нет платежей</div>';
    }
    
    const isAdmin = me.isAdmin === true || localAdmin;
    if (adminLinkWrap) {
      adminLinkWrap.classList.toggle('hidden', !isAdmin);
    }
  } catch (e) {
    console.error('LoadMe error:', e);
    const profileName = document.getElementById('profileName');
    const freeInfo = document.getElementById('freeInfo');
    if (profileName) profileName.textContent = 'Открой из Telegram';
    if (freeInfo) freeInfo.textContent = 'Авторизация доступна только внутри Telegram Mini App';
  }
}

async function loadShowcase() {
  allStyles = await api('/api/showcase');
  const stylesEl = $('styles');
  if (stylesEl) {
    stylesEl.innerHTML = allStyles.map(s => `
      <button class="style" data-id="${s.id}">
        <span>${s.is_popular ? '🔥 ' : ''}${s.title}</span>
        <small>${s.price_credits}💎 · ${s.category}</small>
      </button>
    `).join('');
    stylesEl.querySelectorAll('[data-id]').forEach(b => {
      b.onclick = () => {
        currentStyle = allStyles.find(x => x.id == b.dataset.id);
        stylesEl.querySelectorAll('.style').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
      };
    });
  }
}

// === ОБРАБОТЧИКИ КНОПОК ===

// Три карточки-меню
document.querySelectorAll('.menu-card').forEach(card => {
  card.addEventListener('click', () => {
    const nav = card.dataset.nav;
    if (nav === 'her' || nav === 'him' || nav === 'couple') {
      navCategory(nav);
    }
  });
});

// Аватарка → профиль
const profileBtn = document.getElementById('profileBtn');
if (profileBtn) {
  profileBtn.onclick = async () => {
    await loadMe();
    show('profileScreen');
  };
}

// Кнопка "Создать фото" на главной
const startBtn = $('startBtn');
if (startBtn) startBtn.onclick = () => show('uploadScreen');

// Назад из категории
const categoryBackBtn = document.getElementById('categoryBackBtn');
if (categoryBackBtn) {
  categoryBackBtn.addEventListener('click', () => show('homeScreen'));
}

// Назад из загрузки
const backBtn = $('backBtn');
if (backBtn) backBtn.onclick = () => show('homeScreen');

// Назад из выбора стиля
const styleBackBtn = $('styleBackBtn');
if (styleBackBtn) styleBackBtn.onclick = () => show('uploadScreen');

// Назад из профиля
const profileBackBtn = $('profileBackBtn');
if (profileBackBtn) {
  profileBackBtn.addEventListener('click', () => show('homeScreen'));
}

// Назад из админки
const adminBackBtn = $('adminBackBtn');
if (adminBackBtn) {
  adminBackBtn.onclick = () => {
    loadMe();
    show('profileScreen');
  };
}

// Загрузка фото
const photoInput = $('photoInput');
if (photoInput) {
  photoInput.onchange = e => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) return alert('Фото больше 10 МБ');
    selectedFile = f;
    $('previewImg').src = URL.createObjectURL(f);
    $('photoPreview').classList.remove('hidden');
    $('continueBtn').classList.remove('disabled');
  };
}

// Продолжить после загрузки фото
const continueBtn = $('continueBtn');
if (continueBtn) continueBtn.onclick = () => show('styleScreen');

// Генерация
const generateBtn = $('generateBtn');
if (generateBtn) {
  generateBtn.onclick = async () => {
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
      alert(e.message === 'Not enough credits' ? 'Не хватает кредитов. Пополни баланс.' : e.message);
    }
  };
}

// Пополнение баланса
const topupBtn = $('topupBtn');
if (topupBtn) {
  topupBtn.onclick = async () => {
    const n = prompt('Демо-пополнение. Кредитов:', '20');
    if (!n) return;
    try {
      await api('/api/credits/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credits: Number(n) })
      });
      await loadMe();
    } catch (e) {
      alert(e.message);
    }
  };
}

// Админка
const adminBtn = $('adminBtn');
if (adminBtn) adminBtn.onclick = loadAdmin;

async function loadAdmin() {
  try {
    const s = await api('/api/admin/overview');
    $('adminStats').innerHTML = `
      <div>👥 <b>${s.users}</b><small>пользователей</small></div>
      <div>⚡ <b>${s.generations}</b><small>генераций</small></div>
      <div>💎 <b>${s.paidCredits}</b><small>оплачено кредитов</small></div>
      <div>✦ <b>${s.activeShowcase}</b><small>активных образов</small></div>
    `;
    const settings = await api('/api/admin/settings');
    $('freeLimitInput').value = settings.freeGenerationLimit;
    await renderAdminUsers();
    await renderAdminShowcase();
    show('adminScreen');
  } catch (e) {
    alert(e.message);
  }
}

async function renderAdminUsers() {
  const users = await api('/api/admin/users');
  const q = ($('userSearch').value || '').toLowerCase();
  const rows = users.filter(u => `${u.username||''} ${u.first_name||''} ${u.last_name||''}`.toLowerCase().includes(q));
  $('adminUsers').innerHTML = rows.map(u => `
    <div class="history-item">
      <div>
        <b>${[u.first_name,u.last_name].filter(Boolean).join(' ') || 'Без имени'}</b>
        <div style="color:#666;font-size:9px">${u.username?'@'+u.username:'нет username'} · ID ${u.telegram_id}</div>
      </div>
      <span>${u.balance}💎 <button onclick="changeCredits(${u.id})">±</button><button onclick="resetFree(${u.id})">1 free</button></span>
    </div>
  `).join('') || '<div class="empty">Пользователь не найден</div>';
}

async function renderAdminShowcase() {
  const styles = await api('/api/admin/showcase');
  $('adminShowcase').innerHTML = styles.map(s => `
    <div class="history-item">
      <b>${s.title}<small style="display:block;color:#666">${s.category} · ${s.price_credits}💎</small></b>
      <span>${s.is_active?'виден':'скрыт'} <button onclick="toggleStyle(${s.id},${s.is_active?0:1})">${s.is_active?'скрыть':'показать'}</button></span>
    </div>
  `).join('');
}

window.changeCredits = async id => {
  const n = prompt('Изменить баланс (+/-):', '10');
  if (!n) return;
  try {
    await api('/api/admin/users/' + id + '/credits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: Number(n) })
    });
    renderAdminUsers();
  } catch (e) {
    alert(e.message);
  }
};

window.resetFree = async id => {
  if (!confirm('Вернуть пользователю бесплатную генерацию?')) return;
  try {
    await api('/api/admin/users/' + id + '/reset-free', {
      method: 'POST'
    });
    renderAdminUsers();
  } catch (e) {
    alert(e.message);
  }
};

window.toggleStyle = async (id, v) => {
  try {
    await api('/api/admin/showcase/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: v })
    });
    await renderAdminShowcase();
    await loadShowcase();
  } catch (e) {
    alert(e.message);
  }
};

const showcaseForm = $('showcaseForm');
if (showcaseForm) {
  showcaseForm.onsubmit = async e => {
    e.preventDefault();
    try {
      await api('/api/admin/showcase', {
        method: 'POST',
        body: new FormData(e.target)
      });
      e.target.reset();
      await renderAdminShowcase();
      await loadShowcase();
    } catch (x) {
      alert(x.message);
    }
  };
}

const saveSettings = $('saveSettings');
if (saveSettings) {
  saveSettings.onclick = async () => {
    try {
      await api('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ freeGenerationLimit: Number($('freeLimitInput').value) })
      });
      alert('Сохранено');
    } catch (e) {
      alert(e.message);
    }
  };
}

const userSearch = $('userSearch');
if (userSearch) userSearch.oninput = () => renderAdminUsers();

const refreshAdmin = $('refreshAdmin');
if (refreshAdmin) refreshAdmin.onclick = loadAdmin;

document.querySelectorAll('.admin-tabs button').forEach(b => {
  b.onclick = () => {
    document.querySelectorAll('.admin-tabs button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    ['users','showcase','settings'].forEach(x => $(`admin${x[0].toUpperCase()+x.slice(1)}Tab`).classList.add('hidden'));
    $(`admin${b.dataset.atab[0].toUpperCase()+b.dataset.atab.slice(1)}Tab`).classList.remove('hidden');
  };
});

(async () => {
  try {
    await loadShowcase();
    if (localAdmin && tg?.initData) {
      setTimeout(() => loadMe().then(() => loadAdmin()), 350);
    }
  } catch (e) {
    console.error('Startup error:', e);
  }
})();
