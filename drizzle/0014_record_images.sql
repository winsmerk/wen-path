CREATE TABLE `record_images` (
	`id` text PRIMARY KEY NOT NULL,
	`record_type` text NOT NULL,
	`record_id` text NOT NULL,
	`user_id` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_record_images_record` ON `record_images` (`user_id`,`record_type`,`record_id`);
