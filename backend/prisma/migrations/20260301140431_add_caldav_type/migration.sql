/*
  Warnings:

  - The values [apple] on the enum `CalendarType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "CalendarType_new" AS ENUM ('ics', 'caldav', 'google', 'icloud', 'outlook', 'fastmail');
ALTER TABLE "Calendar" ALTER COLUMN "type" TYPE "CalendarType_new" USING ("type"::text::"CalendarType_new");
ALTER TYPE "CalendarType" RENAME TO "CalendarType_old";
ALTER TYPE "CalendarType_new" RENAME TO "CalendarType";
DROP TYPE "public"."CalendarType_old";
COMMIT;
