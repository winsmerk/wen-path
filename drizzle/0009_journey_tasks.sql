CREATE TABLE IF NOT EXISTS `journey_tasks` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `journey_id` text NOT NULL,
  `title` text NOT NULL,
  `acceptance_criteria` text NOT NULL,
  `estimated_minutes` integer DEFAULT 60 NOT NULL,
  `task_type` text DEFAULT 'general' NOT NULL,
  `priority` integer DEFAULT 1 NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `source` text DEFAULT 'manual' NOT NULL,
  `completed_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_journey_tasks_journey_status` ON `journey_tasks` (`user_id`,`journey_id`,`status`);
--> statement-breakpoint
ALTER TABLE `monthly_outcomes` ADD `source_task_id` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `weekly_actions` ADD `source_task_id` text DEFAULT '' NOT NULL;
