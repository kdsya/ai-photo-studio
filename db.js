const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  tg.setHeaderColor?.('#09090b');
  tg.setBackgroundColor?.('#09090b');
}

const $ = id => document.getElementById(id);
const API_BASE = (window.PHOTOAI_API_URL || '').replace(/\/$/, '');
const initData = tg?.initData || '';
const tgUser = tg?.initDataUnsafe?.user || {};

let me = null, heroCards = [], packs = [], currentCategory = null, currentPack = null, selectedFiles = [];

const categoryMeta = {
  him: { title: 'Фотосессия для Парней', eyebrow: 'МУЖСКАЯ КОЛЛЕКЦИЯ', desc: 'Готовые мужские образы. Выбери фотосессию, которая подходит тебе.' },
  her: { title: 'Фотосессия для Девушек', eyebrow: 'ЖЕНСКАЯ КОЛЛЕКЦИЯ', desc: 'Эстетика, lifestyle, fashion и красивые кадры для твоей истории.' },
  couple: { title: 'Фотосессия для Двоих', eyebrow: 'КОЛЛЕКЦИЯ ДЛЯ ДВОИХ', desc: 'Два человека — одна фотосессия. Загружаете два фото, получаете серию совместных кадров.' }
};

async function api(path, opt = {}) {
  opt.headers = { ...(opt.headers || {}), 'X-Telegram-Init-Data': initData };
  const r = await fetch(API_BASE + path, opt);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Ошибка');
  return d;
}

function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  const el = $(id);
  if (el) el.classList.remove('hidden');
  window.scrollTo(0, 0);
  const homeBtn = $('homeBtn');
  if (homeBtn) homeBtn.classList.toggle('active', id === 'homeScreen');
}

function setAvatar() {
  try {
    const urls = [tgUser.photo_url, me?.user?.photo_url].filter(Boolean);
    document.querySelectorAll('#profileAvatar, #profileAvatarLarge').forEach(img => {
      if (urls[0]) {
        img.src = urls[0];
        img.classList.add('loaded');
        const parent = img.parentElement;
        if (parent) {
          const span = parent.querySelector('span');
          if (span) span.classList.add('hidden');
        }
      }
    });
    const n = (tgUser.first_name || me?.user?.first_name || 'П').trim()[0] || 'П';
    const initialEl = $('profileInitial');
    if (initialEl) initialEl.textContent = n;
    const initialLarge = $('profileInitialLarge');
    if (initialLarge) initialLarge.textContent = n;
  } catch (e) {
    console.error('setAvatar error:', e);
  }
}

function renderHero() {
  try {
    const stack = $('heroStack');
    if (!stack) return;
    stack.innerHTML = '';
    const byKey = Object.fromEntries(heroCards.map(x => [x.key, x]));
    const specs = { back: { cls: 'back-card' }, main: { cls: 'main-card' }, front: { cls: 'front-card' } };
    const order = ['her', 'him', 'couple'];
    const slots = ['back', 'main', 'front'];
    order.forEach((key, i) => {
      const c = byKey[key] || { key, title: key, image_url: '' };
      const b = document.createElement('button');
      b.className = `hero-card ${specs[slots[i]].cls}`;
      b.dataset.nav = key;
      b.innerHTML = `<div class="hero-copy-card"><strong>${esc(c.title)}</strong><small>${esc(c.description || '')}</small></div><span class="hero-arrow">↗</span>`;
      b.style.backgroundImage = `linear-gradient(160deg,transparent 35%,#000b),url('${c.image_url}')`;
      b.onclick = () => openCategory(key);
      stack.appendChild(b);
    });
    bindHeroSwipe();
    startHeroRotation();
  } catch (e) {
    console.error('renderHero error:', e);
  }
}

