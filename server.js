import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import multer from 'multer';

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'studio.db'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id TEXT UNIQUE NOT NULL,
  username TEXT, first_name TEXT, last_name TEXT,
  free_generations_used INTEGER NOT NULL DEFAULT 0,
  free_generations_limit INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS credits (
  user_id INTEGER PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS showcase_styles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Другое',
  description TEXT NOT NULL DEFAULT '',
  price_credits INTEGER NOT NULL DEFAULT 1,
  preview_images TEXT NOT NULL DEFAULT '[]',
  is_active INTEGER NOT NULL DEFAULT 1,
  is_popular INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS generations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  showcase_style_id INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  source_image TEXT,
  result_images TEXT NOT NULL DEFAULT '[]',
  credits_spent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(showcase_style_id) REFERENCES showcase_styles(id)
);
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  credits INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  provider TEXT,
  provider_payment_id TEXT,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS admins (
  telegram_id TEXT PRIMARY KEY,
  username TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

// === НАСТРОЙКА АДМИНА (ТВОИ ДАННЫЕ) ===
const ADMIN_ID = '6711149865';
const ADMIN_USERNAME = 'tgfsb';

// Добавляем тебя как администратора
db.prepare(`
  INSERT OR REPLACE INTO admins (telegram_id, username) 
  VALUES (?, ?)
`).run(ADMIN_ID, ADMIN_USERNAME);

// Настройки по умолчанию
db.prepare("INSERT OR IGNORE INTO settings (key,value) VALUES ('free_generation_limit','1')").run();

// Обновляем лимит бесплатных генераций для всех
db.prepare('UPDATE users SET free_generations_limit=1 WHERE free_generations_limit<>1').run();

// Создаем демо-стили если их нет
const seed = db.prepare('SELECT COUNT(*) c FROM showcase_styles').get().c;
if (!seed) {
  const insert = db.prepare(`INSERT INTO showcase_styles (title,category,description,price_credits,is_active,is_popular,sort_order) VALUES (?,?,?,?,1,?,?)`);
  const styles = [
    ['Luxury','Девушки и парни','Премиальная фотосессия с дорогой атмосферой',3,1,1],
    ['Business','Парни','Деловой образ для профиля и соцсетей',2,0,2],
    ['Cinematic','Все','Кинематографичный кадр как из фильма',3,1,3],
    ['Fitness','Спорт','Спортивный образ и мощная атмосфера',2,0,4],
    ['Dark','Все','Тёмный стиль с драматичным светом',3,0,5],
    ['Travel','Все','Путешествие и красивые локации',3,0,6],
    ['Gaming','Парни','Игровой стиль и неоновая атмосфера',2,0,7],
    ['Instagram','Девушки','Готовый стиль для соцсетей',2,1,8],
    ['Парная фотосессия ❤️','Пары','Совместные кадры для двоих',4,1,9]
  ];
  db.transaction(() => styles.forEach(s => insert.run(...s)))();
}

app.use(express.json({ limit:'12mb' }));
app.use(express.urlencoded({ extended:true }));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(ROOT, { index:'index.html' }));

function parseInitData(initData) {
  if (!initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  const authDate = Number(params.get('auth_date') || 0);
  const botToken = process.env.BOT_TOKEN;
  
  if (!hash || !botToken || !authDate) return null;
  if (Date.now()/1000 - authDate > 86400) return null;
  
  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([a],[b]) => a.localeCompare(b))
    .map(([k,v]) => `${k}=${v}`)
    .join('\n');
  
  const secret = crypto.createHmac('sha256','WebAppData').update(botToken).digest();
  const calculated = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  
  if (!crypto.timingSafeEqual(Buffer.from(calculated), Buffer.from(hash))) return null;
  
  const user = JSON.parse(params.get('user') || '{}');
  return user?.id ? user : null;
}

function upsertUser(tgUser) {
  const stmt = db.prepare(`INSERT INTO users (telegram_id,username,first_name,last_name) VALUES (?,?,?,?)
    ON CONFLICT(telegram_id) DO UPDATE SET username=excluded.username, first_name=excluded.first_name, last_name=excluded.last_name, updated_at=CURRENT_TIMESTAMP`);
  stmt.run(String(tgUser.id), tgUser.username || null, tgUser.first_name || null, tgUser.last_name || null);
  
  const limit = Number(db.prepare("SELECT value FROM settings WHERE key='free_generation_limit'").get()?.value || 1);
  db.prepare('UPDATE users SET free_generations_limit=? WHERE telegram_id=?').run(limit, String(tgUser.id));
  
  const user = db.prepare('SELECT * FROM users WHERE telegram_id=?').get(String(tgUser.id));
  db.prepare('INSERT OR IGNORE INTO credits (user_id,balance) VALUES (?,0)').run(user.id);
  
  return user;
}

