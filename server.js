import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import TelegramBot from 'node-telegram-bot-api';
import Replicate from 'replicate';

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = process.cwd();
const UPLOAD_DIR = path.join(ROOT, 'temp_uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// === SUPABASE ===
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// === TELEGRAM BOT ===
const bot = new TelegramBot(process.env.BOT_TOKEN);

// === REPLICATE AI ===
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// === ПАКЕТЫ КРЕДИТОВ ===
const CREDIT_PACKAGES = {
  40: { credits: 40, stars: 400, price: '$4.00' },
  100: { credits: 100, stars: 900, price: '$9.00' },
  250: { credits: 250, stars: 2000, price: '$20.00' },
};

// === НАСТРОЙКА EXPRESS ===
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(ROOT, { index: 'index.html' }));

// === MULTER ===
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// === АВТОРИЗАЦИЯ ===
function parseInitData(initData) {
  if (!initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  const authDate = Number(params.get('auth_date') || 0);
  const botToken = process.env.BOT_TOKEN;
  if (!hash || !botToken || !authDate) return null;
  if (Date.now() / 1000 - authDate > 86400) return null;
  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculated = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(calculated), Buffer.from(hash))) return null;
  return JSON.parse(params.get('user') || '{}');
}

async function requireUser(req, res, next) {
  const tgUser = parseInitData(req.headers['x-telegram-init-data']);
  if (!tgUser) return res.status(401).json({ error: 'Telegram authorization required' });
  req.tgUser = tgUser;
  
  const { data: existing } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', String(tgUser.id))
    .maybeSingle();

  if (existing) {
    req.user = existing;
  } else {
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        telegram_id: String(tgUser.id),
        username: tgUser.username || null,
        first_name: tgUser.first_name || null,
        last_name: tgUser.last_name || null,
        free_generations_limit: 1,
        free_generations_used: 0,
      })
      .select()
      .single();
    
    if (error) throw error;
    await supabase.from('credits').insert({ user_id: newUser.id, balance: 0 });
    req.user = newUser;
  }
  
  const adminId = process.env.ADMIN_TELEGRAM_ID || '6711149865';
  const isAdmin = String(tgUser.id) === adminId || 
                  String(tgUser.username || '').toLowerCase() === process.env.ADMIN_TELEGRAM_USERNAME?.toLowerCase();
  req.isAdmin = isAdmin;
  next();
}

async function requireAdmin(req, res, next) {
  await requireUser(req, res, () => {
    if (!req.isAdmin) return res.status(403).json({ error: 'Admin access denied' });
    next();
  });
}

// === API РОУТЫ ===

app.get('/api/me', requireUser, async (req, res) => {
  const { data: credits } = await supabase
    .from('credits')
    .select('balance')
    .eq('user_id', req.user.id)
    .maybeSingle();

  const { data: history } = await supabase
    .from('generations')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .limit(30);

  const { data: purchases } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .limit(30);

  res.json({
    user: req.user,
    credits: credits?.balance || 0,
    freeAvailable: Math.max(0, (req.user.free_generations_limit || 1) - (req.user.free_generations_used || 0)),
    history: history || [],
    purchases: purchases || [],
    isAdmin: req.isAdmin
  });
});

