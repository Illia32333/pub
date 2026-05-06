-- migration.sql
-- Запусти один раз в Supabase SQL Editor (или в любом PostgreSQL клиенте)

CREATE TABLE IF NOT EXISTS user_storage (
  user_id    TEXT        NOT NULL,
  key        TEXT        NOT NULL,
  value      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

CREATE INDEX IF NOT EXISTS idx_user_storage_user_id
  ON user_storage (user_id);

-- Опционально: автоматически удалять данные пользователей
-- которые не заходили > 1 года (экономит место)
-- CREATE INDEX IF NOT EXISTS idx_user_storage_updated
--   ON user_storage (updated_at);
