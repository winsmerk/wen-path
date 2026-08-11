ALTER TABLE profiles ADD COLUMN side_hustle_limit_minutes INTEGER NOT NULL DEFAULT 360;
ALTER TABLE profiles ADD COLUMN protected_day TEXT NOT NULL DEFAULT '周日';

ALTER TABLE journeys ADD COLUMN evidence TEXT NOT NULL DEFAULT '';
ALTER TABLE journeys ADD COLUMN completed_at TEXT;

ALTER TABLE monthly_outcomes ADD COLUMN journey_id TEXT NOT NULL DEFAULT '';
ALTER TABLE monthly_outcomes ADD COLUMN kind TEXT NOT NULL DEFAULT 'milestone';
ALTER TABLE monthly_outcomes ADD COLUMN period TEXT NOT NULL DEFAULT '';

ALTER TABLE weekly_actions ADD COLUMN is_side_hustle INTEGER NOT NULL DEFAULT 0;

ALTER TABLE reviews ADD COLUMN health_check TEXT NOT NULL DEFAULT '';
ALTER TABLE reviews ADD COLUMN market_evidence TEXT NOT NULL DEFAULT '';
ALTER TABLE reviews ADD COLUMN energy_score INTEGER NOT NULL DEFAULT 7;
ALTER TABLE reviews ADD COLUMN decision TEXT NOT NULL DEFAULT 'continue';
ALTER TABLE reviews ADD COLUMN kill_rule_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE financial_records ADD COLUMN income_type TEXT NOT NULL DEFAULT '';
ALTER TABLE financial_records ADD COLUMN source_name TEXT NOT NULL DEFAULT '';
ALTER TABLE financial_records ADD COLUMN expense_scope TEXT NOT NULL DEFAULT 'personal';

CREATE INDEX idx_outcomes_user_journey ON monthly_outcomes(user_id, journey_id);
CREATE INDEX idx_finance_user_source ON financial_records(user_id, source_name);
