CREATE TABLE `auth_nonces` (
	`nonce` text PRIMARY KEY NOT NULL,
	`address` text NOT NULL,
	`used` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bounties` (
	`id` text PRIMARY KEY NOT NULL,
	`creator_address` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`requirements` text DEFAULT '' NOT NULL,
	`category` text NOT NULL,
	`reward_luna` integer NOT NULL,
	`funded_luna` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`deadline_at` integer NOT NULL,
	`escrow_address` text NOT NULL,
	`funding_tx_hash` text,
	`winner_address` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`funded_at` integer,
	`completed_at` integer,
	FOREIGN KEY (`creator_address`) REFERENCES `users`(`address`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `bounties_status_idx` ON `bounties` (`status`);--> statement-breakpoint
CREATE INDEX `bounties_creator_idx` ON `bounties` (`creator_address`);--> statement-breakpoint
CREATE INDEX `bounties_deadline_idx` ON `bounties` (`deadline_at`);--> statement-breakpoint
CREATE TABLE `escrow_log` (
	`id` text PRIMARY KEY NOT NULL,
	`bounty_id` text,
	`event` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`amount_luna` integer,
	`tx_hash` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `escrow_log_bounty_idx` ON `escrow_log` (`bounty_id`);--> statement-breakpoint
CREATE TABLE `payouts` (
	`bounty_id` text PRIMARY KEY NOT NULL,
	`winner_address` text NOT NULL,
	`amount_luna` integer NOT NULL,
	`status` text DEFAULT 'claimed' NOT NULL,
	`tx_hash` text,
	`claimed_at` integer DEFAULT (unixepoch()) NOT NULL,
	`verified_at` integer,
	`failure_reason` text,
	FOREIGN KEY (`bounty_id`) REFERENCES `bounties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `reputation_events` (
	`id` text PRIMARY KEY NOT NULL,
	`address` text NOT NULL,
	`type` text NOT NULL,
	`bounty_id` text,
	`amount_luna` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`address`) REFERENCES `users`(`address`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bounty_id`) REFERENCES `bounties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `reputation_address_idx` ON `reputation_events` (`address`);--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`bounty_id` text NOT NULL,
	`participant_address` text NOT NULL,
	`content` text NOT NULL,
	`link` text,
	`status` text DEFAULT 'submitted' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`bounty_id`) REFERENCES `bounties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`participant_address`) REFERENCES `users`(`address`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `submissions_unique_participant` ON `submissions` (`bounty_id`,`participant_address`);--> statement-breakpoint
CREATE INDEX `submissions_bounty_idx` ON `submissions` (`bounty_id`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`tx_hash` text NOT NULL,
	`bounty_id` text,
	`type` text NOT NULL,
	`from_address` text NOT NULL,
	`to_address` text NOT NULL,
	`value_luna` integer NOT NULL,
	`memo` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`block_number` integer,
	`rejected_reason` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`verified_at` integer,
	FOREIGN KEY (`bounty_id`) REFERENCES `bounties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_hash_unique` ON `transactions` (`tx_hash`);--> statement-breakpoint
CREATE INDEX `transactions_bounty_idx` ON `transactions` (`bounty_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`address` text PRIMARY KEY NOT NULL,
	`display_name` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`last_seen_at` integer DEFAULT (unixepoch()) NOT NULL
);
