CREATE TABLE `activity_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`username` varchar(64) NOT NULL,
	`action` varchar(128) NOT NULL,
	`details` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activity_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `anti_corruption_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reportType` varchar(64),
	`period` varchar(64),
	`year` varchar(10),
	`content` text,
	`imageUrl` text,
	`employee` varchar(128),
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `anti_corruption_reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `appointments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(256) NOT NULL,
	`appointmentDate` varchar(64) NOT NULL,
	`appointmentTime` varchar(16),
	`appointmentType` varchar(64),
	`caseId` int,
	`caseNumber` varchar(128),
	`location` varchar(256),
	`employee` varchar(128),
	`reminderBefore` varchar(32) DEFAULT '1h',
	`appointmentStatus` enum('upcoming','completed','cancelled') DEFAULT 'upcoming',
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `appointments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`username` varchar(128) NOT NULL,
	`action` varchar(64) NOT NULL,
	`tableName` varchar(64),
	`recordId` int,
	`description` text,
	`oldData` json,
	`newData` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bank_properties` (
	`id` int AUTO_INCREMENT NOT NULL,
	`propertyName` varchar(256),
	`propertyNumber` varchar(128),
	`location` text,
	`area` varchar(128),
	`notes` text,
	`employee` varchar(128),
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bank_properties_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `case_attachments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`caseId` int NOT NULL,
	`tableName` varchar(64) NOT NULL,
	`fileName` varchar(512) NOT NULL,
	`fileUrl` text NOT NULL,
	`fileKey` varchar(512) NOT NULL,
	`fileSize` int,
	`mimeType` varchar(128),
	`uploadedBy` int NOT NULL,
	`uploadedByName` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `case_attachments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` varchar(64),
	`employee` varchar(128),
	`caseNumber` varchar(128),
	`investigationNumber` varchar(128),
	`subject` text,
	`complainant` text,
	`accused` text,
	`authority` text,
	`damage` text,
	`lastActions` text,
	`caseStatus` varchar(128),
	`documentation` text,
	`caseReceived` varchar(64),
	`lastFollowup` varchar(64),
	`expiry` varchar(64),
	`remainingDays` varchar(64),
	`currency` enum('IQD','USD','both'),
	`province` varchar(128),
	`city` varchar(128),
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`senderId` int NOT NULL,
	`senderName` varchar(128) NOT NULL,
	`recipientId` int,
	`message` text NOT NULL,
	`isRead` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chat_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `compensation_cases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ministerialOrder` text,
	`administrativeOrder` text,
	`investigativeCase` text,
	`caseTitle` text,
	`guarantorName` varchar(256),
	`compensationAmount` varchar(128),
	`paymentDetails` text,
	`lastActions` text,
	`employee` varchar(128),
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `compensation_cases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `correspondence` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('inbox','outbox') NOT NULL,
	`bookNumber` varchar(128),
	`subject` text,
	`senderEntity` varchar(256),
	`receiverEntity` varchar(256),
	`correspondenceDate` varchar(64),
	`receivedDate` varchar(64),
	`employee` varchar(128),
	`correspondenceStatus` enum('completed','processing','delayed','direct') DEFAULT 'direct',
	`priority` enum('very_urgent','urgent','normal','fyi') DEFAULT 'normal',
	`parentId` int,
	`deadline` varchar(64),
	`attachmentUrl` text,
	`attachmentKey` varchar(512),
	`archived` int DEFAULT 0,
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `correspondence_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `correspondence_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`correspondenceId` int NOT NULL,
	`assignedTo` varchar(128) NOT NULL,
	`task` text,
	`assignmentStatus` enum('pending','in_progress','completed') DEFAULT 'pending',
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `correspondence_assignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `correspondence_trail` (
	`id` int AUTO_INCREMENT NOT NULL,
	`correspondenceId` int NOT NULL,
	`action` enum('received','forwarded','executed','archived','returned','noted') NOT NULL,
	`fromUser` varchar(128),
	`toUser` varchar(128),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `correspondence_trail_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `custom_case_types` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `custom_case_types_id` PRIMARY KEY(`id`),
	CONSTRAINT `custom_case_types_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `custom_section_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sectionId` int NOT NULL,
	`data` json NOT NULL,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `custom_section_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `custom_sections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(256) NOT NULL,
	`slug` varchar(128) NOT NULL,
	`icon` varchar(64) DEFAULT 'FileText',
	`fields` json NOT NULL,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `custom_sections_id` PRIMARY KEY(`id`),
	CONSTRAINT `custom_sections_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `forged_checks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`checkNumber` varchar(128),
	`amount` varchar(128),
	`entity` text,
	`checkDate` varchar(64),
	`employee` varchar(128),
	`actions` text,
	`notes` text,
	`status` varchar(64),
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `forged_checks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `general_files` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fileTitle` text,
	`employeeCustody` varchar(256),
	`notes` text,
	`employee` varchar(128),
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `general_files_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `investigation_cases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branch` varchar(256),
	`subject` text,
	`caseNumber` varchar(128),
	`receivedDate` varchar(64),
	`completionDate` varchar(64),
	`referredEmployee` varchar(256),
	`damage` text,
	`currency` enum('IQD','USD','both'),
	`actions` text,
	`notes` text,
	`employee` varchar(128),
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `investigation_cases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `legal_reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(256) NOT NULL,
	`reviewDate` varchar(64) NOT NULL,
	`location` varchar(256),
	`priority` enum('urgent','medium','normal') DEFAULT 'normal',
	`description` text,
	`assignedTo` varchar(128),
	`assignedToId` int,
	`reviewStatus` enum('new','in_review','completed','rejected') DEFAULT 'new',
	`reviewNotes` text,
	`createdBy` int,
	`createdByName` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `legal_reviews_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mortgaged_properties` (
	`id` int AUTO_INCREMENT NOT NULL,
	`propertyName` varchar(256),
	`propertyNumber` varchar(128),
	`location` text,
	`area` varchar(128),
	`notes` text,
	`employee` varchar(128),
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mortgaged_properties_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(256) NOT NULL,
	`message` text,
	`type` varchar(64),
	`isRead` int NOT NULL DEFAULT 0,
	`relatedId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pending_operations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tableName` varchar(64) NOT NULL,
	`recordId` int,
	`operationType` enum('add','edit','delete') NOT NULL,
	`data` json,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`submittedBy` int NOT NULL,
	`submittedByName` varchar(128),
	`reviewedBy` int,
	`reviewNote` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pending_operations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `personal_guarantees` (
	`id` int AUTO_INCREMENT NOT NULL,
	`debtorName` varchar(256),
	`guarantor` varchar(256),
	`debtAmount` varchar(128),
	`paymentDetails` text,
	`lastActions` text,
	`employee` varchar(128),
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `personal_guarantees_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `section_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`section_key` varchar(128) NOT NULL,
	`name` varchar(256) NOT NULL,
	`icon` varchar(64) DEFAULT 'FileText',
	`sort_order` int DEFAULT 0,
	`visible` int DEFAULT 1,
	`is_built_in` int DEFAULT 0,
	`columns` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `section_config_id` PRIMARY KEY(`id`),
	CONSTRAINT `section_config_section_key_unique` UNIQUE(`section_key`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `username` varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `password` varchar(256) NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `displayName` varchar(128) NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `specialization` varchar(256);--> statement-breakpoint
ALTER TABLE `users` ADD `jobTitle` varchar(256);--> statement-breakpoint
ALTER TABLE `users` ADD `phone` varchar(64);--> statement-breakpoint
ALTER TABLE `users` ADD `permissions` json;--> statement-breakpoint
ALTER TABLE `users` ADD `telegramChatId` varchar(64);--> statement-breakpoint
ALTER TABLE `users` ADD `telegramLinkCode` varchar(32);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_username_unique` UNIQUE(`username`);