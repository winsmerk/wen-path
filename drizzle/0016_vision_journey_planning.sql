CREATE TABLE IF NOT EXISTS journey_stages_v2 (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,title TEXT NOT NULL,objective TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'planned',sort_order INTEGER NOT NULL DEFAULT 1,start_date TEXT,end_date TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS journey_goals_v2 (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,stage_id TEXT NOT NULL,title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',acceptance_criteria TEXT NOT NULL DEFAULT '',priority INTEGER NOT NULL DEFAULT 2,status TEXT NOT NULL DEFAULT 'planned',sort_order INTEGER NOT NULL DEFAULT 1,start_date TEXT,end_date TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS task_types_v2 (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,type_key TEXT NOT NULL,name TEXT NOT NULL,color TEXT NOT NULL,icon TEXT NOT NULL,sort_order INTEGER NOT NULL DEFAULT 1,enabled INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS task_definitions_v2 (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,goal_id TEXT NOT NULL,title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',type_key TEXT NOT NULL DEFAULT 'other',mode TEXT NOT NULL DEFAULT 'once',frequency TEXT NOT NULL DEFAULT 'once',occurrences INTEGER NOT NULL DEFAULT 1,weekdays_json TEXT NOT NULL DEFAULT '[]',month_days_json TEXT NOT NULL DEFAULT '[]',times_json TEXT NOT NULL DEFAULT '[]',scheduled_date TEXT,start_date TEXT,end_date TEXT,estimated_minutes INTEGER NOT NULL DEFAULT 30,priority INTEGER NOT NULL DEFAULT 2,enabled INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS monthly_plans_v2 (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,period TEXT NOT NULL,title TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'active',created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS monthly_plan_goals_v2 (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,plan_id TEXT NOT NULL,goal_id TEXT NOT NULL,priority INTEGER NOT NULL DEFAULT 2,created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS task_instances_v2 (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,plan_id TEXT NOT NULL,goal_id TEXT NOT NULL,definition_id TEXT NOT NULL,title TEXT NOT NULL,type_key TEXT NOT NULL,scheduled_date TEXT NOT NULL,scheduled_time TEXT NOT NULL DEFAULT '',estimated_minutes INTEGER NOT NULL DEFAULT 30,priority INTEGER NOT NULL DEFAULT 2,status TEXT NOT NULL DEFAULT 'pending',source TEXT NOT NULL DEFAULT 'system',user_adjusted INTEGER NOT NULL DEFAULT 0,occurrence_key TEXT NOT NULL,completed_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS weekly_capacity_days_v2 (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,weekday INTEGER NOT NULL,available INTEGER NOT NULL DEFAULT 1,minutes INTEGER NOT NULL DEFAULT 60,slots_json TEXT NOT NULL DEFAULT '[]',updated_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS planning_reports_v2 (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,report_type TEXT NOT NULL,period TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'final',summary_json TEXT NOT NULL,generated_at TEXT NOT NULL,updated_at TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_stages_v2_user_sort ON journey_stages_v2(user_id,sort_order);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_goals_v2_stage_sort ON journey_goals_v2(user_id,stage_id,sort_order);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_tasks_v2_goal ON task_definitions_v2(user_id,goal_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_task_types_v2_key ON task_types_v2(user_id,type_key);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_month_plan_v2_period ON monthly_plans_v2(user_id,period);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_month_goal_v2 ON monthly_plan_goals_v2(user_id,plan_id,goal_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_instances_v2_occurrence ON task_instances_v2(user_id,occurrence_key);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_instances_v2_date ON task_instances_v2(user_id,scheduled_date,status);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_capacity_v2_day ON weekly_capacity_days_v2(user_id,weekday);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_v2_period ON planning_reports_v2(user_id,report_type,period);
