ALTER TABLE `financial_records` ADD `investment_principal` real DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `financial_records` ADD `investment_return` real DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE `financial_records` SET `investment_principal` = `amount` WHERE `category` = 'investment' AND `investment_principal` = 0 AND `amount` > 0;
--> statement-breakpoint
CREATE TABLE `financial_monthly_bills` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `period` text NOT NULL,
  `income_total` real DEFAULT 0 NOT NULL,
  `salary_income` real DEFAULT 0 NOT NULL,
  `non_salary_income` real DEFAULT 0 NOT NULL,
  `expense_total` real DEFAULT 0 NOT NULL,
  `business_expense` real DEFAULT 0 NOT NULL,
  `investment_principal` real DEFAULT 0 NOT NULL,
  `investment_return` real DEFAULT 0 NOT NULL,
  `business_profit` real DEFAULT 0 NOT NULL,
  `net_cash_flow` real DEFAULT 0 NOT NULL,
  `settled_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_finance_bills_user_period` ON `financial_monthly_bills` (`user_id`,`period`);
