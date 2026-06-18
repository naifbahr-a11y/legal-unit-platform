ALTER TABLE `bank_properties` ADD COLUMN `branch` varchar(256);
--> statement-breakpoint
ALTER TABLE `bank_properties` ADD COLUMN `propertyType` varchar(64);
--> statement-breakpoint
ALTER TABLE `bank_properties` ADD COLUMN `possessionStatus` varchar(64);
--> statement-breakpoint
ALTER TABLE `bank_properties` ADD COLUMN `relatedCaseNumber` varchar(128);
--> statement-breakpoint
ALTER TABLE `bank_properties` ADD COLUMN `relatedCaseId` int;
--> statement-breakpoint
ALTER TABLE `mortgaged_properties` ADD COLUMN `branch` varchar(256);
--> statement-breakpoint
ALTER TABLE `mortgaged_properties` ADD COLUMN `ownerName` varchar(256);
--> statement-breakpoint
ALTER TABLE `mortgaged_properties` ADD COLUMN `mortgageAmount` varchar(128);
--> statement-breakpoint
ALTER TABLE `mortgaged_properties` ADD COLUMN `currency` varchar(16) DEFAULT 'IQD';
--> statement-breakpoint
ALTER TABLE `mortgaged_properties` ADD COLUMN `relatedCaseNumber` varchar(128);
--> statement-breakpoint
ALTER TABLE `mortgaged_properties` ADD COLUMN `relatedCaseId` int;
--> statement-breakpoint
ALTER TABLE `mortgaged_properties` ADD COLUMN `procedureStatus` varchar(64);
--> statement-breakpoint
ALTER TABLE `mortgaged_properties` ADD COLUMN `mortgageDate` varchar(32);
--> statement-breakpoint
ALTER TABLE `mortgaged_properties` ADD COLUMN `lastFollowup` varchar(32);
