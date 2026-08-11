CREATE TABLE weekly_cycles (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, week_start TEXT NOT NULL, week_end TEXT NOT NULL,
  goal TEXT NOT NULL DEFAULT '', capacity_minutes INTEGER NOT NULL DEFAULT 420,
  status TEXT NOT NULL DEFAULT 'active', completed_count INTEGER NOT NULL DEFAULT 0,
  total_count INTEGER NOT NULL DEFAULT 0, archived_at TEXT, created_at TEXT NOT NULL
);
CREATE INDEX idx_weekly_cycles_user_start ON weekly_cycles(user_id, week_start);

ALTER TABLE weekly_actions ADD COLUMN cycle_id TEXT NOT NULL DEFAULT '';
ALTER TABLE weekly_actions ADD COLUMN carried_from_id TEXT NOT NULL DEFAULT '';

ALTER TABLE monthly_outcomes ADD COLUMN settled_at TEXT;
ALTER TABLE monthly_outcomes ADD COLUMN rolled_from_id TEXT NOT NULL DEFAULT '';

ALTER TABLE journeys ADD COLUMN evidence_review_status TEXT NOT NULL DEFAULT '';
ALTER TABLE journeys ADD COLUMN evidence_review_feedback TEXT NOT NULL DEFAULT '';
ALTER TABLE journeys ADD COLUMN evidence_score INTEGER NOT NULL DEFAULT 0;

ALTER TABLE reviews ADD COLUMN week_start TEXT NOT NULL DEFAULT '';
ALTER TABLE reviews ADD COLUMN auto_decision TEXT NOT NULL DEFAULT 'continue';
ALTER TABLE reviews ADD COLUMN auto_reasons TEXT NOT NULL DEFAULT '[]';

CREATE TABLE evidence_events (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, source_type TEXT NOT NULL, source_id TEXT NOT NULL,
  evidence_type TEXT NOT NULL, action_id TEXT NOT NULL DEFAULT '', occurred_at TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_evidence_source ON evidence_events(user_id, source_type, source_id);
CREATE INDEX idx_evidence_user_type_date ON evidence_events(user_id, evidence_type, occurred_at);

CREATE TABLE stop_rule_events (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, week_start TEXT NOT NULL, rule_code TEXT NOT NULL,
  severity TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX idx_stop_events_user_week ON stop_rule_events(user_id, week_start);