let heroTimer, heroIndex = 0;
function startHeroRotation() {
  clearInterval(heroTimer);
  heroTimer = setInterval(() => {
    try {
      heroIndex = (heroIndex + 1) % 3;
      const keys = ['her', 'him', 'couple'];
      const rotated = [keys[(heroIndex) % 3], keys[(heroIndex + 1) % 3], keys[(heroIndex + 2) % 3]];
      const stack = $('heroStack');
      if (!stack) return;
      [...stack.children].forEach((el, i) => el.dataset.nav = rotated[i]);
      stack.classList.add('rotating');
      setTimeout(() => stack.classList.remove('rotating'), 950);
    } catch (e) { console.error('startHeroRotation error:', e); }
  }, 4500);
}

function bindHeroSwipe() {
  let x = 0;
  const s = $('heroStack');
  if (!s) return;
  s.onpointerdown = e => { x = e.clientX; s.setPointerCapture?.(e.pointerId); };
  s.onpointerup = e => {
    try {
      if (Math.abs(e.clientX - x) > 45) {
        heroIndex = (heroIndex + (e.clientX < x ? 1 : 2)) % 3;
        const keys = ['her', 'him', 'couple'];
        const rotated = [keys[heroIndex], keys[(heroIndex + 1) % 3], keys[(heroIndex + 2) % 3]];
        [...s.children].forEach((el, i) => el.dataset.nav = rotated[i]);
        s.classList.add('rotating');
        setTimeout(() => s.classList.remove('rotating'), 950);
      }
    } catch (e) { console.error('bindHeroSwipe error:', e); }
  };
}

function openCategory(c) {
  try {
    currentCategory = c;
    const m = categoryMeta[c];
    const titleEl = $('categoryTitle');
    if (titleEl) titleEl.textContent = m.title;
    const eyebrowEl = $('categoryEyebrow');
    if (eyebrowEl) eyebrowEl.textContent = m.eyebrow;
    const descEl = $('categoryDesc');
    if (descEl) descEl.textContent = m.desc;
    const target = $('categoryShowcase');
    renderPacks(packs.filter(p => p.category === c), target);
    show('categoryScreen');
  } catch (e) { console.error('openCategory error:', e); }
}

function renderPacks(rows, target) {
  try {
    if (!target) return;
    target.innerHTML = rows.length ? rows.map(p => {
      const fav = me?.favorites?.includes(p.id);
      return `<article class="pack-card"><button class="pack-open" data-id="${p.id}"><div class="pack-image"><img src="${p.image_url || p.preview_images?.[0] || ''}" alt=""><div class="pack-gradient"></div><span class="pack-badge">${p.is_popular ? 'ПОПУЛЯРНО' : 'ФОТОСЕССИЯ'}</span></div><div class="pack-info"><b>${p.title}</b><span>${p.description || '40 кадров в одном стиле'}</span><strong>${p.price_credits} кредитов · 40 фото</strong></div></button><button class="fav ${fav ? 'on' : ''}" data-fav="${p.id}" aria-label="Избранное">${fav ? '♥' : '♡'}</button></article>`;
    }).join('') : '<div class="empty">В этой категории пока нет фотосессий. Добавь их в админке.</div>';
    target.querySelectorAll('[data-id]').forEach(b => b.onclick = () => openPack(Number(b.dataset.id)));
    target.querySelectorAll('[data-fav]').forEach(b => b.onclick = async e => {
      e.stopPropagation();
      try {
        const r = await api('/api/favorites/' + b.dataset.fav, { method: 'POST' });
        if (me) me.favorites = me.favorites || [];
        const id = Number(b.dataset.fav);
        if (r.favorite && !me.favorites.includes(id)) me.favorites.push(id);
        if (!r.favorite) me.favorites = me.favorites.filter(x => x !== id);
        b.classList.toggle('on', r.favorite);
        b.textContent = r.favorite ? '♥' : '♡';
      } catch (err) { alert(err.message); }
    });
  } catch (e) { console.error('renderPacks error:', e); }
}

