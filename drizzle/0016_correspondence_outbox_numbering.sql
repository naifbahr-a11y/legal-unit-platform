ALTER TABLE `correspondence` ADD `legalOutNumber` int;--> statement-breakpoint
ALTER TABLE `correspondence` ADD `mandobOutNumber` varchar(64);--> statement-breakpoint
ALTER TABLE `correspondence` ADD `officialNumber` varchar(128);--> statement-breakpoint
CREATE TABLE `correspondence_outbox_numbering` (
	`id` int NOT NULL,
	`counterYear` int NOT NULL,
	`nextLegalOutNumber` int NOT NULL DEFAULT 1,
	`officeCode` varchar(16) NOT NULL DEFAULT '573',
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `correspondence_outbox_numbering_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
INSERT INTO `correspondence_outbox_numbering` (`id`, `counterYear`, `nextLegalOutNumber`, `officeCode`)
VALUES (1, 2026, 303, '573');
