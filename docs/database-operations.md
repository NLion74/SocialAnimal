# Database operations

The production API and one-shot `migrate` service use the same release image and generated Prisma client. API startup waits for successful schema deployment and credential backfill. Development runs those steps before starting its watcher.

Historical migrations remain unchanged. The REST v1 migration adds connections, synchronization jobs, subscriptions, OAuth flows, and nullable calendar references. Existing calendar configuration and historical columns remain in place. Credential backfill creates one connection per calendar, preserves calendar IDs, processes restartable batches, and verifies ownership, references, and credential decryptability. Do not use `prisma db push`, reset the database, or remove old columns as part of deployment.

`CREDENTIAL_ENCRYPTION_KEY` must be 64 hexadecimal characters and must exist before backfill. Retain the same key after credentials have been encrypted. Back it up securely alongside the database and deployment configuration; a database backup alone cannot recover encrypted credentials.

## Upgrade procedure

1. Stop frontend traffic and the backend, including its synchronization runner. Keep PostgreSQL running.
2. Record the current release tag, database volume name, and configuration. Back up PostgreSQL with `pg_dump --format=custom`. Back up the encryption configuration separately and verify restoration in an isolated database.
3. Select the new release tag and pull the matching images. Keep `DATABASE_VOLUME` set to the existing database volume when changing Compose filenames or project names. Development uses `DEV_DATABASE_VOLUME` instead.
4. Run `docker compose run --rm migrate`. This deploys schema changes, resumes credential backfill, and validates the resulting connections. If it fails, leave writes stopped and correct the reported configuration or data inconsistency before retrying.
5. Start the matching backend and frontend with `docker compose up --wait`. Check `/health`, database-aware `/ready` inside the backend container, login, calendars, permissions, and feed delivery before reopening traffic.
6. Replace old calendar subscription URLs from the dashboard. Configure Google's redirect URI to end in `/api/v1/connections/google/callback`.

For build testing, add `--env-file .env.build -f build-docker-compose.yml` to Compose commands. Build, production, and legacy Compose have separate default volume names. An explicit `DATABASE_VOLUME` is required to share an existing database between them. Never remove a database volume during an upgrade.

Before reopening writes, rollback may restore the database backup together with the old release and its encryption configuration. After reopening writes, prefer forward repair to avoid discarding new data. Completed backfill batches can be retried without rewriting their encrypted credentials.

## Verification

Tests stay outside application source. `backend/tests/database/baseline.mjs` establishes the committed historical end-state in an empty disposable database. `upgrade.mjs` populates it and verifies that the additive migration preserves IDs, historical columns, permissions, credentials, invitations, and preferences. PostgreSQL integration tests exercise interrupted backfills, transactions, concurrent imports, leases, and authorization. `restore.mjs` restores a custom-format backup into another disposable database, compares table contents, and decrypts restored credentials.

These checks run in CI together with Firefox browser tests and smoke tests for development and production Compose. Provider authentication in automated tests is simulated; a live Apple or Google account is needed to verify remote account configuration.
