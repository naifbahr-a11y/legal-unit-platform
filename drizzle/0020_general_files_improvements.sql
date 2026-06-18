ALTER TABLE `general_files` ADD COLUMN `fileCategory` varchar(64);
--> statement-breakpoint
ALTER TABLE `general_files` ADD COLUMN `subject` text;
--> statement-breakpoint
ALTER TABLE `general_files` ADD COLUMN `fileStatus` varchar(64);
--> statement-breakpoint
ALTER TABLE `general_files` ADD COLUMN `relatedCaseNumber` varchar(128);
--> statement-breakpoint
ALTER TABLE `general_files` ADD COLUMN `relatedInvestigationNumber` varchar(128);
--> statement-breakpoint
ALTER TABLE `general_files` ADD COLUMN `receivedDate` varchar(32);
--> statement-breakpoint
ALTER TABLE `general_files` ADD COLUMN `lastFollowup` varchar(32);
--> statement-breakpoint
ALTER TABLE `general_files` ADD COLUMN `lastActions` text;