async function openPack(id) {
  try {
    currentPack = await api('/api/showcase/' + id);
    selectedFiles = [];
    renderUpload(false);
    show('uploadScreen');
  } catch (e) { alert(e.message); }
}

function renderUpload(free) {
  try {
    const titleEl = $('uploadTitle');
    if (titleEl) titleEl.textContent = free ? 'Попробуй бесплатно' : 'Загрузи фото';
    const hintEl = $('uploadHint');
    if (hintEl) hintEl.textContent = free ? 'Загрузишь одно фото — получишь один тестовый AI-кадр.' : 'Выбери фото. Для совместной фотосессии нужны два снимка.';
    const couple = currentPack?.category === 'couple' && !free;
    const labels = couple ? [['sourceImage1', 'Фото первого человека'], ['sourceImage2', 'Фото второго человека']] : [['sourceImage1', 'Твоя фотография']];
    const fields = $('uploadFields');
    if (!fields) return;
    fields.innerHTML = labels.map((x, i) =>
      `<label class="upload"><input type="file" accept="image/*" data-file="${x[0]}"><div><div class="upload-icon">＋</div><strong>${x[1]}</strong><span>JPG, PNG · до 10 МБ</span><small class="file-name" data-name="${x[0]}"></small></div></label>`
    ).join('');
    fields.querySelectorAll('input').forEach(inp => {
      inp.onchange = e => {
        try {
          const f = e.target.files?.[0];
          if (!f) return;
          if (f.size > 10 * 1024 * 1024) return alert('Фото больше 10 МБ');
          const idx = selectedFiles.findIndex(x => x.name === inp.dataset.file);
          if (idx >= 0) selectedFiles[idx].file = f;
          else selectedFiles.push({ name: inp.dataset.file, file: f });
          const nameEl = inp.parentElement.querySelector('[data-name]');
          if (nameEl) nameEl.textContent = f.name;
          inp.parentElement.classList.add('has-file');
          const continueBtn = $('continueBtn');
          if (continueBtn) continueBtn.classList.toggle('disabled', selectedFiles.length < labels.length);
        } catch (err) { alert(err.message); }
      };
    });
  } catch (e) { console.error('renderUpload error:', e); }
}

function openFree() { currentPack = null; selectedFiles = []; renderUpload(true); show('uploadScreen'); }

function openConfirm() {
  try {
    const files = selectedFiles.map(x => x.file);
    if (!currentPack) { generate(true); return; }
    if (files.length < (currentPack.category === 'couple' ? 2 : 1)) return;
    const img = currentPack.image_url || currentPack.preview_images?.[0];
    const confirmImage = $('confirmImage');
    if (confirmImage) confirmImage.style.backgroundImage = `url('${img}')`;
    const catEl = $('confirmCategory');
    if (catEl) catEl.textContent = categoryMeta[currentPack.category].eyebrow;
    const titleEl = $('confirmTitle');
    if (titleEl) titleEl.textContent = currentPack.title;
    const descEl = $('confirmDescription');
    if (descEl) descEl.textContent = currentPack.description || '';
    const priceEl = $('confirmPrice');
    if (priceEl) priceEl.textContent = `${currentPack.price_credits} кредитов`;
    show('confirmScreen');
  } catch (e) { console.error('openConfirm error:', e); }
}

async function generate(free = false) {
  try {
    const fd = new FormData();
    if (currentPack) fd.append('showcaseStyleId', currentPack.id);
    fd.append('category', currentPack?.category || '');
    fd.append('free', free ? '1' : '0');
    selectedFiles.forEach(x => fd.append(x.name, x.file));
    const r = await api('/api/generations', { method: 'POST', body: fd });
    alert(r.message);
    await loadMe();
    show('profileScreen');
  } catch (e) { alert(e.message); }
}

