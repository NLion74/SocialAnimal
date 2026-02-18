/*
  Warnings:

  - You are about to drop the column `enabled` on the `Calendar` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Calendar" DROP CONSTRAINT "Calendar_userId_fkey";

-- DropIndex
DROP INDEX "Calendar_userId_idx";

-- DropIndex
DROP INDEX "Calendar_userId_name_key";

-- AlterTable
ALTER TABLE "Calendar" DROP COLUMN "enabled",
ADD COLUMN     "url" TEXT,
ALTER COLUMN "config" SET DEFAULT '{}';

-- AddForeignKey
ALTER TABLE "Calendar" ADD CONSTRAINT "Calendar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
