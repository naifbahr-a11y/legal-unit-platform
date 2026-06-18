ALTER TABLE `legal_reviews` ADD COLUMN `followupStatus` enum('none','awaiting_submission','pending_approval','approved','rejected') DEFAULT 'none' NOT NULL;
--> statement-breakpoint
ALTER TABLE `legal_reviews` ADD COLUMN `followupActions` text;
--> statement-breakpoint
ALTER TABLE `legal_reviews` ADD COLUMN `followupRejectNote` text;
--> statement-breakpoint
ALTER TABLE `legal_reviews` ADD COLUMN `followupReminderSent` int DEFAULT 0 NOT NULL;