async function loadMe() {
  try {
    me = await api('/api/me');
    if (!me || !me.user) throw new Error('Нет данных пользователя');
    
    const balanceEl = $('profileBalance');
    if (balanceEl) balanceEl.textContent = me.credits ?? 0;
    
    const nameEl = $('profileName');
    if (nameEl) nameEl.textContent = [me.user.first_name, me.user.last_name].filter(Boolean).join(' ') || 'Пользователь';
    
    const usernameEl = $('profileUsername');
    if (usernameEl) usernameEl.textContent = me.user.username ? `@${me.user.username}` : '';
    
    const freeInfoEl = $('freeInfo');
    if (freeInfoEl) freeInfoEl.textContent = me.freeAvailable > 0 ? `🎁 Бесплатных генераций: ${me.freeAvailable}` : 'Бесплатная генерация уже использована';
    
    renderHistory();
    renderFavorites();
    setAvatar();
    
    const adminWrap = $('adminLinkWrap');
    if (adminWrap) adminWrap.classList.toggle('hidden', !me.isAdmin);
  } catch (e) {
    console.error('loadMe error:', e);
    const nameEl = $('profileName');
    if (nameEl) nameEl.textContent = 'Не удалось загрузить кабинет';
    alert(e.message);
  }
}

function renderHistory() {
  try {
    const historyEl = $('history');
    if (!historyEl) return;
    historyEl.innerHTML = me.history?.length ? me.history.map(x =>
      `<div class="history-item"><b>${x.style_title || 'Генерация'}</b><span>${x.status || 'queued'} · ${x.credits_spent || 0}💎</span></div>`
    ).join('') : '<div class="empty">Пока нет генераций</div>';
  } catch (e) { console.error('renderHistory error:', e); }
}

function renderFavorites() {
  try {
    const rows = packs.filter(p => me?.favorites?.includes(p.id));
    const favsEl = $('favorites');
    if (favsEl) renderPacks(rows, favsEl);
  } catch (e) { console.error('renderFavorites error:', e); }
}

async function loadHome() {
  try {
    const [cards, packRows] = await Promise.all([api('/api/home'), api('/api/showcase')]);
    heroCards = cards;
    packs = packRows;
    renderHero();
    const showcaseEl = $('showcase');
    if (showcaseEl) renderPacks(packs.filter(p => p.is_popular), showcaseEl);
  } catch (e) {
    console.error('loadHome error:', e);
    alert(e.message);
  }
}

async function loadAdmin() {
  try {
    const s = await api('/api/admin/overview');
    const statsEl = $('adminStats');
    if (statsEl) statsEl.innerHTML = `
      <div><b>${s.users}</b><small>пользователей</small></div>
      <div><b>${s.generations}</b><small>генераций</small></div>
      <div><b>${s.packs}</b><small>активных фотосессий</small></div>
      <div><b>${s.paidCredits}</b><small>оплачено кредитов</small></div>
    `;
    await renderHeroAdmin();
    await renderPackAdmin();
    const freeData = await api('/api/admin/free');
    const freePrompt = $('freePromptInput');
    if (freePrompt) freePrompt.value = freeData.prompt;
    const freeLimit = $('freeLimitInput');
    if (freeLimit) freeLimit.value = freeData.limit;
    await renderUsers();
    show('adminScreen');
  } catch (e) { alert(e.message); }
}

async function renderHeroAdmin() {
  try {
    const rows = await api('/api/admin/hero');
    const list = $('heroAdminList');
    if (!list) return;
    list.innerHTML = rows.map(x =>
      `<div class="admin-edit-card"><div class="admin-edit-preview" style="background-image:url('${x.image_url}')"></div><div class="admin-edit-body"><small>${esc(x.key)}</small><input data-hero-title="${x.key}" value="${esc(x.title)}" placeholder="Название карточки"><textarea data-hero-desc="${x.key}" placeholder="Описание карточки">${esc(x.description || '')}</textarea><input data-hero-img="${x.key}" value="${esc(x.image_url)}" placeholder="Ссылка на изображение"><button class="secondary" onclick="saveHero('${x.key}')">Сохранить карточку</button></div></div>`
    ).join('');
  } catch (e) { console.error('renderHeroAdmin error:', e); }
}

