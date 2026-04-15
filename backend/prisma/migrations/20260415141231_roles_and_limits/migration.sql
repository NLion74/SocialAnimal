/*
  Warnings:

  - You are about to drop the column `isAdmin` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `defaultSharePermission` on the `UserSettings` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'user', 'readonly');

-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN     "maxCalendarsPerUser" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "minSyncInterval" INTEGER NOT NULL DEFAULT 15;

-- AlterTable
ALTER TABLE "User"
  ADD COLUMN     "maxCalendarsOverride" INTEGER,
  ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'user',
  ADD COLUMN     "syncIntervalOverride" INTEGER;
  
UPDATE "User" SET "role" = 'admin' WHERE "isAdmin" = true;
ALTER TABLE "User" DROP COLUMN "isAdmin";

-- AlterTable
ALTER TABLE "UserSettings" DROP COLUMN "defaultSharePermission",
ALTER COLUMN "timezone" SET DEFAULT 'Europe/Berlin';
