/**
 * api/storage.js
 * Vercel Serverless Function — Key-Value хранилище поверх PostgreSQL.
 *
 * Таблица:
 *   CREATE TABLE user_storage (
 *     user_id  TEXT NOT NULL,
 *     key      TEXT NOT NULL,
 *     value    TEXT,
 *     updated_at TIMESTAMPTZ DEFAULT now(),
 *     PRIMARY KEY (user_id, key)
 *   );
 *
 * Переменная окружения:
 *   DATABASE_URL — строка подключения к PostgreSQL
 *                  (Supabase: Settings → Database → Connection string → URI)
 *
 * Методы (поле method в теле запроса):
 *   get     { userId, key }            → { value }
 *   set     { userId, key, value }     → { ok }
 *   remove  { userId, key }            → { ok }
 *   getAll  { userId }                 → { data: {key: value} }
 */

import { Pool } from 'pg';

// Пул соединений — переиспользуется между вызовами (Vercel держит функцию тёплой)
let pool;
function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }, // нужно для Supabase / Neon
      max: 5,
    });
  }
  return pool;
}

// ── Инициализация таблицы при первом запросе ──────────────────────────────────
let tableReady = false;
async function ensureTable(client) {
  if (tableReady) return;
  await client.query(`
    CREATE TABLE IF NOT EXISTS user_storage (
      user_id    TEXT        NOT NULL,
      key        TEXT        NOT NULL,
      value      TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, key)
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_user_storage_user_id ON user_storage (user_id)
  `);
  tableReady = true;
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // CORS — выставляем один раз для всех ответов
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, method, key, value } = req.body || {};

  if (!userId) {
    return res.status(400).json({ error: 'userId required' });
  }

  const db = getPool();
  const client = await db.connect();

  try {
    await ensureTable(client);

    // ── GET ──────────────────────────────────────────────────────────────────
    if (method === 'get') {
      if (!key) return res.status(400).json({ error: 'key required' });

      const { rows } = await client.query(
        'SELECT value FROM user_storage WHERE user_id = $1 AND key = $2',
        [userId, key]
      );
      return res.status(200).json({
        value: rows[0]?.value ?? null,
      });
    }

    // ── SET ──────────────────────────────────────────────────────────────────
    if (method === 'set') {
      if (!key) return res.status(400).json({ error: 'key required' });

      await client.query(`
        INSERT INTO user_storage (user_id, key, value, updated_at)
        VALUES ($1, $2, $3, now())
        ON CONFLICT (user_id, key)
        DO UPDATE SET value = EXCLUDED.value, updated_at = now()
      `, [userId, key, value ?? null]);

      return res.status(200).json({ ok: true });
    }

    // ── REMOVE ───────────────────────────────────────────────────────────────
    if (method === 'remove') {
      if (!key) return res.status(400).json({ error: 'key required' });

      await client.query(
        'DELETE FROM user_storage WHERE user_id = $1 AND key = $2',
        [userId, key]
      );
      return res.status(200).json({ ok: true });
    }

    // ── GET ALL ──────────────────────────────────────────────────────────────
    if (method === 'getAll') {
      const { rows } = await client.query(
        'SELECT key, value FROM user_storage WHERE user_id = $1',
        [userId]
      );
      const data = Object.fromEntries(rows.map(r => [r.key, r.value]));
      return res.status(200).json({ data });
    }

    return res.status(400).json({ error: `Unknown method: ${method}` });

  } catch (err) {
    console.error('Storage error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}
