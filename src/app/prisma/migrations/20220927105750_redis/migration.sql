/*
  Warnings:

  - You are about to drop the column `save_slot` on the `saves` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "saves" DROP COLUMN "save_slot",
ADD COLUMN     "score_days" INTEGER;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "api_key" TEXT;
