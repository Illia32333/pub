/**
 * pg-storage.js
 * Клиент хранилища — обращается к /api/storage (Vercel Function → PostgreSQL).
 * Идентичный интерфейс что был у TGStorage, поэтому index.html менять не нужно.
 *
 * Авторизация: Telegram user_id берётся из window.Telegram.WebApp.initDataUnsafe,
 * либо из localStorage('pg_user_id') для браузерного fallback/dev-режима.
 *
 * API:
 *   TGStorage.get(key)    → Promise<string|null>
 *   TGStorage.set(key, v) → Promise<void>
 *   TGStorage.remove(key) → Promise<void>
 *   TGStorage.getAll()    → Promise<{key: value}>
 *   TGStorage.isTelegram  → Boolean
 */

const TGStorage = (() => {
  // ── Определяем userId ──────────────────────────────────────────────────────
  function getUserId() {
    // 1. Telegram Mini App
    const tg = window.Telegram?.WebApp;
    if (tg?.initDataUnsafe?.user?.id) {
      return String(tg.initDataUnsafe.user.id);
    }
    // 2. Браузер — dev fallback: берём/создаём случайный ID
    let id = localStorage.getItem('pg_user_id');
    if (!id) {
      id = 'dev_' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem('pg_user_id', id);
    }
    return id;
  }

  // ── HTTP helper ────────────────────────────────────────────────────────────
  async function request(method, body) {
    const userId = getUserId();
    const res = await fetch('/api/storage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, method, ...body }),
    });
    if (!res.ok) throw new Error(`Storage API error: ${res.status}`);
    return res.json();
  }

  // ── Local write-through cache (снижает лишние запросы) ────────────────────
  const cache = {};

  return {
    isTelegram: !!(window.Telegram?.WebApp?.initDataUnsafe?.user),

    async get(key) {
      if (key in cache) return cache[key];
      const { value } = await request('get', { key });
      cache[key] = value ?? null;
      return cache[key];
    },

    async set(key, value) {
      const str = typeof value === 'string' ? value : JSON.stringify(value);
      cache[key] = str;
      await request('set', { key, value: str });
    },

    async remove(key) {
      delete cache[key];
      await request('remove', { key });
    },

    async getAll() {
      const { data } = await request('getAll', {});
      Object.assign(cache, data || {});
      return cache;
    },
  };
})();

window.TGStorage = TGStorage;
