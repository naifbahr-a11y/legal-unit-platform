ALTER TABLE `forged_checks` ADD COLUMN `complainant` varchar(128);--> statement-breakpoint
UPDATE `forged_checks` SET `complainant` = `employee` WHERE `complainant` IS NULL AND `employee` IS NOT NULL;--> statement-breakpoint
UPDATE `forged_checks` fc
INNER JOIN `users` u ON fc.`createdBy` = u.`id`
SET fc.`employee` = COALESCE(u.`displayName`, u.`name`, u.`username`)
WHERE fc.`createdBy` IS NOT NULL;--> statement-breakpoint
CREATE INDEX `forged_checks_complainant_idx` ON `forged_checks` (`complainant`);
