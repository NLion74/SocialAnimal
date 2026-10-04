import { prisma } from "./index";

// Additive, idempotent setup. Never schema-push a populated database.
export async function ensurePermissionsSchema() {
	await prisma.$transaction(async (tx) => {
		await tx.$executeRaw`SELECT pg_advisory_xact_lock(742902)`;
		await tx.$executeRaw`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "accountRole" TEXT NOT NULL DEFAULT 'normal', ADD COLUMN IF NOT EXISTS "disabled" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3), ADD COLUMN IF NOT EXISTS "permissionsInitialized" BOOLEAN NOT NULL DEFAULT false`;
		await tx.$executeRaw`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "authVersion" INTEGER NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP(3)`;

		await tx.$executeRaw`CREATE TABLE IF NOT EXISTS "PasswordReset" (
			"id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
			"email" TEXT NOT NULL, "tokenHash" TEXT NOT NULL UNIQUE, "authVersion" INTEGER NOT NULL,
			"expiresAt" TIMESTAMP(3) NOT NULL
		)`;

		await tx.$executeRaw`CREATE INDEX IF NOT EXISTS "PasswordReset_userId_idx" ON "PasswordReset"("userId")`;

		await tx.$executeRaw`CREATE TABLE IF NOT EXISTS "RecoveryMail" (
			"id" TEXT PRIMARY KEY, "kind" TEXT NOT NULL, "payload" TEXT NOT NULL,
			"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3) NOT NULL,
			"availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "leaseUntil" TIMESTAMP(3), "attempts" INTEGER NOT NULL DEFAULT 0
		)`;

		await tx.$executeRaw`CREATE INDEX IF NOT EXISTS "RecoveryMail_availableAt_idx" ON "RecoveryMail"("availableAt")`;

		await tx.$executeRaw`CREATE TABLE IF NOT EXISTS "RecoveryThrottle" (
			"key" TEXT PRIMARY KEY, "count" INTEGER NOT NULL DEFAULT 1, "expiresAt" TIMESTAMP(3) NOT NULL
		)`;

		await tx.$executeRaw`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twoFactorMethod" TEXT NOT NULL DEFAULT 'none', ADD COLUMN IF NOT EXISTS "totpSecret" TEXT, ADD COLUMN IF NOT EXISTS "totpLastStep" BIGINT, ADD COLUMN IF NOT EXISTS "recoveryCodes" TEXT[] NOT NULL DEFAULT '{}', ADD COLUMN IF NOT EXISTS "securitySetupRequired" BOOLEAN NOT NULL DEFAULT false`;
		await tx.$executeRaw`ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "requireTwoFactor" BOOLEAN NOT NULL DEFAULT false`;
		await tx.$executeRaw`ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "isRecurring" BOOLEAN`;
		await tx.$executeRaw`ALTER TABLE "CalendarShare" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3)`;
		await tx.$executeRaw`ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3)`;
		await tx.$executeRaw`ALTER TABLE "RecoveryMail" ADD COLUMN IF NOT EXISTS "recipientHash" TEXT, ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'queued', ADD COLUMN IF NOT EXISTS "userId" TEXT, ADD COLUMN IF NOT EXISTS "finishedAt" TIMESTAMP(3), ADD COLUMN IF NOT EXISTS "lastError" TEXT`;

		await tx.$executeRaw`CREATE TABLE IF NOT EXISTS "AuthChallenge" (
			"id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
			"purpose" TEXT NOT NULL, "method" TEXT NOT NULL, "authVersion" INTEGER NOT NULL,
			"verifier" TEXT, "secret" TEXT, "attempts" INTEGER NOT NULL DEFAULT 0,
			"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3) NOT NULL
		)`;

		await tx.$executeRaw`CREATE INDEX IF NOT EXISTS "AuthChallenge_userId_purpose_idx" ON "AuthChallenge"("userId", "purpose")`;

		await tx.$executeRaw`UPDATE "User" SET "accountRole" = 'admin' WHERE "isAdmin" = true AND "accountRole" = 'normal'`;
		await tx.$executeRaw`ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "requireEmailVerification" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS "maxCalendarsPerUser" INTEGER NOT NULL DEFAULT 25, ADD COLUMN IF NOT EXISTS "minSyncIntervalMinutes" INTEGER NOT NULL DEFAULT 15`;

		await tx.$executeRaw`ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "syncPastDays" INTEGER NOT NULL DEFAULT 90, ADD COLUMN IF NOT EXISTS "syncFutureDays" INTEGER NOT NULL DEFAULT 365, ADD COLUMN IF NOT EXISTS "defaultTimezone" TEXT NOT NULL DEFAULT 'UTC', ADD COLUMN IF NOT EXISTS "defaultFirstDayOfWeek" TEXT NOT NULL DEFAULT 'monday'`;
		await tx.$executeRaw`ALTER TABLE "InviteCode" ADD COLUMN IF NOT EXISTS "label" TEXT, ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3), ADD COLUMN IF NOT EXISTS "revokedAt" TIMESTAMP(3)`;

		await tx.$executeRaw`CREATE TABLE IF NOT EXISTS "PermissionRuleset" (
			"id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
			"name" TEXT NOT NULL, "seedKey" TEXT, "fallback" TEXT NOT NULL,
			"rules" JSONB NOT NULL DEFAULT '[]', "version" INTEGER NOT NULL DEFAULT 1,
			"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`;

		await tx.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS "PermissionRuleset_userId_seedKey_key" ON "PermissionRuleset"("userId", "seedKey")`;
		await tx.$executeRaw`CREATE INDEX IF NOT EXISTS "PermissionRuleset_userId_idx" ON "PermissionRuleset"("userId")`;

		await tx.$executeRaw`CREATE TABLE IF NOT EXISTS "EmailVerification" (
			"id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
			"email" TEXT NOT NULL, "tokenHash" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "consumedAt" TIMESTAMP(3),
			"lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
			"windowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "requestCount" INTEGER NOT NULL DEFAULT 1
		)`;

		await tx.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS "EmailVerification_userId_key" ON "EmailVerification"("userId")`;
		await tx.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS "EmailVerification_tokenHash_key" ON "EmailVerification"("tokenHash")`;
		await tx.$executeRaw`ALTER TABLE "CalendarShare" ADD COLUMN IF NOT EXISTS "rulesetId" TEXT`;

		await tx.$executeRaw`DO $$ BEGIN
			IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CalendarShare_rulesetId_fkey') THEN
				ALTER TABLE "CalendarShare" ADD CONSTRAINT "CalendarShare_rulesetId_fkey" FOREIGN KEY ("rulesetId") REFERENCES "PermissionRuleset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
			END IF;
		END $$`;

		await tx.$executeRaw`ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT 'Sharing link', ADD COLUMN IF NOT EXISTS "rulesetId" TEXT, ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1`;

		await tx.$executeRaw`DO $$ BEGIN
			IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Subscription_rulesetId_fkey') THEN
				ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_rulesetId_fkey" FOREIGN KEY ("rulesetId") REFERENCES "PermissionRuleset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
			END IF;
		END $$`;
	});
}
