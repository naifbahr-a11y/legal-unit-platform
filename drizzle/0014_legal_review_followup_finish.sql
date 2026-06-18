ALTER TABLE `legal_reviews` ADD COLUMN `followupSubmittedAt` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `legal_reviews` ADD COLUMN `followupApprovedBy` int;