function requireUser(req,res,next) {
  const tgUser = parseInitData(req.headers['x-telegram-init-data']);
  if (!tgUser) return res.status(401).json({ error:'Telegram authorization required' });
  req.tgUser = tgUser;
  req.user = upsertUser(tgUser);
  next();
}

function requireAdmin(req,res,next) {
  requireUser(req,res,() => {
    const id = String(req.tgUser.id);
    const username = String(req.tgUser.username || '').toLowerCase();
    
    // Проверяем по ID (самый надежный способ)
    const adminById = db.prepare('SELECT 1 FROM admins WHERE telegram_id=?').get(id);
    
    // Проверяем по username (дополнительно)
    const adminByUsername = db.prepare('SELECT 1 FROM admins WHERE LOWER(username)=?').get(username);
    
    // Твой ID и username жестко зашиты
    const isHardcodedAdmin = id === ADMIN_ID || username === ADMIN_USERNAME.toLowerCase();
    
    if (!adminById && !adminByUsername && !isHardcodedAdmin) {
      return res.status(403).json({ error:'Admin access denied' });
    }
    
    next();
  });
}

// === API РОУТЫ ===

app.get('/api/config', (req,res) => res.json({ telegramRequired: !!process.env.BOT_TOKEN }));

app.get('/api/me', requireUser, (req,res) => {
  const c = db.prepare('SELECT balance FROM credits WHERE user_id=?').get(req.user.id);
  const history = db.prepare('SELECT g.*, s.title style_title FROM generations g LEFT JOIN showcase_styles s ON s.id=g.showcase_style_id WHERE g.user_id=? ORDER BY g.id DESC LIMIT 30').all(req.user.id);
  const purchases = db.prepare('SELECT * FROM transactions WHERE user_id=? ORDER BY id DESC LIMIT 30').all(req.user.id);
  
  // Проверяем, админ ли пользователь
  const isAdmin = !!db.prepare('SELECT 1 FROM admins WHERE telegram_id=?').get(String(req.tgUser.id));
  
  res.json({ 
    user:req.user, 
    credits:c?.balance || 0, 
    freeAvailable: Math.max(0, req.user.free_generations_limit - req.user.free_generations_used), 
    history, 
    purchases,
    isAdmin: isAdmin || String(req.tgUser.id) === ADMIN_ID
  });
});

app.get('/api/showcase', (req,res) => {
  const rows = db.prepare('SELECT * FROM showcase_styles WHERE is_active=1 ORDER BY is_popular DESC, sort_order ASC, id ASC').all();
  res.json(rows.map(x => ({...x, preview_images:JSON.parse(x.preview_images)})));
});

