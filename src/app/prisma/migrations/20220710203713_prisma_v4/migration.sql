-- DropIndex
DROP INDEX "idx_save_achieve_ids";

-- DropIndex
DROP INDEX "idx_save_dlc";

-- DropIndex
DROP INDEX "idx_save_players";

-- CreateIndex
CREATE INDEX "idx_save_achieve_ids" ON "saves"("achieve_ids");

-- CreateIndex
CREATE INDEX "idx_save_dlc" ON "saves"("dlc");

-- CreateIndex
CREATE INDEX "idx_save_players" ON "saves"("players");
