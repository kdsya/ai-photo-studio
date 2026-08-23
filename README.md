# PHOTOAI — AI Photo Studio v9

Telegram Mini App: GitHub Pages (frontend) + Render (Node/Express API) + Supabase (database).

## Архитектура
- GitHub Pages: `index.html`, `app.js`, `style.css`.
- Render: Node/Express API, Telegram WebApp auth, uploads, генерации и будущая интеграция AI/платежей.
- Supabase: пользователи, Telegram ID, аватары, балансы, генерации, избранное, 3 главные карточки, фотосессии, 40 промтов каждого пака и настройки.

## Важно: URL Render
Если фронтенд размещён на GitHub Pages, в `index.html` укажи URL твоего Render-сервера:

```html
<script>window.PHOTOAI_API_URL="https://ТВОЙ-SERVICE.onrender.com";</script>
```

Если приложение отдаётся самим Render с Node/Express, оставь `PHOTOAI_API_URL` пустым.

## Supabase
Выполни **только** `supabase-migration.sql` в Supabase SQL Editor. Отдельной базы на Render нет.

Миграция создаёт/обновляет нужные поля, индексы и атомарную функцию `claim_free_generation`.

## Бесплатная генерация
Ровно одна бесплатная генерация на пользователя. Ограничение хранится в Supabase и не сбрасывается после перезапуска Render, повторного входа или очистки браузера. Параллельные быстрые запросы защищены атомарным SQL UPDATE.

## Админка
Админский доступ проверяется на сервере по `ADMIN_TELEGRAM_ID` или `ADMIN_TELEGRAM_USERNAME`. Клиентский username сам по себе права не выдаёт.

Админка управляет:
- 3 главными карточками: название, описание, изображение URL;
- фотосессиями и категориями;
- ценой;
- 40 отдельными промтами;
- бесплатным промтом;
- пользователями и балансами;
- возвратом бесплатной генерации.

## Запуск Render
`npm install` → задать переменные окружения → `npm start`.

Обязательные переменные: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BOT_TOKEN`.
Для админки: `ADMIN_TELEGRAM_ID` и/или `ADMIN_TELEGRAM_USERNAME`.

## Demo-режим
**Удалён полностью.** Нет localStorage-пользователей, фиктивных API-ответов или fallback-генераций. Ошибка API показывается как ошибка.
