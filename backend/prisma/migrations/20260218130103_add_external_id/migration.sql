/*
  Warnings:

  - A unique constraint covering the columns `[calendarId,externalId]` on the table `Event` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "Event" DROP CONSTRAINT "Event_calendarId_fkey";

-- DropIndex
DROP INDEX "Event_calendarId_startTime_idx";

-- DropIndex
DROP INDEX "Event_startTime_idx";

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "externalId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Event_calendarId_externalId_key" ON "Event"("calendarId", "externalId");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "Calendar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
