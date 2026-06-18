ALTER TABLE `legal_reviews` ADD COLUMN `relatedCaseId` int;
--> statement-breakpoint
ALTER TABLE `legal_reviews` ADD COLUMN `attachmentUrl` text;
--> statement-breakpoint
CREATE TABLE `legal_review_trail` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reviewId` int NOT NULL,
	`action` varchar(64) NOT NULL,
	`notes` text,
	`performedBy` int,
	`performedByName` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `legal_review_trail_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `legal_review_trail_review_id_idx` ON `legal_review_trail` (`reviewId`);
