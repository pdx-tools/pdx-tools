CREATE TABLE "eu5_saves" (
	"id" text PRIMARY KEY NOT NULL,
	"created_on" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"filename" text NOT NULL,
	"user_id" text NOT NULL,
	"hash" text NOT NULL,
	"date" text NOT NULL,
	"playthrough_id" text NOT NULL,
	"playthrough_name" text NOT NULL,
	"players" text[] NOT NULL,
	"player_tag" text,
	"player_flag" text,
	"player_country_name" text,
	"version_major" integer NOT NULL,
	"version_minor" integer NOT NULL,
	"version_patch" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saves" RENAME TO "eu4_saves";--> statement-breakpoint
ALTER TABLE "eu4_saves" RENAME CONSTRAINT "saves_pkey" TO "eu4_saves_pkey";--> statement-breakpoint
ALTER TABLE "eu4_saves" RENAME CONSTRAINT "saves_user_id_users_user_id_fk" TO "eu4_saves_user_id_users_user_id_fk";--> statement-breakpoint
ALTER INDEX "idx_save_achieve_ids" RENAME TO "idx_eu4_save_achieve_ids";--> statement-breakpoint
ALTER INDEX "idx_save_creation" RENAME TO "idx_eu4_save_creation";--> statement-breakpoint
ALTER INDEX "idx_save_hash" RENAME TO "idx_eu4_save_hash";--> statement-breakpoint
ALTER INDEX "idx_save_players" RENAME TO "idx_eu4_save_players";--> statement-breakpoint
ALTER INDEX "idx_saves_playthrough_id" RENAME TO "idx_eu4_saves_playthrough_id";--> statement-breakpoint
ALTER TABLE "eu5_saves" ADD CONSTRAINT "eu5_saves_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_eu5_save_creation" ON "eu5_saves" USING btree ("created_on");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_eu5_save_hash" ON "eu5_saves" USING btree ("hash");--> statement-breakpoint
CREATE INDEX "idx_eu5_saves_user_created" ON "eu5_saves" USING btree ("user_id","created_on" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_eu5_saves_playthrough_id" ON "eu5_saves" USING btree ("playthrough_id");--> statement-breakpoint
CREATE INDEX "idx_eu4_saves_user_created" ON "eu4_saves" USING btree ("user_id","created_on" DESC NULLS LAST);