async function renderPackAdmin() {
  try {
    const rows = await api('/api/admin/packs');
    const list = $('packAdminList');
    if (!list) return;
    list.innerHTML = rows.map(p =>
      `<details class="admin-pack"><summary><b>${esc(p.title)}</b><span>${p.category} · ${p.prompts?.length || 0}/40</span></summary><div class="admin-pack-body"><input data-p-title="${p.id}" value="${esc(p.title)}" placeholder="Название"><textarea data-p-desc="${p.id}" placeholder="Описание">${esc(p.description || '')}</textarea><input data-p-image="${p.id}" value="${esc(p.image_url || '')}" placeholder="Ссылка на изображение"><input data-p-price="${p.id}" type="number" value="${p.price_credits}"><div class="prompts-grid">${Array.from({ length: 40 }, (_, i) =>
        `<label class="prompt-row"><span>${String(i + 1).padStart(2, '0')}</span><textarea data-p-prompt="${p.id}-${i}" placeholder="Промт для фото №${i + 1}">${esc(p.prompts?.[i] || '')}</textarea></label>`
      ).join('')}</div><div class="row"><button class="secondary" onclick="savePack(${p.id})">Сохранить изменения</button><button class="secondary danger" onclick="hidePack(${p.id})">Скрыть</button></div></div></details>`
    ).join('') || '<div class="empty">Пока нет паков.</div>';
  } catch (e) { console.error('renderPackAdmin error:', e); }
}

async function renderUsers() {
  try {
    const rows = await api('/api/admin/users');
    const q = ($('userSearch')?.value || '').toLowerCase();
    const list = $('adminUsers');
    if (!list) return;
    list.innerHTML = rows.filter(u =>
      `${u.username || ''} ${u.first_name || ''} ${u.last_name || ''} ${u.telegram_id}`.toLowerCase().includes(q)
    ).map(u =>
      `<div class="history-item"><div><b>${esc([u.first_name, u.last_name].filter(Boolean).join(' ') || 'Без имени')}</b><small>${u.username ? '@' + esc(u.username) : ''} · ID ${u.telegram_id}</small></div><span>${u.credits?.[0]?.balance || 0}💎 <button onclick="changeCredits(${u.id})">±</button><button onclick="resetFree(${u.id})">free</button></span></div>`
    ).join('') || '<div class="empty">Пользователь не найден</div>';
  } catch (e) { console.error('renderUsers error:', e); }
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[m]);
}

// === ГЛОБАЛЬНЫЕ ФУНКЦИИ ДЛЯ АДМИНКИ ===
window.saveHero = async key => {
  const title = $(`[data-hero-title="${key}"]`)?.value || '';
  const description = $(`[data-hero-desc="${key}"]`)?.value || '';
  const img = $(`[data-hero-img="${key}"]`)?.value || '';
  try {
    await api('/api/admin/hero/' + key, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description, image_url: img })
    });
    await renderHeroAdmin();
    await loadHome();
    alert('Карточка сохранена');
  } catch (e) { alert(e.message); }
};

window.savePack = async id => {
  const prompts = Array.from({ length: 40 }, (_, i) =>
    String($(`[data-p-prompt="${id}-${i}"]`)?.value || '').trim()
  );
  if (prompts.some(x => !x)) return alert('Заполни все 40 промтов');
  try {
    await api('/api/admin/packs/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: $(`[data-p-title="${id}"]`)?.value || '',
        description: $(`[data-p-desc="${id}"]`)?.value || '',
        image_url: $(`[data-p-image="${id}"]`)?.value || '',
        price_credits: Number($(`[data-p-price="${id}"]`)?.value || 40),
        prompts
      })
    });
    await renderPackAdmin();
    await loadHome();
    alert('Пак сохранён');
  } catch (e) { alert(e.message); }
};

