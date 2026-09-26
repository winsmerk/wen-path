CREATE TABLE `hub_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`date` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`meta` text DEFAULT '{}' NOT NULL,
	`versions` text DEFAULT '[]' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `hub_docs_user_kind_date` ON `hub_documents` (`user_id`,`kind`,`date`);--> statement-breakpoint
CREATE TABLE `hub_images` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`document_id` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `hub_images_document` ON `hub_images` (`user_id`,`document_id`);--> statement-breakpoint
CREATE TABLE `hub_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`request_id` text NOT NULL,
	`result` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hub_imports_user_request` ON `hub_imports` (`user_id`,`request_id`);--> statement-breakpoint
CREATE TABLE `hub_word_lists` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`date` text NOT NULL,
	`source` text DEFAULT '' NOT NULL,
	`entries` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `hub_lists_user_date` ON `hub_word_lists` (`user_id`,`date`);--> statement-breakpoint
CREATE TABLE `hub_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`items` text NOT NULL,
	`answers` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
CREATE INDEX `hub_reviews_user_date` ON `hub_reviews` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `hub_words` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`word` text NOT NULL,
	`pos` text DEFAULT '' NOT NULL,
	`normalized` text NOT NULL,
	`meaning` text NOT NULL,
	`mastered` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hub_words_user_normalized` ON `hub_words` (`user_id`,`normalized`);