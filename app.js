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

let me = null,
  heroCards = [],
  packs = [],
  currentCategory = null,
  currentPack = null,
  selectedFiles = [];

const categoryMeta = {
  him: {
    title: 'Фотосессия для Парней',
    eyebrow: 'МУЖСКАЯ КОЛЛЕКЦИЯ',
    desc: 'Готовые мужские образы. Выбери фотосессию, которая подходит тебе.'
  },
  her: {
    title: 'Фотосессия для Девушек',
    eyebrow: 'ЖЕНСКАЯ КОЛЛЕКЦИЯ',
    desc: 'Эстетика, lifestyle, fashion и красивые кадры для твоей истории.'
  },
  couple: {
    title: 'Фотосессия для Двоих',
    eyebrow: 'КОЛЛЕКЦИЯ ДЛЯ ДВОИХ',
    desc: 'Два человека — одна фотосессия. Загружаете два фото, получаете серию совместных кадров.'
  }
};

async function api(path, opt = {}) {
  opt.headers = {
    ...(opt.headers || {}),
    'X-Telegram-Init-Data': initData
  };

  try {
    const r = await fetch(API_BASE + path, opt);
    const d = await r.json().catch(() => ({}));

    if (!r.ok) {
      console.error('API error:', path, r.status, d);
      throw new Error(d.error || 'Ошибка сервера');
    }

    return d;
  } catch (error) {
    console.error(`API ${path} failed:`, error);
    throw error;
  }
}

function show(id) {
  console.log('Showing screen:', id);
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  const target = $(id);
  if (target) {
    target.classList.remove('hidden');
  } else {
    console.error('Screen not found:', id);
  }
  window.scrollTo(0, 0);
  const homeBtn = $('homeBtn');
  if (homeBtn) {
    homeBtn.classList.toggle('active', id === 'homeScreen');
  }
}

function setAvatar() {
  // Пробуем получить фото из разных источников
  const photoUrl = tgUser?.photo_url || me?.user?.photo_url || null;

  // Находим все элементы аватарок
  const avatars = document.querySelectorAll('#profileAvatar, #profileAvatarLarge');
  const initials = document.querySelectorAll('#profileInitial, #profileInitialLarge');

  // Получаем имя для инициалов
  const firstName = tgUser?.first_name || me?.user?.first_name || 'Пользователь';
  const initial = firstName.trim()[0] || 'П';

  // Обновляем инициалы (всегда)
  initials.forEach(el => {
    el.textContent = initial.toUpperCase();
  });

  // Обновляем аватарки
  avatars.forEach(img => {
    const parent = img.parentElement;
    const initialSpan = parent?.querySelector('span');

    if (photoUrl && photoUrl.length > 0) {
      // Есть фото - показываем его
      img.src = photoUrl;
      img.style.display = 'block';
      img.classList.add('loaded');

      // Скрываем инициалы
      if (initialSpan) initialSpan.classList.add('hidden');
    } else {
      // Нет фото - показываем инициалы
      img.style.display = 'none';
      img.classList.remove('loaded');
      img.src = '';

      // Показываем инициалы
      if (initialSpan) {
        initialSpan.classList.remove('hidden');
        initialSpan.textContent = initial.toUpperCase();
      }
    }
  });
}

function renderHero() {
  const stack = $('heroStack');
  stack.innerHTML = '';
  const byKey = Object.fromEntries(heroCards.map(x => [x.key, x]));
  const specs = {
    back: { cls: 'back-card' },
    main: { cls: 'main-card' },
    front: { cls: 'front-card' }
  };
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
}

let heroTimer,
  heroIndex = 0;

function startHeroRotation() {
  clearInterval(heroTimer);
  heroTimer = setInterval(() => {
    heroIndex = (heroIndex + 1) % 3;
    const keys = ['her', 'him', 'couple'];
    const rotated = [keys[(heroIndex) % 3], keys[(heroIndex + 1) % 3], keys[(heroIndex + 2) % 3]];
    const stack = $('heroStack');
    [...stack.children].forEach((el, i) => el.dataset.nav = rotated[i]);
    stack.classList.add('rotating');
    setTimeout(() => stack.classList.remove('rotating'), 950);
  }, 4500);
}

function bindHeroSwipe() {
  let x = 0;
  const s = $('heroStack');
  s.onpointerdown = e => {
    x = e.clientX;
    s.setPointerCapture?.(e.pointerId);
  };
  s.onpointerup = e => {
    if (Math.abs(e.clientX - x) > 45) {
      heroIndex = (heroIndex + (e.clientX < x ? 1 : 2)) % 3;
      const keys = ['her', 'him', 'couple'];
      const rotated = [keys[heroIndex], keys[(heroIndex + 1) % 3], keys[(heroIndex + 2) % 3]];
      [...s.children].forEach((el, i) => el.dataset.nav = rotated[i]);
      s.classList.add('rotating');
      setTimeout(() => s.classList.remove('rotating'), 950);
    }
  };
}

