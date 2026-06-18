UPDATE `cases` SET `createdBy` = NULL WHERE `createdBy` IS NOT NULL AND `createdBy` NOT IN (SELECT `id` FROM `users`);--> statement-breakpoint
UPDATE `pending_operations` SET `reviewedBy` = NULL WHERE `reviewedBy` IS NOT NULL AND `reviewedBy` NOT IN (SELECT `id` FROM `users`);--> statement-breakpoint
UPDATE `case_attachments` SET `uploadedBy` = NULL WHERE `uploadedBy` IS NOT NULL AND `uploadedBy` NOT IN (SELECT `id` FROM `users`);--> statement-breakpoint
UPDATE `appointments` SET `createdBy` = NULL WHERE `createdBy` IS NOT NULL AND `createdBy` NOT IN (SELECT `id` FROM `users`);--> statement-breakpoint
ALTER TABLE `case_attachments` MODIFY `uploadedBy` int NULL;--> statement-breakpoint
ALTER TABLE `cases` ADD CONSTRAINT `fk_cases_created_by` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE `pending_operations` ADD CONSTRAINT `fk_pending_reviewed_by` FOREIGN KEY (`reviewedBy`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE `case_attachments` ADD CONSTRAINT `fk_attachments_uploaded_by` FOREIGN KEY (`uploadedBy`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE `appointments` ADD CONSTRAINT `fk_appointments_created_by` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
