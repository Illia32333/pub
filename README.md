# 🇪🇸 Испанский A2 — PostgreSQL версия

Прогресс хранится в PostgreSQL (Supabase). Работает на любом устройстве — данные не привязаны к браузеру.

---

## Архитектура

```
Browser
  └── fetch('/api/storage')
        └── Vercel Function (api/storage.js)
              └── PostgreSQL (Supabase)

Telegram Bot
  └── /api/webhook
        └── Vercel Function (api/webhook.js)
              └── PostgreSQL (читает прогресс для /stats)
```

**Одна таблица на всё:**
```sql
user_storage (user_id TEXT, key TEXT, value TEXT)
```

Ключи — те же что были в CloudStorage:
`es_a2_1000_v2`, `es_xp`, `es_streak`, `es_word_notes_v1`, ...

---

## Деплой

### 1. Supabase (PostgreSQL)

1. Зайди на [supabase.com](https://supabase.com) → **New project**
2. Запомни пароль
3. После создания: **SQL Editor** → вставь содержимое `migration.sql` → **Run**
4. Перейди в **Settings → Database → Connection string → URI**
5. Скопируй строку вида:
   ```
   postgresql://postgres:[ПАРОЛЬ]@db.xxxx.supabase.co:5432/postgres
   ```

### 2. GitHub

```bash
git init
git add .
git commit -m "init: Spanish A2 with PostgreSQL"
gh repo create spanish-a2-pg --public --push
```

### 3. Vercel

1. [vercel.com](https://vercel.com) → **New Project** → импортируй репо
2. **Environment Variables:**

| Переменная | Значение |
|-----------|---------|
| `DATABASE_URL` | строка из Supabase (postgresql://...) |
| `BOT_TOKEN` | токен от @BotFather |
| `APP_URL` | `https://твой-домен.vercel.app` |

3. **Deploy**

### 4. Webhook бота

```
https://api.telegram.org/botТОКЕН/setWebhook?url=https://твой-домен.vercel.app/api/webhook
```

---

## Структура файлов

```
spanish-a2-pg/
├── web/
│   ├── index.html        ← приложение (1000 слов, квизы, XP)
│   └── pg-storage.js     ← клиент API (заменяет localStorage/CloudStorage)
├── api/
│   ├── storage.js        ← Vercel Function: CRUD для user_storage
│   └── webhook.js        ← Vercel Function: Telegram бот
├── migration.sql         ← SQL для создания таблицы
├── package.json          ← зависимость: pg
└── vercel.json           ← роутинг
```

---

## Как работает авторизация

- **В Telegram Mini App**: `user_id` берётся из `window.Telegram.WebApp.initDataUnsafe.user.id`
- **В браузере (dev)**: генерируется случайный `dev_xxxxxxxx` и сохраняется в localStorage

> ⚠️ В продакшене стоит добавить валидацию `initData` на сервере.  
> Пример: [core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app)

---

## Локальная разработка

```bash
npm install
# Создай .env.local:
# DATABASE_URL=postgresql://...
# BOT_TOKEN=...
# APP_URL=http://localhost:3000
vercel dev
```