function openCategory(c) {
  currentCategory = c;
  const m = categoryMeta[c];
  $('categoryTitle').textContent = m.title;
  $('categoryEyebrow').textContent = m.eyebrow;
  $('categoryDesc').textContent = m.desc;
  renderPacks(packs.filter(p => p.category === c), $('categoryShowcase'));
  show('categoryScreen');
}

function renderPacks(rows, target) {
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
    } catch (err) {
      alert(err.message);
    }
  });
}

async function openPack(id) {
  try {
    currentPack = await api('/api/showcase/' + id);
    selectedFiles = [];
    renderUpload(false);
    show('uploadScreen');
  } catch (e) {
    alert(e.message);
  }
}

function renderUpload(free) {
  $('uploadTitle').textContent = free ? 'Попробуй бесплатно' : 'Загрузи фото';
  $('uploadHint').textContent = free ? 'Загрузишь одно фото — получишь один тестовый AI-кадр.' : 'Выбери фото. Для совместной фотосессии нужны два снимка.';
  const couple = currentPack?.category === 'couple' && !free;
  const labels = couple ? [
    ['sourceImage1', 'Фото первого человека'],
    ['sourceImage2', 'Фото второго человека']
  ] : [
    ['sourceImage1', 'Твоя фотография']
  ];
  $('uploadFields').innerHTML = labels.map((x, i) => `<label class="upload"><input type="file" accept="image/*" data-file="${x[0]}"><div><div class="upload-icon">＋</div><strong>${x[1]}</strong><span>JPG, PNG · до 10 МБ</span><small class="file-name" data-name="${x[0]}"></small></div></label>`).join('');
  $('uploadFields').querySelectorAll('input').forEach(inp => inp.onchange = e => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) return alert('Фото больше 10 МБ');
    const idx = selectedFiles.findIndex(x => x.name === inp.dataset.file);
    if (idx >= 0) selectedFiles[idx].file = f;
    else selectedFiles.push({ name: inp.dataset.file, file: f });
    const n = inp.parentElement.querySelector('[data-name]');
    n.textContent = f.name;
    inp.parentElement.classList.add('has-file');
    $('continueBtn').classList.toggle('disabled', selectedFiles.length < labels.length);
  });
}

function openFree() {
  currentPack = null;
  selectedFiles = [];
  renderUpload(true);
  show('uploadScreen');
}

function openConfirm() {
  const files = selectedFiles.map(x => x.file);
  if (!currentPack) {
    generate(true);
    return;
  }
  if (files.length < (currentPack.category === 'couple' ? 2 : 1)) return;
  const img = currentPack.image_url || currentPack.preview_images?.[0];
  $('confirmImage').style.backgroundImage = `url('${img}')`;
  $('confirmCategory').textContent = categoryMeta[currentPack.category].eyebrow;
  $('confirmTitle').textContent = currentPack.title;
  $('confirmDescription').textContent = currentPack.description || '';
  $('confirmPrice').textContent = `${currentPack.price_credits} кредитов`;
  show('confirmScreen');
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
  } catch (e) {
    alert(e.message);
  }
}

async function loadMe() {
  try {
    console.log('Loading profile...');
    const response = await api('/api/me');
    me = response;

    console.log('Profile loaded:', me);

    // Проверяем что данные получены
    if (!me || !me.user) {
      throw new Error('Не удалось загрузить данные пользователя');
    }

    // Обновляем баланс
    const balanceEl = $('profileBalance');
    if (balanceEl) {
      balanceEl.textContent = me.credits || 0;
    }

    // Обновляем имя
    const nameEl = $('profileName');
    if (nameEl) {
      const fullName = [me.user.first_name, me.user.last_name]
        .filter(Boolean)
        .join(' ') || 'Пользователь';
      nameEl.textContent = fullName;
    }

    // Обновляем username
    const usernameEl = $('profileUsername');
    if (usernameEl) {
      usernameEl.textContent = me.user.username ? `@${me.user.username}` : '';
    }

    // Обновляем информацию о бесплатной генерации
    const freeInfoEl = $('freeInfo');
    if (freeInfoEl) {
      freeInfoEl.textContent = me.freeAvailable > 0 ?
        `🎁 Бесплатных генераций: ${me.freeAvailable}` :
        'Бесплатная генерация уже использована';
    }

    // Рендерим историю и избранное
    renderHistory();
    renderFavorites();

    // Обновляем аватарку
    setAvatar();

    // Показываем/скрываем админку
    const adminLink = $('adminLinkWrap');
    if (adminLink) {
      if (me.isAdmin) {
        adminLink.classList.remove('hidden');
      } else {
        adminLink.classList.add('hidden');
      }
    }

    console.log('Profile loaded successfully');

  } catch (error) {
    console.error('loadMe error:', error);
    const nameEl = $('profileName');
    if (nameEl) {
      nameEl.textContent = 'Ошибка загрузки профиля';
    }
    // Показываем кнопку для повторной попытки
    alert('Не удалось загрузить профиль. Пожалуйста, обновите страницу.');
  }
}

