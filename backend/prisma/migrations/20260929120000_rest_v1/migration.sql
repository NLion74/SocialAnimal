BEGIN;
-- AlterTable
ALTER TABLE "Calendar" ADD COLUMN     "connectionId" TEXT,
ADD COLUMN     "lastAttempt" TIMESTAMP(3),
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "lastSuccess" TIMESTAMP(3),
ADD COLUMN     "leaseOwner" TEXT,
ADD COLUMN     "leaseUntil" TIMESTAMP(3),
ADD COLUMN     "remoteId" TEXT;

-- CreateTable
CREATE TABLE "Connection" (
	"id" TEXT NOT NULL,
	"userId" TEXT NOT NULL,
	"type" "CalendarType" NOT NULL,
	"name" TEXT NOT NULL,
	"credentials" TEXT NOT NULL,
	"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"updatedAt" TIMESTAMP(3) NOT NULL,

	CONSTRAINT "Connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncRun" (
	"id" TEXT NOT NULL,
	"calendarId" TEXT NOT NULL,
	"status" TEXT NOT NULL DEFAULT 'queued',
	"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"startedAt" TIMESTAMP(3),
	"finishedAt" TIMESTAMP(3),
	"error" TEXT,
	"eventsSynced" INTEGER,

	CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
	"id" TEXT NOT NULL,
	"tokenHash" TEXT NOT NULL,
	"calendarId" TEXT NOT NULL,
	"issuerId" TEXT NOT NULL,
	"ceiling" "SharePermission" NOT NULL,
	"revokedAt" TIMESTAMP(3),
	"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

	CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthFlow" (
	"id" TEXT NOT NULL,
	"stateHash" TEXT NOT NULL,
	"userId" TEXT NOT NULL,
	"expiresAt" TIMESTAMP(3) NOT NULL,
	"consumedAt" TIMESTAMP(3),
	"connectionId" TEXT,

	CONSTRAINT "OAuthFlow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Connection_userId_idx" ON "Connection"("userId");

-- CreateIndex
CREATE INDEX "SyncRun_status_createdAt_idx" ON "SyncRun"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_tokenHash_key" ON "Subscription"("tokenHash");

-- CreateIndex
CREATE INDEX "Subscription_calendarId_issuerId_idx" ON "Subscription"("calendarId", "issuerId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthFlow_stateHash_key" ON "OAuthFlow"("stateHash");

-- CreateIndex
CREATE UNIQUE INDEX "Calendar_connectionId_remoteId_key" ON "Calendar"("connectionId", "remoteId");

-- AddForeignKey
ALTER TABLE "Calendar" ADD CONSTRAINT "Calendar_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "Connection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "Calendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "Calendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_issuerId_fkey" FOREIGN KEY ("issuerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthFlow" ADD CONSTRAINT "OAuthFlow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthFlow" ADD CONSTRAINT "OAuthFlow_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "Connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One outstanding job per calendar, across processes and manual/scheduled submissions.
CREATE UNIQUE INDEX "SyncRun_one_active_calendar" ON "SyncRun" ("calendarId") WHERE "status" IN ('queued', 'running');
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_status_check" CHECK ("status" IN ('queued', 'running', 'succeeded', 'failed'));

COMMIT;
