/*
  Warnings:

  - A unique constraint covering the columns `[externalId]` on the table `Event` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "Event" DROP CONSTRAINT "Event_calendarId_fkey";

-- DropIndex
DROP INDEX "Event_calendarId_externalId_key";

-- CreateIndex
CREATE UNIQUE INDEX "Event_externalId_key" ON "Event"("externalId");

-- CreateIndex
CREATE INDEX "Event_calendarId_idx" ON "Event"("calendarId");

-- CreateIndex
CREATE INDEX "Event_startTime_idx" ON "Event"("startTime");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "Calendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