function renderHistory() {
  $('history').innerHTML = me.history?.length ? me.history.map(x => `<div class="history-item"><b>${x.style_title || 'Генерация'}</b><span>${x.status || 'queued'} · ${x.credits_spent || 0}💎</span></div>`).join('') : '<div class="empty">Пока нет генераций</div>';
}

function renderFavorites() {
  const rows = packs.filter(p => me?.favorites?.includes(p.id));
  renderPacks(rows, $('favorites'));
}

async function loadHome() {
  const [cards, packRows] = await Promise.all([
    api('/api/home'),
    api('/api/showcase')
  ]);
  heroCards = cards;
  packs = packRows;
  renderHero();
  renderPacks(packs.filter(p => p.is_popular), $('showcase'));
}

async function loadAdmin() {
  try {
    const s = await api('/api/admin/overview');
    $('adminStats').innerHTML = `<div><b>${s.users}</b><small>пользователей</small></div><div><b>${s.generations}</b><small>генераций</small></div><div><b>${s.packs}</b><small>активных фотосессий</small></div><div><b>${s.paidCredits}</b><small>оплачено кредитов</small></div>`;
    await renderHeroAdmin();
    await renderPackAdmin();
    const f = await api('/api/admin/free');
    $('freePromptInput').value = f.prompt;
    $('freeLimitInput').value = f.limit;
    await renderUsers();
    show('adminScreen');
  } catch (e) {
    alert(e.message);
  }
}

async function renderHeroAdmin() {
  const rows = await api('/api/admin/hero');
  $('heroAdminList').innerHTML = rows.map(x => `<div class="admin-edit-card"><div class="admin-edit-preview" style="background-image:url('${x.image_url}')"></div><div class="admin-edit-body"><small>${esc(x.key)}</small><input data-hero-title="${x.key}" value="${esc(x.title)}" placeholder="Название карточки"><textarea data-hero-desc="${x.key}" placeholder="Описание карточки">${esc(x.description || '')}</textarea><input data-hero-img="${x.key}" value="${esc(x.image_url)}" placeholder="Ссылка на изображение"><button class="secondary" onclick="saveHero('${x.key}')">Сохранить карточку</button></div></div>`).join('');
}

async function renderPackAdmin() {
  const rows = await api('/api/admin/packs');
  $('packAdminList').innerHTML = rows.map(p => `<details class="admin-pack"><summary><b>${esc(p.title)}</b><span>${p.category} · ${p.prompts?.length || 0}/40</span></summary><div class="admin-pack-body"><input data-p-title="${p.id}" value="${esc(p.title)}" placeholder="Название"><textarea data-p-desc="${p.id}" placeholder="Описание">${esc(p.description || '')}</textarea><input data-p-image="${p.id}" value="${esc(p.image_url || '')}" placeholder="Ссылка на изображение"><input data-p-price="${p.id}" type="number" value="${p.price_credits}"><div class="prompts-grid">${Array.from({ length: 40 }, (_, i) => `<label class="prompt-row"><span>${String(i + 1).padStart(2, '0')}</span><textarea data-p-prompt="${p.id}-${i}" placeholder="Промт для фото №${i + 1}">${esc(p.prompts?.[i] || '')}</textarea></label>`).join('')}</div><div class="row"><button class="secondary" onclick="savePack(${p.id})">Сохранить изменения</button><button class="secondary danger" onclick="hidePack(${p.id})">Скрыть</button></div></div></details>`).join('') || '<div class="empty">Пока нет паков.</div>';
}

