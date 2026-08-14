ALTER TABLE task_instances_v2 ADD COLUMN week_selected INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
PRAGMA optimize;