app.get('/api/showcase', async (req, res) => {
  const { data, error } = await supabase
    .from('showcase_styles')
    .select('*')
    .eq('is_active', 1)
    .order('sort_order', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.get('/api/packages', (req, res) => {
  res.json(CREDIT_PACKAGES);
});

app.post('/api/generations', requireUser, upload.fields([
  { name: 'sourceImage', maxCount: 1 },
  { name: 'sourceImage1', maxCount: 1 },
  { name: 'sourceImage2', maxCount: 1 }
]), async (req, res) => {
  try {
    const { showcaseStyleId, category } = req.body;
    const useFree = (req.user.free_generations_used || 0) < (req.user.free_generations_limit || 1);
    
    const { data: style, error: styleError } = await supabase
      .from('showcase_styles')
      .select('*')
      .eq('id', Number(showcaseStyleId))
      .eq('is_active', 1)
      .maybeSingle();

    if (styleError || !style) return res.status(400).json({ error: 'Стиль не найден' });

    const PACKAGE_PRICE = 40;
    const { data: creditData } = await supabase
      .from('credits')
      .select('balance')
      .eq('user_id', req.user.id)
      .maybeSingle();

    const hasCredits = (creditData?.balance || 0) >= PACKAGE_PRICE;

    if (!useFree && !hasCredits) {
      return res.status(402).json({
        error: 'Недостаточно кредитов',
        needCredits: PACKAGE_PRICE,
        packages: CREDIT_PACKAGES
      });
    }

    let prompts = style.prompts || [];
    if (prompts.length === 0) {
      prompts = [
        `${style.title || 'Portrait'} style, professional photography, high quality, 8k`,
        `${style.title || 'Portrait'} style, creative composition, studio lighting, 8k`,
        `${style.title || 'Portrait'} style, beautiful portrait, professional, 8k`,
        `${style.title || 'Portrait'} style, artistic, detailed, high quality, 8k`
      ];
    }

    while (prompts.length < 40) {
      prompts.push(prompts[prompts.length % prompts.length]);
    }

    const selectedPrompts = prompts.slice(0, 40);

    await bot.sendMessage(req.user.telegram_id, 
      `🎬 Начинаем генерацию фотосета "${style.title}"!\n` +
      `📸 Будет сгенерировано ${selectedPrompts.length} фотографий.\n` +
      `⏱️ Примерное время: 2-3 минуты.\n\n` +
      `Фото будут приходить пачками по 10 штук.`
    );

    const results = [];
    const BATCH_SIZE = 10;

    for (let i = 0; i < selectedPrompts.length; i++) {
      try {
        let imageUrl;
        if (process.env.REPLICATE_API_TOKEN && process.env.REPLICATE_API_TOKEN !== 'r8_xxxxxxxxxxxxxxxx') {
          const output = await replicate.run(
            "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
            {
              input: {
                prompt: selectedPrompts[i],
                width: 768,
                height: 1024,
                num_outputs: 1,
              }
            }
          );
          imageUrl = output[0];
        } else {
          imageUrl = `https://picsum.photos/seed/${i + Date.now()}/768/1024`;
        }
        
        results.push(imageUrl);
        
        if (results.length === BATCH_SIZE || i === selectedPrompts.length - 1) {
          await sendPhotoBatch(req.user.telegram_id, results, style.title, i);
          results.length = 0;
        }

        await new Promise(resolve => setTimeout(resolve, 1500));

      } catch (error) {
        console.error(`❌ Ошибка генерации фото ${i}:`, error);
      }
    }

    if (useFree) {
      await supabase
        .from('users')
        .update({ free_generations_used: (req.user.free_generations_used || 0) + 1 })
        .eq('id', req.user.id);
    } else {
      const newBalance = (creditData?.balance || 0) - PACKAGE_PRICE;
      await supabase
        .from('credits')
        .update({ balance: newBalance })
        .eq('user_id', req.user.id);
    }

    await supabase
      .from('generations')
      .insert({
        user_id: req.user.id,
        showcase_style_id: style.id,
        status: 'completed',
        credits_spent: useFree ? 0 : PACKAGE_PRICE,
        result_images: ['package_sent_to_telegram']
      });

    const { data: updatedCredit } = await supabase
      .from('credits')
      .select('balance')
      .eq('user_id', req.user.id)
      .maybeSingle();

    res.json({
      ok: true,
      message: `✅ Фотосет "${style.title}" готов! Все ${selectedPrompts.length} фото отправлены в чат.`,
      creditsSpent: useFree ? 0 : PACKAGE_PRICE,
      remainingCredits: updatedCredit?.balance || 0
    });

  } catch (error) {
    console.error('❌ Ошибка генерации:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

async function sendPhotoBatch(chatId, imageUrls, styleTitle, index) {
  if (imageUrls.length === 0) return;

  const batchNumber = Math.floor(index / 10) + 1;
  const totalBatches = Math.ceil(40 / 10);
  
  try {
    const mediaGroup = imageUrls.map((url, idx) => ({
      type: 'photo',
      media: url,
      caption: idx === 0 ? `📸 ${styleTitle} — часть ${batchNumber}/${totalBatches}` : '',
    }));

    await bot.sendMediaGroup(chatId, mediaGroup);
    console.log(`✅ Отправлена пачка ${batchNumber}/${totalBatches}`);
  } catch (error) {
    console.error('❌ Ошибка отправки пачки:', error);
    for (const url of imageUrls) {
      try {
        await bot.sendPhoto(chatId, url);
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (e) {
        console.error('❌ Ошибка отправки фото:', e);
      }
    }
  }
}

app.post('/api/credits/topup', requireUser, async (req, res) => {
  const { credits, paymentId } = req.body;
  const amount = Number(credits);
  if (!Number.isInteger(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Неверное количество кредитов' });
  }

  const { data: creditData } = await supabase
    .from('credits')
    .select('balance')
    .eq('user_id', req.user.id)
    .maybeSingle();

  const newBalance = (creditData?.balance || 0) + amount;

  await supabase
    .from('credits')
    .update({ balance: newBalance })
    .eq('user_id', req.user.id);

  await supabase
    .from('transactions')
    .insert({
      user_id: req.user.id,
      type: 'credit',
      credits: amount,
      status: 'completed',
      provider: 'telegram_stars',
      provider_payment_id: paymentId || null,
      description: `Покупка ${amount} кредитов`
    });

  res.json({ ok: true, newBalance });
});

// === АДМИН РОУТЫ ===
app.get('/api/admin/overview', requireAdmin, async (req, res) => {
  const { count: users } = await supabase.from('users').select('*', { count: 'exact', head: true });
  const { count: generations } = await supabase.from('generations').select('*', { count: 'exact', head: true });
  
  const { data: paid } = await supabase
    .from('transactions')
    .select('credits')
    .eq('type', 'credit')
    .eq('status', 'completed');
  const paidCredits = paid?.reduce((sum, t) => sum + t.credits, 0) || 0;

  const { count: activeShowcase } = await supabase
    .from('showcase_styles')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', 1);

  res.json({
    users: users || 0,
    generations: generations || 0,
    paidCredits,
    activeShowcase: activeShowcase || 0
  });
});

app.get('/api/admin/users', requireAdmin, async (req, res) => {
  const { data } = await supabase
    .from('users')
    .select('*, credits(balance)')
    .order('created_at', { ascending: false })
    .limit(200);
  res.json(data || []);
});

app.post('/api/admin/users/:id/credits', requireAdmin, async (req, res) => {
  const amount = Number(req.body.amount);
  if (!Number.isInteger(amount) || amount === 0) {
    return res.status(400).json({ error: 'Amount must be non-zero' });
  }

  const { data: creditData } = await supabase
    .from('credits')
    .select('balance')
    .eq('user_id', Number(req.params.id))
    .maybeSingle();

  const newBalance = Math.max(0, (creditData?.balance || 0) + amount);

  await supabase
    .from('credits')
    .update({ balance: newBalance })
    .eq('user_id', Number(req.params.id));

  res.json({ ok: true });
});

app.get('/api/admin/showcase', requireAdmin, async (req, res) => {
  const { data } = await supabase
    .from('showcase_styles')
    .select('*')
    .order('sort_order', { ascending: true });
  res.json(data || []);
});

app.post('/api/admin/showcase', requireAdmin, upload.array('images', 8), async (req, res) => {
  const { title, category = 'Другое', description = '', priceCredits = '40', isPopular = '0', sortOrder = '0' } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  
  const images = (req.files || []).map(f => `/uploads/${f.filename}`);
  
  const prompts = [
    `${title} style, professional photography, high quality, 8k`,
    `${title} style, creative portrait, studio lighting, 8k`,
    `${title} style, beautiful, detailed, professional, 8k`,
    `${title} style, artistic composition, high quality, 8k`
  ];
  
  const { data, error } = await supabase
    .from('showcase_styles')
    .insert({
      title,
      category,
      description,
      price_credits: Number(priceCredits),
      is_popular: Number(isPopular),
      sort_order: Number(sortOrder),
      preview_images: images,
      prompts: prompts
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, id: data.id });
});

app.patch('/api/admin/showcase/:id', requireAdmin, async (req, res) => {
  const fields = ['title', 'category', 'description', 'price_credits', 'is_active', 'is_popular', 'sort_order'];
  const allowed = fields.filter(k => req.body[k] !== undefined);
  if (!allowed.length) return res.status(400).json({ error: 'Nothing to update' });
  
  const updates = {};
  allowed.forEach(k => { updates[k] = req.body[k]; });

  const { error } = await supabase
    .from('showcase_styles')
    .update(updates)
    .eq('id', Number(req.params.id));

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

app.get('/api/admin/settings', requireAdmin, async (req, res) => {
  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'free_generation_limit')
    .maybeSingle();
  
  res.json({ freeGenerationLimit: Number(data?.value || 1) });
});

app.patch('/api/admin/settings', requireAdmin, async (req, res) => {
  const n = Number(req.body.freeGenerationLimit);
  if (!Number.isInteger(n) || n < 0 || n > 20) {
    return res.status(400).json({ error: 'Free limit must be 0-20' });
  }

  await supabase
    .from('settings')
    .upsert({ key: 'free_generation_limit', value: String(n) });

  await supabase
    .from('users')
    .update({ free_generations_limit: n });

  res.json({ ok: true, freeGenerationLimit: n });
});

app.post('/api/admin/users/:id/reset-free', requireAdmin, async (req, res) => {
  await supabase
    .from('users')
    .update({ free_generations_used: 0 })
    .eq('id', Number(req.params.id));
  res.json({ ok: true });
});

// === ЗАПУСК ===
app.listen(PORT, () => {
  console.log(`🚀 AI Photo Studio running on http://localhost:${PORT}`);
  console.log(`👑 Admin: ${process.env.ADMIN_TELEGRAM_USERNAME || 'tgfsb'}`);
  console.log(`📦 Supabase: ${process.env.SUPABASE_URL ? '✅' : '❌'}`);
  console.log(`🤖 Replicate: ${process.env.REPLICATE_API_TOKEN ? '✅' : '❌'}`);
});
