ALTER TABLE `appointments` ADD COLUMN `reminderSent` int DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `appointments` ADD COLUMN `employeeId` int;
--> statement-breakpoint
CREATE INDEX `appointments_employee_id_idx` ON `appointments` (`employeeId`);
--> statement-breakpoint
CREATE INDEX `appointments_case_id_idx` ON `appointments` (`caseId`);
