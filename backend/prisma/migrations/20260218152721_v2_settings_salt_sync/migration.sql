-- AlterTable
ALTER TABLE "Calendar" ADD COLUMN     "syncInterval" INTEGER NOT NULL DEFAULT 60;

-- AlterTable
ALTER TABLE "CalendarShare" ALTER COLUMN "permission" SET DEFAULT 'full';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "salt" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "UserSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "defaultSharePermission" TEXT NOT NULL DEFAULT 'full',
    "registrationsOpen" BOOLEAN NOT NULL DEFAULT true,
    "inviteOnly" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InviteCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "usedBy" TEXT,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InviteCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "InviteCode_code_key" ON "InviteCode"("code");

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
