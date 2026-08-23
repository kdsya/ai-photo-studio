import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import TelegramBot from 'node-telegram-bot-api';

const app=express();
const PORT=Number(process.env.PORT||3000); const ROOT=process.cwd();
const UPLOAD_DIR=path.join(ROOT,'temp_uploads'); fs.mkdirSync(UPLOAD_DIR,{recursive:true});
const supabase=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
const bot=new TelegramBot(process.env.BOT_TOKEN||'',{polling:false});
app.use(express.json({limit:'2mb'})); app.use(express.urlencoded({extended:true})); app.use('/uploads',express.static(UPLOAD_DIR)); app.use(express.static(ROOT,{index:'index.html'}));
const storage=multer.diskStorage({destination:(r,f,cb)=>cb(null,UPLOAD_DIR),filename:(r,f,cb)=>cb(null,`${Date.now()}-${Math.round(Math.random()*1e9)}${path.extname(f.originalname)}`)});
const upload=multer({storage,limits:{fileSize:50*1024*1024}});

const DEFAULT_HERO=[
 {key:'him',title:'Фотосессия для Парней',image_url:'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=900&h=1100&fit=crop&crop=face',sort_order:1},
 {key:'her',title:'Фотосессия для Девушек',image_url:'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=900&h=1100&fit=crop&crop=face',sort_order:2},
 {key:'couple',title:'Фотосессия для Двоих',image_url:'https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?w=900&h=1100&fit=crop',sort_order:3}
];
const DEFAULT_FREE_PROMPT='Создай естественный премиальный портрет человека по исходной фотографии, сохрани узнаваемость лица, реалистичную кожу, красивый свет, современную фотостудию, профессиональная фотография, вертикальный кадр, высокая детализация.';
const DEFAULT_PACKS=[
 {id:1,category:'him',title:'Брутальная фотосессия',description:'Уверенные мужские кадры в киношной атмосфере.',image_url:'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=900&h=1100&fit=crop',price_credits:40,is_popular:1,prompts:Array.from({length:40},(_,i)=>`Мужская брутальная фотосессия, кадр ${i+1}, уверенный мужчина, cinematic lighting, realistic photography, premium fashion editorial, preserve identity, vertical portrait, highly detailed.`)},
 {id:2,category:'her',title:'Весенняя фотосессия',description:'Светлая естественная серия на свежем воздухе.',image_url:'https://images.unsplash.com/photo-1496440737103-cd596325d314?w=900&h=1100&fit=crop',price_credits:40,is_popular:1,prompts:Array.from({length:40},(_,i)=>`Женская весенняя фотосессия, кадр ${i+1}, soft daylight, flowers, elegant fashion, natural skin, realistic professional photography, preserve identity, vertical portrait, highly detailed.`)},
 {id:3,category:'couple',title:'Кино для двоих',description:'Совместные кадры с атмосферой большого кино.',image_url:'https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?w=900&h=1100&fit=crop',price_credits:40,is_popular:1,prompts:Array.from({length:40},(_,i)=>`Совместная фотосессия пары, кадр ${i+1}, cinematic romantic scene, natural interaction, realistic faces, premium photography, preserve both identities, vertical composition, highly detailed.`)}
];

