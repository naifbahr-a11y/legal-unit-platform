ALTER TABLE `correspondence_outbox_numbering` CHANGE `nextLegalOutNumber` `lastApprovedLegalOutNumber` int NOT NULL DEFAULT 0;--> statement-breakpoint
UPDATE `correspondence_outbox_numbering` SET `lastApprovedLegalOutNumber` = 302 WHERE `id` = 1 AND `lastApprovedLegalOutNumber` = 303;
