ALTER TABLE `users` ADD `x_handle` text;--> statement-breakpoint
ALTER TABLE `users` ADD `github_handle` text;--> statement-breakpoint
ALTER TABLE `users` ADD `handles_changed_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `users_x_handle_unique` ON `users` (`x_handle`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_github_handle_unique` ON `users` (`github_handle`);