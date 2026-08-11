ALTER TABLE profiles ADD COLUMN weekly_capacity_minutes INTEGER NOT NULL DEFAULT 420;
ALTER TABLE profiles ADD COLUMN weekly_goal TEXT NOT NULL DEFAULT '';
ALTER TABLE weekly_actions ADD COLUMN task_type TEXT NOT NULL DEFAULT 'general';
ALTER TABLE weekly_actions ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';

CREATE TABLE task_outputs (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, action_id TEXT NOT NULL,
  task_type TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL,
  duration INTEGER NOT NULL DEFAULT 0, feeling TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
CREATE TABLE financial_records (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, action_id TEXT,
  category TEXT NOT NULL, amount REAL NOT NULL, note TEXT NOT NULL,
  recorded_at TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE english_messages (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, role TEXT NOT NULL,
  text TEXT NOT NULL, feedback TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX idx_outputs_user_action ON task_outputs(user_id, action_id);
CREATE INDEX idx_finance_user_date ON financial_records(user_id, recorded_at);
CREATE INDEX idx_english_user_date ON english_messages(user_id, created_at);
