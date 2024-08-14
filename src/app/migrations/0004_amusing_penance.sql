DROP INDEX IF EXISTS "idx_save_hash";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_save_hash" ON "saves" USING btree ("hash");