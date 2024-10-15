DO $$ BEGIN
 CREATE TYPE "account" AS ENUM('free', 'admin');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 CREATE TYPE "game_difficulty" AS ENUM('very_easy', 'easy', 'normal', 'hard', 'very_hard');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 CREATE TYPE "save_encoding" AS ENUM('text', 'textzip', 'binzip');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "saves" (
	"id" text PRIMARY KEY NOT NULL,
	"created_on" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"filename" text NOT NULL,
	"user_id" text NOT NULL,
	"encoding" save_encoding NOT NULL,
	"hash" text NOT NULL,
	"date" text NOT NULL,
	"days" integer NOT NULL,
	"score_days" integer,
	"player" text NOT NULL,
	"displayed_country_name" text,
	"campaign_id" text NOT NULL,
	"campaign_length" integer,
	"ironman" boolean NOT NULL,
	"multiplayer" boolean,
	"observer" boolean,
	"dlc" integer[],
	"save_version_first" smallint NOT NULL,
	"save_version_second" smallint NOT NULL,
	"save_version_third" smallint NOT NULL,
	"save_version_fourth" smallint NOT NULL,
	"checksum" text NOT NULL,
	"achieve_ids" integer[],
	"players" text[],
	"player_start_tag" text,
	"player_start_tag_name" text,
	"game_difficulty" game_difficulty NOT NULL,
	"aar" text,
	"playthrough_id" text
);

CREATE TABLE IF NOT EXISTS "users" (
	"user_id" text PRIMARY KEY NOT NULL,
	"steam_id" text,
	"steam_name" text,
	"email" text,
	"account" account DEFAULT 'free' NOT NULL,
	"display" text,
	"created_on" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"api_key" text
);

DO $$ BEGIN
 ALTER TABLE "saves" ADD CONSTRAINT "saves_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "idx_save_achieve_days" ON "saves" ("days");
CREATE INDEX IF NOT EXISTS "idx_save_achieve_ids" ON "saves" ("achieve_ids");
CREATE INDEX IF NOT EXISTS "idx_save_campaign_id" ON "saves" ("campaign_id");
CREATE INDEX IF NOT EXISTS "idx_save_checksum" ON "saves" ("checksum");
CREATE INDEX IF NOT EXISTS "idx_save_creation" ON "saves" ("created_on");
CREATE INDEX IF NOT EXISTS "idx_save_dlc" ON "saves" ("dlc");
CREATE INDEX IF NOT EXISTS "idx_save_hash" ON "saves" ("hash");
CREATE INDEX IF NOT EXISTS "idx_save_players" ON "saves" ("players");
CREATE INDEX IF NOT EXISTS "idx_saves_playthrough_id" ON "saves" ("playthrough_id");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_users_steam_id" ON "users" ("steam_id");