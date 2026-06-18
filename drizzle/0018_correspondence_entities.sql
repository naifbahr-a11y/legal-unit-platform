CREATE TABLE `correspondence_entities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(256) NOT NULL,
	`entityKind` enum('sender','receiver','both') NOT NULL DEFAULT 'both',
	`category` varchar(128),
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `correspondence_entities_id` PRIMARY KEY(`id`),
	CONSTRAINT `correspondence_entities_name_unique` UNIQUE(`name`)
);