app.post('/api/generations', requireUser, (req,res) => {
  const { showcaseStyleId, sourceImage } = req.body;
  const style = db.prepare('SELECT * FROM showcase_styles WHERE id=? AND is_active=1').get(Number(showcaseStyleId));
  if (!style) return res.status(400).json({error:'Style not found'});
  
  const credit = db.prepare('SELECT balance FROM credits WHERE user_id=?').get(req.user.id).balance;
  const free = req.user.free_generations_used < req.user.free_generations_limit;
  
  if (!free && credit < style.price_credits) return res.status(402).json({error:'Not enough credits'});
  
  const useFree = free;
  const tx = db.transaction(() => {
    if (useFree) {
      db.prepare('UPDATE users SET free_generations_used=free_generations_used+1,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(req.user.id);
    } else {
      db.prepare('UPDATE credits SET balance=balance-?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?').run(style.price_credits, req.user.id);
    }
    const result = db.prepare('INSERT INTO generations (user_id,showcase_style_id,status,source_image,credits_spent) VALUES (?,?,?,?,?)').run(
      req.user.id,
      style.id,
      'queued',
      sourceImage || null,
      useFree ? 0 : style.price_credits
    );
    return result.lastInsertRowid;
  });
  
  const generationId = tx();
  res.json({
    ok:true,
    generationId,
    chargedFree:useFree,
    creditsSpent:useFree?0:style.price_credits,
    message:'Генерация поставлена в очередь. AI-провайдер подключим следующим модулем.'
  });
});

app.post('/api/credits/topup', requireUser, (req,res) => {
  const credits = Number(req.body.credits || 0);
  if (!Number.isInteger(credits) || credits <= 0) return res.status(400).json({error:'Invalid credits'});
  
  const tx = db.transaction(() => {
    db.prepare('UPDATE credits SET balance=balance+?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?').run(credits, req.user.id);
    db.prepare(`INSERT INTO transactions (user_id,type,amount,credits,status,provider,description) VALUES (?,?,?,?,?,?,?)`).run(
      req.user.id,
      'credit',
      0,
      credits,
      'demo',
      'demo',
      'Демо-пополнение; заменить на Telegram Stars/платёжный провайдер'
    );
  });
  tx();
  res.json({ok:true});
});

const upload = multer({ 
  storage: multer.diskStorage({ 
    destination: UPLOAD_DIR, 
    filename: (_,file,cb) => cb(null, `${Date.now()}-${crypto.randomUUID()}${path.extname(file.originalname)}`) 
  }), 
  limits:{ fileSize: 10*1024*1024 } 
});

// === АДМИН РОУТЫ ===

app.get('/api/admin/overview', requireAdmin, (req,res) => {
  const users = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  const generations = db.prepare('SELECT COUNT(*) c FROM generations').get().c;
  const paid = db.prepare("SELECT COALESCE(SUM(credits),0) c FROM transactions WHERE type='credit' AND status='paid'").get().c;
  const activeShowcase = db.prepare('SELECT COUNT(*) c FROM showcase_styles WHERE is_active=1').get().c;
  res.json({ users, generations, paidCredits: paid, activeShowcase });
});

app.get('/api/admin/users', requireAdmin, (req,res) => {
  res.json(db.prepare(`SELECT u.*, c.balance FROM users u LEFT JOIN credits c ON c.user_id=u.id ORDER BY u.id DESC LIMIT 200`).all());
});

app.post('/api/admin/users/:id/credits', requireAdmin, (req,res) => {
  const amount = Number(req.body.amount);
  if (!Number.isInteger(amount) || amount === 0) return res.status(400).json({error:'Amount must be a non-zero integer'});
  const user = db.prepare('SELECT id FROM users WHERE id=?').get(Number(req.params.id));
  if (!user) return res.status(404).json({error:'User not found'});
  db.prepare('UPDATE credits SET balance=MAX(0,balance+?),updated_at=CURRENT_TIMESTAMP WHERE user_id=?').run(amount, user.id);
  res.json({ok:true});
});

app.get('/api/admin/showcase', requireAdmin, (req,res) => {
  res.json(db.prepare('SELECT * FROM showcase_styles ORDER BY sort_order,id').all().map(x => ({...x, preview_images:JSON.parse(x.preview_images)})));
});

app.post('/api/admin/showcase', requireAdmin, upload.array('images',8), (req,res) => {
  const { title, category='Другое', description='', priceCredits='1', isPopular='0', sortOrder='0' } = req.body;
  if (!title) return res.status(400).json({error:'Title required'});
  const images = (req.files||[]).map(f => `/uploads/${f.filename}`);
  const result = db.prepare(`INSERT INTO showcase_styles (title,category,description,price_credits,is_popular,sort_order,preview_images) VALUES (?,?,?,?,?,?,?)`).run(
    title, category, description, Number(priceCredits), Number(isPopular), Number(sortOrder), JSON.stringify(images)
  );
  res.json({ok:true, id:result.lastInsertRowid});
});

app.patch('/api/admin/showcase/:id', requireAdmin, (req,res) => {
  const fields = ['title','category','description','price_credits','is_active','is_popular','sort_order'];
  const allowed = fields.filter(k => req.body[k] !== undefined);
  if (!allowed.length) return res.status(400).json({error:'Nothing to update'});
  const values = allowed.map(k => req.body[k]);
  db.prepare(`UPDATE showcase_styles SET ${allowed.map(k => `${k}=?`).join(',')},updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(...values, Number(req.params.id));
  res.json({ok:true});
});

app.get('/api/admin/settings', requireAdmin, (req,res) => {
  const freeGenerationLimit = Number(db.prepare("SELECT value FROM settings WHERE key='free_generation_limit'").get()?.value||1);
  res.json({ freeGenerationLimit });
});

app.patch('/api/admin/settings', requireAdmin, (req,res) => {
  const n = Number(req.body.freeGenerationLimit);
  if (!Number.isInteger(n) || n < 0 || n > 20) return res.status(400).json({error:'Free limit must be 0-20'});
  db.prepare("INSERT INTO settings(key,value) VALUES('free_generation_limit',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(n));
  db.prepare('UPDATE users SET free_generations_limit=?').run(n);
  res.json({ok:true, freeGenerationLimit:n});
});

app.post('/api/admin/users/:id/reset-free', requireAdmin, (req,res) => {
  const user = db.prepare('SELECT id FROM users WHERE id=?').get(Number(req.params.id));
  if (!user) return res.status(404).json({error:'User not found'});
  db.prepare('UPDATE users SET free_generations_used=0 WHERE id=?').run(user.id);
  res.json({ok:true});
});

app.listen(PORT, () => console.log(`🚀 AI Photo Studio running on http://localhost:${PORT}`));
console.log(`👑 Admin: @${ADMIN_USERNAME} (ID: ${ADMIN_ID})`);
