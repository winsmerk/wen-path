ALTER TABLE task_definitions_v2 ADD COLUMN record_required INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS planning_records_v2 (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  type_key TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  duration INTEGER NOT NULL DEFAULT 0,
  feeling TEXT NOT NULL DEFAULT '',
  recorded_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_planning_records_instance ON planning_records_v2(user_id,instance_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_planning_records_type_date ON planning_records_v2(user_id,type_key,recorded_at);
--> statement-breakpoint
PRAGMA optimize;
