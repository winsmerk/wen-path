ALTER TABLE `journey_tasks` ADD `preferred_weekday` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `journey_tasks` ADD `preferred_month_day` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `journey_tasks` ADD `main_task` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `journey_tasks` ADD `preferred_time` text DEFAULT '' NOT NULL;
