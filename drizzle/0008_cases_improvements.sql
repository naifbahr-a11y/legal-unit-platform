ALTER TABLE `cases` ADD COLUMN `archived` tinyint(1) NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `cases` ADD INDEX `cases_province_idx` (`province`);--> statement-breakpoint
ALTER TABLE `cases` ADD INDEX `cases_branch_idx` (`branch`);--> statement-breakpoint
ALTER TABLE `cases` ADD INDEX `cases_expiry_idx` (`expiry`);--> statement-breakpoint
ALTER TABLE `cases` ADD INDEX `cases_archived_idx` (`archived`);
