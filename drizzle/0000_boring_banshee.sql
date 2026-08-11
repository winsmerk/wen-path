CREATE TABLE `checkins` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`duration` integer NOT NULL,
	`note` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `journeys` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`sequence_number` integer NOT NULL,
	`title` text NOT NULL,
	`area` text NOT NULL,
	`stage` text NOT NULL,
	`acceptance_criteria` text NOT NULL,
	`status` text NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`next_action` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `monthly_outcomes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`acceptance_criteria` text NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`expected_hours` integer NOT NULL,
	`status` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`vision` text NOT NULL,
	`target_date` text NOT NULL,
	`initialized` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`period` text NOT NULL,
	`achievement` text NOT NULL,
	`low_value` text NOT NULL,
	`next_priority` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `weekly_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`outcome_id` text NOT NULL,
	`title` text NOT NULL,
	`estimated_minutes` integer NOT NULL,
	`scheduled_for` text NOT NULL,
	`priority` integer NOT NULL,
	`status` text NOT NULL,
	`completed_at` text
);
