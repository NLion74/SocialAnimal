# Database upgrade verification — 9 November 2026

The branch-only `20260929120000_rest_v1` migration is replaced by `20261109120000_application_upgrade`. All 14 migrations from local `main` remain byte-for-byte unchanged. The replacement is transactional and additive; runtime DDL and fresh-install schema push have been removed from setup.

## Verified locally

- Restored the original production dump into a separate PostgreSQL 16 container. The source dump was never overwritten.
- Compared the restored baseline with a replay of local `main`: columns/defaults/nullability, constraints, indexes and enums matched. All 14 recorded migration checksums matched the original files.
- Ran the resolved Compose setup command in the same production backend image used by build mode.
- Privately hashed every retained column and row of every original application table. All original values, including calendar timestamps, survived unchanged. Backfill now explicitly preserves `Calendar.updatedAt`.
- Verified decrypted provider configuration, remote calendar identifiers, connection ownership/type, equivalent sharing rules, original administrator access and unchanged preferences.
- Repeated setup without changing existing values or encrypted envelopes. Fresh installation produced identical columns, constraints, indexes and enums. Prisma reported no schema difference.
- Used synthetic production-era fixtures covering all six providers and all three historical share permissions to test malformed and incorrect encryption keys, checksum mismatch, unrecognized history, transaction rollback after SQL failure, migration resolution/retry, and hard interruption after the first backfill transaction committed. A retry retained completed ciphertext and finished the remaining calendars.
- Backed up and restored the upgraded exact-dump database, compared every table and schema object plus migration history, verified encrypted fields, and reran setup successfully.
- Backend: 213 tests passed; backend/frontend lint passed; production images built. Firefox: 12 active application scenarios plus screenshot and role/route reviews passed. Fresh-install and populated-upgrade setup entrypoints passed locally, including the production image. Workflow syntax passed actionlint. All four Compose configurations passed validation with synthetic environment files.

GitHub Actions now runs the populated fixture through the built production image and the actual setup entrypoint. It also exercises fresh installation, restoration, and Firefox. The hosted workflow itself has not been run from this working tree.

## Completed build-environment upgrade

The build PostgreSQL role password was aligned with the value already configured in `.env.build`, after taking a fresh private backup. The encryption key was unchanged during this repair. The earlier invalid 72-character encryption-key setting had been corrected only after confirming that the build database contained no encrypted-record columns.

The build database now records all 15 migrations. Setup backfilled all seven calendars, initialized equivalent permissions, and passed integrity validation. A comparison before backend startup confirmed that every original table value was retained. Setup also passed again during Compose startup. PostgreSQL, backend and frontend are healthy.

Smoke tests passed through the running frontend/API for legacy bcrypt and current Argon2 login, profile/preferences, administrator access and normal-user denial, calendar reads, friendship acceptance, grants, public previews, ICS delivery and grant revocation. Temporary smoke accounts and their associated records were removed.

Provider synchronization completed successfully for three calendars. Four Google calendars report authorization failures. A diagnostic request using the configured OAuth client and a preserved refresh token returned HTTP 401 `unauthorized_client`; check that `.env.build` uses the OAuth client authorized for those saved connections, or reconnect them with the intended client. No provider tokens were printed or replaced. These external authorization failures do not prevent application readiness.

Use the build environment file explicitly so Compose selects the rebuilt image instead of an older `:local` tag:

```sh
docker compose --env-file .env.build -f build-docker-compose.yml up -d --wait
```

Pre-upgrade database dumps and matching private environment backups are retained under the ignored `docker_data/build-upgrade-backups/` directory.

The real dump, credentials, hashes and private comparison artifacts are excluded from Git. Only the synthetic SQL fixture and generic verification helpers are repository artifacts.

## Reproduce synthetic upgrade verification

With backend dependencies installed, a disposable PostgreSQL database named `*_test`, and `TEST_DATABASE_URL`, `JWT_SECRET` and a test `CREDENTIAL_ENCRYPTION_KEY` configured:

```sh
cd backend
npm run build
node tests/database/fresh.mjs # Requires an empty TEST_DATABASE_URL database
node tests/database/permissions-setup.mjs
```

Set `SETUP_IMAGE` to the built backend image to run the same suite through Docker (Linux host networking). The suite creates and removes its own isolated databases. `tests/database/production-baseline.sql` contains only fictional records; the original historical migrations establish its schema and migration history.

Operational setup, retry, backup and encryption-key requirements are in the root [README](../../README.md). The separate [frontend review](../frontend-review/README.md) contains proposals and representative screenshots.