window.hidePack = async id => {
  if (!confirm('Скрыть фотосессию?')) return;
  await api('/api/admin/packs/' + id, { method: 'DELETE' });
  await renderPackAdmin();
  await loadHome();
};

window.changeCredits = async id => {
  const n = prompt('Изменить баланс (+/-):', '40');
  if (!n) return;
  await api('/api/admin/users/' + id + '/credits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: Number(n) })
  });
  renderUsers();
};

window.resetFree = async id => {
  if (!confirm('Вернуть бесплатную генерацию?')) return;
  await api('/api/admin/users/' + id + '/reset-free', { method: 'POST' });
  renderUsers();
};

// === ОБРАБОТЧИКИ СОБЫТИЙ ===
function safeAddListener(id, event, handler) {
  const el = $(id);
  if (el) el.addEventListener(event, handler);
  else console.warn(`Элемент с id "${id}" не найден, обработчик не добавлен`);
}

safeAddListener('homeBtn', 'click', () => show('homeScreen'));
safeAddListener('profileBtn', 'click', async () => { await loadMe(); show('profileScreen'); });
safeAddListener('freeBtn', 'click', openFree);
safeAddListener('categoryBackBtn', 'click', () => show('homeScreen'));
safeAddListener('uploadBackBtn', 'click', () => currentPack ? openCategory(currentPack.category) : show('homeScreen'));
safeAddListener('continueBtn', 'click', openConfirm);
safeAddListener('confirmBackBtn', 'click', () => openPack(currentPack.id));
safeAddListener('generateBtn', 'click', () => generate(false));
safeAddListener('profileBackBtn', 'click', () => show('homeScreen'));
safeAddListener('adminBackBtn', 'click', () => { loadMe(); show('profileScreen'); });
safeAddListener('topupBtn', 'click', () => alert('Пополнение подключим следующим этапом: Telegram Stars.'));
safeAddListener('adminBtn', 'click', loadAdmin);
safeAddListener('refreshAdmin', 'click', loadAdmin);
safeAddListener('userSearch', 'input', renderUsers);

const packForm = $('packForm');
if (packForm) {
  packForm.onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    body.prompts = Array.from({ length: 40 }, (_, i) => String(body[`prompt_${i + 1}`] || '').trim());
    for (let i = 1; i <= 40; i++) delete body[`prompt_${i}`];
    body.is_popular = fd.get('is_popular') ? 1 : 0;
    try {
      await api('/api/admin/packs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      e.target.reset();
      await renderPackAdmin();
      await loadHome();
      alert('Фотосессия добавлена');
    } catch (x) { alert(x.message); }
  };
}

const saveFreePromptBtn = $('saveFreePrompt');
if (saveFreePromptBtn) {
  saveFreePromptBtn.onclick = async () => {
    try {
      await api('/api/admin/free', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: $('freePromptInput')?.value || '',
          limit: Number($('freeLimitInput')?.value || 1)
        })
      });
      alert('Сохранено');
    } catch (e) { alert(e.message); }
  };
}

document.querySelectorAll('.admin-tabs button').forEach(b => {
  b.onclick = () => {
    document.querySelectorAll('.admin-tabs button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    ['cards', 'packs', 'free', 'users'].forEach(x => {
      const el = $(`admin${x[0].toUpperCase() + x.slice(1)}Tab`);
      if (el) el.classList.add('hidden');
    });
    const tab = $(`admin${b.dataset.atab[0].toUpperCase() + b.dataset.atab.slice(1)}Tab`);
    if (tab) tab.classList.remove('hidden');
  };
});

setAvatar();

(async () => {
  try {
    await loadHome();
  } catch (e) {
    console.error('loadHome error:', e);
    alert('Ошибка загрузки главной страницы: ' + e.message);
  }
})();
