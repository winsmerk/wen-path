CREATE INDEX `idx_checkins_user_type` ON `checkins` (`user_id`,`type`);--> statement-breakpoint
CREATE INDEX `idx_journeys_user_status` ON `journeys` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_actions_user_status` ON `weekly_actions` (`user_id`,`status`);