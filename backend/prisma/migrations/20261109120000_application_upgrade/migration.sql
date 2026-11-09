-- Complete additive upgrade from the 14 unchanged production migrations.
-- Keep all historical columns and values. Credential encryption runs in setup.
BEGIN;
-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN     "defaultFirstDayOfWeek" TEXT NOT NULL DEFAULT 'monday',
ADD COLUMN     "defaultTimezone" TEXT NOT NULL DEFAULT 'UTC',
ADD COLUMN     "maxCalendarsPerUser" INTEGER NOT NULL DEFAULT 25,
ADD COLUMN     "minSyncIntervalMinutes" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "requireEmailVerification" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requireTwoFactor" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "syncFutureDays" INTEGER NOT NULL DEFAULT 365,
ADD COLUMN     "syncPastDays" INTEGER NOT NULL DEFAULT 90;

-- AlterTable
ALTER TABLE "Calendar" ADD COLUMN     "color" TEXT NOT NULL DEFAULT 'blue',
ADD COLUMN     "connectionId" TEXT,
ADD COLUMN     "coverageEnd" TIMESTAMP(3),
ADD COLUMN     "coverageStart" TIMESTAMP(3),
ADD COLUMN     "lastAttempt" TIMESTAMP(3),
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "lastSuccess" TIMESTAMP(3),
ADD COLUMN     "leaseOwner" TEXT,
ADD COLUMN     "leaseUntil" TIMESTAMP(3),
ADD COLUMN     "remoteId" TEXT;

-- AlterTable
ALTER TABLE "CalendarShare" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "highlightRevision" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "rulesetId" TEXT;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "blocksTime" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isRecurring" BOOLEAN;

-- AlterTable
ALTER TABLE "InviteCode" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "label" TEXT,
ADD COLUMN     "revokedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "accountRole" TEXT NOT NULL DEFAULT 'normal',
ADD COLUMN     "authVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "disabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "passwordChangedAt" TIMESTAMP(3),
ADD COLUMN     "permissionsInitialized" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recoveryCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "securitySetupRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "totpLastStep" BIGINT,
ADD COLUMN     "totpSecret" TEXT,
ADD COLUMN     "twoFactorMethod" TEXT NOT NULL DEFAULT 'none';

-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN     "emailFriendAccepted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "emailFriendRequests" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "emailHighlights" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "emailSyncFailures" BOOLEAN NOT NULL DEFAULT false;

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
    "expiresAt" TIMESTAMP(3),
    "name" TEXT NOT NULL DEFAULT 'Sharing link',
    "rulesetId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
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

-- CreateTable
CREATE TABLE "PermissionRuleset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "seedKey" TEXT,
    "fallback" TEXT NOT NULL,
    "rules" JSONB NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PermissionRuleset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailVerification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "windowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestCount" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "EmailVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordReset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "authVersion" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryMail" (
    "recipientHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "userId" TEXT,
    "finishedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RecoveryMail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryThrottle" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecoveryThrottle_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AuthChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "authVersion" INTEGER NOT NULL,
    "verifier" TEXT,
    "secret" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarColor" (
    "userId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "color" TEXT NOT NULL,

    CONSTRAINT "CalendarColor_pkey" PRIMARY KEY ("userId","calendarId")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventHighlight" (
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,

    CONSTRAINT "EventHighlight_pkey" PRIMARY KEY ("userId","eventId")
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
CREATE INDEX "PermissionRuleset_userId_idx" ON "PermissionRuleset"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PermissionRuleset_userId_seedKey_key" ON "PermissionRuleset"("userId", "seedKey");

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerification_userId_key" ON "EmailVerification"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerification_tokenHash_key" ON "EmailVerification"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordReset_tokenHash_key" ON "PasswordReset"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordReset_userId_idx" ON "PasswordReset"("userId");

-- CreateIndex
CREATE INDEX "RecoveryMail_availableAt_idx" ON "RecoveryMail"("availableAt");

-- CreateIndex
CREATE INDEX "AuthChallenge_userId_purpose_idx" ON "AuthChallenge"("userId", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Calendar_connectionId_remoteId_key" ON "Calendar"("connectionId", "remoteId");

-- AddForeignKey
ALTER TABLE "Calendar" ADD CONSTRAINT "Calendar_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "Connection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarShare" ADD CONSTRAINT "CalendarShare_rulesetId_fkey" FOREIGN KEY ("rulesetId") REFERENCES "PermissionRuleset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "Calendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_rulesetId_fkey" FOREIGN KEY ("rulesetId") REFERENCES "PermissionRuleset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "Calendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_issuerId_fkey" FOREIGN KEY ("issuerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthFlow" ADD CONSTRAINT "OAuthFlow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthFlow" ADD CONSTRAINT "OAuthFlow_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "Connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionRuleset" ADD CONSTRAINT "PermissionRuleset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailVerification" ADD CONSTRAINT "EmailVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthChallenge" ADD CONSTRAINT "AuthChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarColor" ADD CONSTRAINT "CalendarColor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarColor" ADD CONSTRAINT "CalendarColor_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "Calendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventHighlight" ADD CONSTRAINT "EventHighlight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventHighlight" ADD CONSTRAINT "EventHighlight_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Preserve existing administrator access in the new role model.
UPDATE "User" SET "accountRole" = 'admin' WHERE "isAdmin" = true;

-- Queue invariants not expressible in the Prisma schema.
CREATE UNIQUE INDEX "SyncRun_one_active_calendar" ON "SyncRun" ("calendarId") WHERE "status" IN ('queued', 'running');
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_status_check" CHECK ("status" IN ('queued', 'running', 'succeeded', 'failed'));
COMMIT;
