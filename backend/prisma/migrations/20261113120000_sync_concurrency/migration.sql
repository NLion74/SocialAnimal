ALTER TABLE "AppSettings" ADD COLUMN "syncConcurrency" INTEGER NOT NULL DEFAULT 3;

ALTER TABLE "AppSettings" ADD CONSTRAINT "AppSettings_syncConcurrency_check" CHECK ("syncConcurrency" BETWEEN 1 AND 16);