async function renderUsers() {
  const rows = await api('/api/admin/users');
  const q = ($('userSearch').value || '').toLowerCase();
  $('adminUsers').innerHTML = rows.filter(u => `${u.username || ''} ${u.first_name || ''} ${u.last_name || ''} ${u.telegram_id}`.toLowerCase().includes(q)).map(u => `<div class="history-item"><div><b>${esc([u.first_name, u.last_name].filter(Boolean).join(' ') || 'Без имени')}</b><small>${u.username ? '@' + esc(u.username) : ''} · ID ${u.telegram_id}</small></div><span>${u.credits?.[0]?.balance || 0}💎 <button onclick="changeCredits(${u.id})">±</button><button onclick="resetFree(${u.id})">free</button></span></div>`).join('') || '<div class="empty">Пользователь не найден</div>';
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' } [m]));
}

window.saveHero = async key => {
  const title = $(`[data-hero-title="${key}"]`).value,
    description = $(`[data-hero-desc="${key}"]`).value,
    img = $(`[data-hero-img="${key}"]`).value;
  try {
    await api('/api/admin/hero/' + key, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description, image_url: img })
    });
    await renderHeroAdmin();
    await loadHome();
    alert('Карточка сохранена');
  } catch (e) {
    alert(e.message);
  }
};

window.savePack = async id => {
  const prompts = Array.from({ length: 40 }, (_, i) => String($(`[data-p-prompt="${id}-${i}"]`)?.value || '').trim());
  if (prompts.some(x => !x)) return alert('Заполни все 40 промтов');
  try {
    await api('/api/admin/packs/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: $(`[data-p-title="${id}"]`).value,
        description: $(`[data-p-desc="${id}"]`).value,
        image_url: $(`[data-p-image="${id}"]`).value,
        price_credits: Number($(`[data-p-price="${id}"]`).value),
        prompts
      })
    });
    await renderPackAdmin();
    await loadHome();
    alert('Пак сохранён');
  } catch (e) {
    alert(e.message);
  }
};

window.hidePack = async id => {
  if (!confirm('Скрыть фотосессию?')) return;
  await api('/api/admin/packs/' + id, { method: 'DELETE' });
  await renderPackAdmin();
  await loadHome();
};

window.changeCredits = async id => {
  const n = prompt('Изменить баланс (+/-):', '40');
  if (n) await api('/api/admin/users/' + id + '/credits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: Number(n) })
  });
  renderUsers();
};

window.resetFree = async id => {
  if (confirm('Вернуть бесплатную генерацию?')) {
    await api('/api/admin/users/' + id + '/reset-free', { method: 'POST' });
    renderUsers();
  }
};

// Обработчики кнопок
$('homeBtn').onclick = () => show('homeScreen');

$('profileBtn').onclick = async function() {
  console.log('Profile button clicked');
  try {
    await loadMe();
    show('profileScreen');
  } catch (error) {
    console.error('Error opening profile:', error);
    alert('Не удалось открыть профиль. Попробуйте позже.');
  }
};

$('freeBtn').onclick = openFree;
$('categoryBackBtn').onclick = () => show('homeScreen');
$('uploadBackBtn').onclick = () => currentPack ? openCategory(currentPack.category) : show('homeScreen');
$('continueBtn').onclick = openConfirm;
$('confirmBackBtn').onclick = () => openPack(currentPack.id);
$('generateBtn').onclick = () => generate(false);
$('profileBackBtn').onclick = () => show('homeScreen');
$('adminBackBtn').onclick = () => {
  loadMe();
  show('profileScreen');
};
$('topupBtn').onclick = () => alert('Пополнение подключим следующим этапом: Telegram Stars.');
$('adminBtn').onclick = loadAdmin;
$('refreshAdmin').onclick = loadAdmin;
$('userSearch').oninput = renderUsers;

$('packForm').onsubmit = async e => {
  e.preventDefault();
  const fd = new FormData(e.target),
    body = Object.fromEntries(fd.entries());
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
  } catch (x) {
    alert(x.message);
  }
};

$('saveFreePrompt').onclick = async () => {
  try {
    await api('/api/admin/free', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: $('freePromptInput').value,
        limit: Number($('freeLimitInput').value)
      })
    });
    alert('Сохранено');
  } catch (e) {
    alert(e.message);
  }
};

document.querySelectorAll('.admin-tabs button').forEach(b => b.onclick = () => {
  document.querySelectorAll('.admin-tabs button').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  ['cards', 'packs', 'free', 'users'].forEach(x => $(`admin${x[0].toUpperCase() + x.slice(1)}Tab`).classList.add('hidden'));
  $(`admin${b.dataset.atab[0].toUpperCase() + b.dataset.atab.slice(1)}Tab`).classList.remove('hidden');
});

// Инициализация
setAvatar();
(async () => {
  try {
    await loadHome();
    console.log('App initialized successfully');
  } catch (e) {
    console.error('loadHome error:', e);
    alert('Ошибка загрузки приложения: ' + e.message);
  }
})();
