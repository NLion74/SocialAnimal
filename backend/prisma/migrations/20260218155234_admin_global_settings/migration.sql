/*
  Warnings:

  - You are about to drop the column `inviteOnly` on the `UserSettings` table. All the data in the column will be lost.
  - You are about to drop the column `registrationsOpen` on the `UserSettings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isAdmin" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "UserSettings" DROP COLUMN "inviteOnly",
DROP COLUMN "registrationsOpen";

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "registrationsOpen" BOOLEAN NOT NULL DEFAULT true,
    "inviteOnly" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);
