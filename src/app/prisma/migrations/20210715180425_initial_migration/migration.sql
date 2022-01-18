-- CreateEnum
CREATE TYPE "account" AS ENUM ('free', 'admin');

-- CreateEnum
CREATE TYPE "game_difficulty" AS ENUM ('very_easy', 'easy', 'normal', 'hard', 'very_hard');

-- CreateEnum
CREATE TYPE "save_encoding" AS ENUM ('text', 'textzip', 'binzip');

-- CreateTable
CREATE TABLE "saves" (
    "id" TEXT NOT NULL,
    "created_on" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "filename" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "encoding" "save_encoding" NOT NULL,
    "hash" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "player" TEXT NOT NULL,
    "displayed_country_name" TEXT,
    "campaign_id" TEXT NOT NULL,
    "campaign_length" INTEGER,
    "ironman" BOOLEAN NOT NULL,
    "multiplayer" BOOLEAN,
    "observer" BOOLEAN,
    "dlc" INTEGER[],
    "save_version_first" SMALLINT NOT NULL,
    "save_version_second" SMALLINT NOT NULL,
    "save_version_third" SMALLINT NOT NULL,
    "save_version_fourth" SMALLINT NOT NULL,
    "checksum" TEXT NOT NULL,
    "achieve_ids" INTEGER[],
    "players" TEXT[],
    "player_start_tag" TEXT,
    "player_start_tag_name" TEXT,
    "game_difficulty" "game_difficulty" NOT NULL,
    "aar" TEXT,
    "playthrough_id" TEXT,
    "save_slot" BOOLEAN NOT NULL,

    PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "user_id" TEXT NOT NULL,
    "steam_id" TEXT,
    "steam_name" TEXT,
    "email" TEXT,
    "account" "account" NOT NULL DEFAULT E'free',
    "display" TEXT,
    "created_on" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE INDEX "idx_save_achieve_days" ON "saves"("days");

-- CreateIndex
CREATE INDEX "idx_save_achieve_ids" ON "saves" USING GIN("achieve_ids");

-- CreateIndex
CREATE INDEX "idx_save_campaign_id" ON "saves"("campaign_id");

-- CreateIndex
CREATE INDEX "idx_save_checksum" ON "saves"("checksum");

-- CreateIndex
CREATE INDEX "idx_save_creation" ON "saves"("created_on");

-- CreateIndex
CREATE INDEX "idx_save_dlc" ON "saves" USING GIN("dlc");

-- CreateIndex
CREATE INDEX "idx_save_hash" ON "saves"("hash");

-- CreateIndex
CREATE INDEX "idx_save_players" ON "saves" USING GIN("players");

-- CreateIndex
CREATE INDEX "idx_saves_playthrough_id" ON "saves"("playthrough_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_steam_id_key" ON "users"("steam_id");

-- CreateIndex
CREATE INDEX "idx_users_steam_id" ON "users"("steam_id");

-- AddForeignKey
ALTER TABLE "saves" ADD CONSTRAINT "saves_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
