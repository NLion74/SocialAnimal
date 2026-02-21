/*
  Warnings:

  - The `permission` column on the `CalendarShare` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `Friendship` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `defaultSharePermission` column on the `UserSettings` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `type` on the `Calendar` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "SharePermission" AS ENUM ('busy', 'titles', 'full');

-- CreateEnum
CREATE TYPE "FriendshipStatus" AS ENUM ('pending', 'accepted');

-- CreateEnum
CREATE TYPE "CalendarType" AS ENUM ('ics', 'google', 'apple');

-- DropForeignKey
ALTER TABLE "Event" DROP CONSTRAINT "Event_calendarId_fkey";

-- AlterTable
ALTER TABLE "Calendar" DROP COLUMN "type",
ADD COLUMN     "type" "CalendarType" NOT NULL;

-- AlterTable
ALTER TABLE "CalendarShare" DROP COLUMN "permission",
ADD COLUMN     "permission" "SharePermission" NOT NULL DEFAULT 'full';

-- AlterTable
ALTER TABLE "Friendship" DROP COLUMN "status",
ADD COLUMN     "status" "FriendshipStatus" NOT NULL DEFAULT 'pending';

-- AlterTable
ALTER TABLE "UserSettings" DROP COLUMN "defaultSharePermission",
ADD COLUMN     "defaultSharePermission" "SharePermission" NOT NULL DEFAULT 'full';

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "Calendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
