-- =============================================
-- mc-discord-bot D1 Database Schema
-- =============================================

-- 聊天訊息暫存（雙向：MC ↔ Discord）
CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  source     TEXT    NOT NULL CHECK (source IN ('minecraft', 'discord')),
  username   TEXT    NOT NULL,
  content    TEXT    NOT NULL,
  delivered  INTEGER NOT NULL DEFAULT 0,   -- 0=未送達, 1=已送達
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_source_delivered
  ON messages (source, delivered, created_at);

-- Discord ↔ Minecraft 帳號綁定
CREATE TABLE IF NOT EXISTS player_bindings (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id   TEXT NOT NULL UNIQUE,
  discord_name TEXT NOT NULL,
  mc_uuid      TEXT UNIQUE,
  mc_name      TEXT,
  bind_code    TEXT,           -- 一次性驗證碼（綁定完成後清除）
  bind_code_at TEXT,           -- 驗證碼產生時間
  bound_at     TEXT            -- 綁定完成時間
);

CREATE INDEX IF NOT EXISTS idx_player_bindings_mc_uuid
  ON player_bindings (mc_uuid);

CREATE INDEX IF NOT EXISTS idx_player_bindings_bind_code
  ON player_bindings (bind_code);

-- 玩家背包物品
CREATE TABLE IF NOT EXISTS player_inventory (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  mc_uuid   TEXT    NOT NULL,
  item_id   TEXT    NOT NULL,
  item_name TEXT    NOT NULL,
  quantity  INTEGER NOT NULL DEFAULT 1,
  metadata  TEXT,              -- JSON 格式的額外資料
  updated_at TEXT   NOT NULL DEFAULT (datetime('now')),
  UNIQUE (mc_uuid, item_id)
);

CREATE INDEX IF NOT EXISTS idx_player_inventory_mc_uuid
  ON player_inventory (mc_uuid);

-- 伺服器設定 KV
CREATE TABLE IF NOT EXISTS server_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
