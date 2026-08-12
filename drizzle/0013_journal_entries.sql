CREATE TABLE `journal_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`recorded_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_journal_entries_user_type_date` ON `journal_entries` (`user_id`,`type`,`recorded_at`);
--> statement-breakpoint
CREATE TABLE `journal_images` (
	`id` text PRIMARY KEY NOT NULL,
	`journal_id` text NOT NULL,
	`user_id` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_journal_images_journal` ON `journal_images` (`journal_id`,`user_id`);
