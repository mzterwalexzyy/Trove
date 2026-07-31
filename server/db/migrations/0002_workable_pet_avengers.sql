CREATE TABLE `referral_payouts` (
	`bounty_id` text PRIMARY KEY NOT NULL,
	`referrer_address` text NOT NULL,
	`amount_luna` integer NOT NULL,
	`status` text DEFAULT 'claimed' NOT NULL,
	`tx_hash` text,
	`claimed_at` integer DEFAULT (unixepoch()) NOT NULL,
	`verified_at` integer,
	`failure_reason` text,
	FOREIGN KEY (`bounty_id`) REFERENCES `bounties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `referral_payouts_referrer_idx` ON `referral_payouts` (`referrer_address`);--> statement-breakpoint
CREATE TABLE `referrals` (
	`id` text PRIMARY KEY NOT NULL,
	`bounty_id` text NOT NULL,
	`hunter_address` text NOT NULL,
	`referrer_address` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`bounty_id`) REFERENCES `bounties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `referrals_unique_hunter` ON `referrals` (`bounty_id`,`hunter_address`);--> statement-breakpoint
CREATE INDEX `referrals_referrer_idx` ON `referrals` (`referrer_address`);