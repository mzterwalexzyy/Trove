CREATE INDEX `payouts_winner_idx` ON `payouts` (`winner_address`);--> statement-breakpoint
CREATE INDEX `submissions_participant_idx` ON `submissions` (`participant_address`);--> statement-breakpoint
CREATE INDEX `transactions_from_idx` ON `transactions` (`from_address`);