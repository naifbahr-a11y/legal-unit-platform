CREATE TABLE `correspondence_auto_numbering` (
	`id` int AUTO_INCREMENT NOT NULL,
	`counterYear` int NOT NULL,
	`type` enum('inbox','outbox') NOT NULL,
	`lastSeq` int NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `correspondence_auto_numbering_id` PRIMARY KEY(`id`),
	CONSTRAINT `correspondence_auto_numbering_year_type_idx` UNIQUE(`counterYear`,`type`)
);
