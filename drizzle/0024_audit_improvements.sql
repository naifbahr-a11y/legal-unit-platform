ALTER TABLE `users` ADD `telegramLinkCodeExpiresAt` timestamp NULL;--> statement-breakpoint
CREATE INDEX `chat_messages_created_at_idx` ON `chat_messages` (`createdAt`);--> statement-breakpoint
CREATE INDEX `notifications_created_at_idx` ON `notifications` (`createdAt`);--> statement-breakpoint
CREATE UNIQUE INDEX `investigation_cases_case_number_uq` ON `investigation_cases` (`caseNumber`);--> statement-breakpoint
UPDATE `custom_section_records` SET `createdBy` = NULL WHERE `createdBy` IS NOT NULL AND `createdBy` NOT IN (SELECT `id` FROM `users`);--> statement-breakpoint
DELETE FROM `custom_section_records` WHERE `sectionId` NOT IN (SELECT `id` FROM `custom_sections`);