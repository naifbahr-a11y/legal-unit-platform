ALTER TABLE `users` MODIFY `role` enum('user','admin','supervisor') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `users` ADD `active` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `users` ADD `mustChangePassword` tinyint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `users` ADD `tokenVersion` int NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `users` ADD `branch` varchar(128);
