CREATE TABLE IF NOT EXISTS memos (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  remind_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  wechat_enabled INTEGER NOT NULL DEFAULT 1,
  delivery_status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  sent_at TEXT,
  last_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memos_due
ON memos(delivery_status, status, remind_at);

CREATE INDEX IF NOT EXISTS idx_memos_user_time
ON memos(user_id, remind_at);

PRAGMA optimize;