function parseInitData(initData){if(!initData)return null;const p=new URLSearchParams(initData);const hash=p.get('hash');const authDate=Number(p.get('auth_date')||0);const token=process.env.BOT_TOKEN;if(!hash||!token||!authDate||Date.now()/1000-authDate>86400)return null;p.delete('hash');const check=[...p.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');const secret=crypto.createHmac('sha256','WebAppData').update(token).digest();const calc=crypto.createHmac('sha256',secret).update(check).digest('hex');if(calc.length!==hash.length||!crypto.timingSafeEqual(Buffer.from(calc),Buffer.from(hash)))return null;try{return JSON.parse(p.get('user')||'{}')}catch{return null}}
async function ensureUser(tgUser){let {data:user}=await supabase.from('users').select('*').eq('telegram_id',String(tgUser.id)).maybeSingle();if(!user){const r=await supabase.from('users').insert({telegram_id:String(tgUser.id),username:tgUser.username||null,first_name:tgUser.first_name||null,last_name:tgUser.last_name||null,free_generations_limit:1,free_generations_used:0}).select().single();if(r.error)throw r.error;user=r.data;await supabase.from('credits').insert({user_id:user.id,balance:0})}return user}
async function requireUser(req,res,next){try{const u=parseInitData(req.headers['x-telegram-init-data']);if(!u)return res.status(401).json({error:'Telegram authorization required'});req.tgUser=u;req.user=await ensureUser(u);const adminId=process.env.ADMIN_TELEGRAM_ID||'6711149865';const adminName=(process.env.ADMIN_TELEGRAM_USERNAME||'tgfsb').replace('@','').toLowerCase();req.isAdmin=String(u.id)===adminId||String(u.username||'').toLowerCase()===adminName;next()}catch(e){console.error(e);res.status(500).json({error:'Authorization error'})}}
async function requireAdmin(req,res,next){await requireUser(req,res,()=>req.isAdmin?next():res.status(403).json({error:'Admin access denied'}))}
async function setting(key,def=null){const {data}=await supabase.from('settings').select('value').eq('key',key).maybeSingle();return data?.value??def}
async function saveSetting(key,value){return supabase.from('settings').upsert({key,value:String(value)},{onConflict:'key'})}

app.get('/api/me',requireUser,async(req,res)=>{const [{data:cr},{data:history},{data:purchases},{data:favs}]=await Promise.all([
 supabase.from('credits').select('balance').eq('user_id',req.user.id).maybeSingle(),
 supabase.from('generations').select('*').eq('user_id',req.user.id).order('created_at',{ascending:false}).limit(30),
 supabase.from('transactions').select('*').eq('user_id',req.user.id).order('created_at',{ascending:false}).limit(30),
 supabase.from('favorites').select('showcase_style_id').eq('user_id',req.user.id)
]);res.json({user:req.user,credits:cr?.balance||0,freeAvailable:Math.max(0,(req.user.free_generations_limit??1)-(req.user.free_generations_used??0)),history:history||[],purchases:purchases||[],favorites:(favs||[]).map(x=>x.showcase_style_id),isAdmin:req.isAdmin})});
app.get('/api/home',async(req,res)=>{let {data:cards,error}=await supabase.from('hero_cards').select('*').eq('is_active',1).order('sort_order');if(error||!cards?.length)cards=DEFAULT_HERO;res.json(cards)});
app.get('/api/showcase',async(req,res)=>{const {data,error}=await supabase.from('showcase_styles').select('*').eq('is_active',1).order('sort_order');if(error)return res.status(500).json({error:error.message});res.json(data||[])});
app.get('/api/showcase/:category',async(req,res)=>{const c=req.params.category;const {data,error}=await supabase.from('showcase_styles').select('*').eq('category',c).eq('is_active',1).order('sort_order');if(error)return res.status(500).json({error:error.message});res.json(data||[])});
app.get('/api/packages',async(req,res)=>res.json({40:{credits:40,stars:400,price:'$4.00'},100:{credits:100,stars:900,price:'$9.00'},250:{credits:250,stars:2000,price:'$20.00'}}));

app.post('/api/favorites/:styleId',requireUser,async(req,res)=>{const sid=Number(req.params.styleId);const {data:old}=await supabase.from('favorites').select('id').eq('user_id',req.user.id).eq('showcase_style_id',sid).maybeSingle();if(old){await supabase.from('favorites').delete().eq('id',old.id);return res.json({ok:true,favorite:false})}const {error}=await supabase.from('favorites').insert({user_id:req.user.id,showcase_style_id:sid});if(error)return res.status(500).json({error:error.message});res.json({ok:true,favorite:true})});

app.post('/api/generations',requireUser,upload.fields([{name:'sourceImage1',maxCount:1},{name:'sourceImage2',maxCount:1}]),async(req,res)=>{try{const {showcaseStyleId,category,free}=req.body;const useFree=free==='1';let style=null;if(!useFree){const r=await supabase.from('showcase_styles').select('*').eq('id',Number(showcaseStyleId)).eq('is_active',1).maybeSingle();style=r.data;if(!style)return res.status(400).json({error:'Фотосессия не найдена'});if(style.category!==category)return res.status(400).json({error:'Категория не совпадает'});if(!Array.isArray(style.prompts)||style.prompts.length!==40)return res.status(400).json({error:'У пака должно быть 40 промтов'})}
 const freeLimit=req.user.free_generations_limit??1,used=req.user.free_generations_used??0;if(useFree&&used>=freeLimit)return res.status(402).json({error:'Бесплатная генерация уже использована'});
 let price=useFree?0:Number(style.price_credits||40);const {data:cr}=await supabase.from('credits').select('balance').eq('user_id',req.user.id).maybeSingle();if(!useFree&&(cr?.balance||0)<price)return res.status(402).json({error:'Недостаточно кредитов',needCredits:price});
 const files=req.files||{};const source1=files.sourceImage1?.[0]?.path||null,source2=files.sourceImage2?.[0]?.path||null;
 if(useFree){const prompt=await setting('free_generation_prompt',DEFAULT_FREE_PROMPT);await saveGeneration(req.user.id,null,'free',0,'queued',source1,source2);await supabase.from('users').update({free_generations_used:used+1}).eq('id',req.user.id);return res.json({ok:true,message:'Бесплатная генерация принята. AI-воркер подключим следующим этапом.',creditsSpent:0,queuedPrompts:[prompt]})}
 await supabase.from('credits').update({balance:(cr?.balance||0)-price}).eq('user_id',req.user.id);await saveGeneration(req.user.id,style.id,style.title,price,'queued',source1,source2);
 // Здесь оставлен чистый hook под AI: style.prompts[0..39] + source1/source2. Реальный Replicate/другой провайдер подключается без изменения интерфейса.
 res.json({ok:true,message:`«${style.title}» принята в очередь: 40 кадров, 4 пачки по 10 в Telegram.`,creditsSpent:price,queuedPrompts:style.prompts});
}catch(e){console.error(e);res.status(500).json({error:e.message||'Generation error'})}});
async function saveGeneration(userId,styleId,title,spent,status,source1,source2){return supabase.from('generations').insert({user_id:userId,showcase_style_id:styleId,status,credits_spent:spent,result_images:[],source_image_url:source1?`/uploads/${path.basename(source1)}`:null,source_image2_url:source2?`/uploads/${path.basename(source2)}`:null,style_title:title})}

app.post('/api/credits/topup',requireUser,async(req,res)=>{res.status(501).json({error:'Платежи пока в тестовом режиме. Telegram Stars подключим следующим этапом.'})});

app.get('/api/admin/overview',requireAdmin,async(req,res)=>{const [{count:users},{count:generations},{count:packs},{data:paid}]=await Promise.all([supabase.from('users').select('*',{count:'exact',head:true}),supabase.from('generations').select('*',{count:'exact',head:true}),supabase.from('showcase_styles').select('*',{count:'exact',head:true}).eq('is_active',1),supabase.from('transactions').select('credits').eq('type','credit').eq('status','completed')]);res.json({users:users||0,generations:generations||0,packs:packs||0,paidCredits:(paid||[]).reduce((a,x)=>a+Number(x.credits||0),0)})});
app.get('/api/admin/hero',requireAdmin,async(req,res)=>{const {data,error}=await supabase.from('hero_cards').select('*').order('sort_order');res.json(error?DEFAULT_HERO:data||DEFAULT_HERO)});
app.patch('/api/admin/hero/:key',requireAdmin,async(req,res)=>{const key=req.params.key;const allowed=['title','image_url','sort_order','is_active'];const updates={};allowed.forEach(k=>{if(req.body[k]!==undefined)updates[k]=req.body[k]});const {error}=await supabase.from('hero_cards').update(updates).eq('key',key);if(error)return res.status(500).json({error:error.message});res.json({ok:true})});
app.get('/api/admin/packs',requireAdmin,async(req,res)=>{const {data,error}=await supabase.from('showcase_styles').select('*').order('category').order('sort_order');if(error)return res.status(500).json({error:error.message});res.json(data||[]) });
app.post('/api/admin/packs',requireAdmin,async(req,res)=>{const {category,title,description='',image_url,price_credits=40,is_popular=0,prompts}=req.body;const list=String(prompts||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);if(!['him','her','couple'].includes(category))return res.status(400).json({error:'Неверная категория'});if(!title||!image_url)return res.status(400).json({error:'Название и ссылка на изображение обязательны'});if(list.length!==40)return res.status(400).json({error:`Нужно ровно 40 промтов. Сейчас: ${list.length}`});const {data,error}=await supabase.from('showcase_styles').insert({title,category,description,image_url,preview_images:[image_url],price_credits:Number(price_credits),is_popular:is_popular?1:0,is_active:1,sort_order:0,prompts:list}).select().single();if(error)return res.status(500).json({error:error.message});res.json({ok:true,data})});
app.patch('/api/admin/packs/:id',requireAdmin,async(req,res)=>{const allowed=['title','description','image_url','price_credits','is_popular','is_active','sort_order','category','prompts'];const u={};allowed.forEach(k=>{if(req.body[k]!==undefined)u[k]=req.body[k]});if(u.prompts){if(!Array.isArray(u.prompts)||u.prompts.length!==40)return res.status(400).json({error:'Нужно ровно 40 промтов'});u.preview_images=[u.image_url||''];}const {error}=await supabase.from('showcase_styles').update(u).eq('id',Number(req.params.id));if(error)return res.status(500).json({error:error.message});res.json({ok:true})});
app.delete('/api/admin/packs/:id',requireAdmin,async(req,res)=>{const {error}=await supabase.from('showcase_styles').update({is_active:0}).eq('id',Number(req.params.id));if(error)return res.status(500).json({error:error.message});res.json({ok:true})});
app.get('/api/admin/free',requireAdmin,async(req,res)=>{const prompt=await setting('free_generation_prompt',DEFAULT_FREE_PROMPT);const limit=Number(await setting('free_generation_limit','1'));res.json({prompt,limit})});
app.patch('/api/admin/free',requireAdmin,async(req,res)=>{const prompt=String(req.body.prompt||'').trim();const limit=Number(req.body.limit);if(!prompt)return res.status(400).json({error:'Промт не может быть пустым'});if(!Number.isInteger(limit)||limit<0||limit>20)return res.status(400).json({error:'Лимит 0-20'});await saveSetting('free_generation_prompt',prompt);await saveSetting('free_generation_limit',limit);await supabase.from('users').update({free_generations_limit:limit});res.json({ok:true})});
app.get('/api/admin/users',requireAdmin,async(req,res)=>{const {data}=await supabase.from('users').select('*,credits(balance)').order('created_at',{ascending:false}).limit(300);res.json(data||[])});
app.post('/api/admin/users/:id/credits',requireAdmin,async(req,res)=>{const amount=Number(req.body.amount);const {data}=await supabase.from('credits').select('balance').eq('user_id',Number(req.params.id)).maybeSingle();const balance=Math.max(0,(data?.balance||0)+amount);await supabase.from('credits').update({balance}).eq('user_id',Number(req.params.id));res.json({ok:true,balance})});
app.post('/api/admin/users/:id/reset-free',requireAdmin,async(req,res)=>{await supabase.from('users').update({free_generations_used:0}).eq('id',Number(req.params.id));res.json({ok:true})});

app.listen(PORT,()=>console.log(`AI Photo Studio running on :${PORT}`));
