CREATE TABLE `debt_actions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`debtId` int NOT NULL,
	`actionType` enum('notice','warning','legal','seizure','settlement','other') DEFAULT 'notice',
	`actionDate` varchar(64) NOT NULL,
	`description` text NOT NULL,
	`result` text,
	`nextAction` text,
	`nextActionDate` varchar(64),
	`createdBy` int,
	`createdByName` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `debt_actions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `debt_installments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`debtId` int NOT NULL,
	`installmentNumber` int NOT NULL,
	`dueDate` varchar(64) NOT NULL,
	`amount` bigint NOT NULL DEFAULT 0,
	`installmentCurrency` enum('IQD','USD') DEFAULT 'IQD',
	`installmentStatus` enum('pending','paid','overdue','partial') DEFAULT 'pending',
	`paidAmount` bigint DEFAULT 0,
	`paidDate` varchar(64),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `debt_installments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `debt_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`debtId` int NOT NULL,
	`amount` bigint NOT NULL DEFAULT 0,
	`paymentCurrency` enum('IQD','USD') DEFAULT 'IQD',
	`paymentDate` varchar(64) NOT NULL,
	`paymentMethod` varchar(128),
	`receiptNumber` varchar(128),
	`notes` text,
	`createdBy` int,
	`createdByName` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `debt_payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `debts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`debtNumber` varchar(64) NOT NULL,
	`debtorName` varchar(256) NOT NULL,
	`debtorType` enum('individual','company','government','other') DEFAULT 'individual',
	`branch` varchar(128) NOT NULL,
	`province` varchar(128),
	`city` varchar(128),
	`debtType` enum('loan','guarantee','interest','penalty','other') DEFAULT 'loan',
	`originalAmount` bigint NOT NULL DEFAULT 0,
	`remainingAmount` bigint NOT NULL DEFAULT 0,
	`currency` enum('IQD','USD') DEFAULT 'IQD',
	`contractDate` varchar(64),
	`dueDate` varchar(64),
	`debtStatus` enum('active','collecting','disputed','rescheduled','settled','written_off') DEFAULT 'active',
	`debtPriority` enum('urgent','high','medium','low') DEFAULT 'medium',
	`legalCaseId` int,
	`notes` text,
	`createdBy` int,
	`createdByName` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `debts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `legal_reviews` ADD `requestDate` varchar(64);