# Modular monolith

One process, one PostgreSQL database, one generated Prisma client. `app.ts` composes route plugins. Each module's `index.ts` is its public interface; ESLint rejects imports of another module's internals, infrastructure-to-module dependencies, and persistence imports in provider adapters.

| Module       | Responsibility                                                                  |
| ------------ | ------------------------------------------------------------------------------- |
| identity     | Sessions, password compatibility, transactional registration                    |
| profiles     | Profile editing, password change, account deletion                              |
| invitations  | Invite generation and transactional redemption                                  |
| settings     | Instance policy and user preferences                                            |
| social       | Friendships and user search                                                     |
| calendars    | Calendar management and authorized interval event reads                         |
| integrations | Connections, OAuth, provider registry, import identity, sync persistence        |
| sharing      | Grants, authorization, field masking, subscription credentials and ICS delivery |

`core/database` owns the typed client. `core/http` owns error handling, schema helpers, pagination and OpenAPI generation. `core/jobs` runs injected work and coordinates shutdown. `core/config` reads runtime configuration; `core/secrets` owns versioned AES-256-GCM envelopes and opaque-token hashing. No feature imports exist in core.

Provider adapters expose optional, independent sync, discovery, test and OAuth capabilities. The registry reports only the operations an adapter implements; unsupported operations return `422 CAPABILITY_UNSUPPORTED`. Apple Calendar (iCloud) uses Apple’s CalDAV endpoint with an Apple ID and app-specific password. Adapters fetch, discover and normalize. Application operations persist credentials and reconcile events. The result union distinguishes complete/incomplete snapshots and deltas; no new provider delta protocol is implemented. A complete empty snapshot deletes stale events. Failed or incomplete snapshots cannot imply deletions. The successful event transaction also commits the job and calendar success state; lease ownership fences late workers.

The in-process runner processes up to `SYNC_CONCURRENCY` jobs per tick (default 3). PostgreSQL serializes submissions, enforces one active job per calendar, and stores a renewable two-minute lease. Expired leases return running jobs to the queue. `0` means manual only; positive intervals are bounded by `MIN_SYNC_INTERVAL_MINUTES` (default 15). Provider errors are deliberately sanitized to avoid leaking credentials in URLs or upstream response bodies.

Sharing is checked on every API read and feed request. Subscriptions store only token hashes, calendar, issuer, permission ceiling and revocation state. The more restrictive of the current grant and ceiling governs output. Feed tokens cannot act as sessions. Request logging is disabled because feed URLs and OAuth callbacks are credentials; reverse proxies must redact these URLs too.

Frontend route pages compose feature screens. Feature API methods wrap generated endpoint types; `SessionProvider` owns session state, and 403 errors remain local. Calendar date and layout helpers remain unchanged. The generated OpenAPI document uses the same schemas as runtime validation and serialization.

The API is served under `/api/v1`; known retired API roots return `410 API_VERSION_RETIRED`, while unknown routes return 404. Old JWT export URLs must be replaced using the calendar subscription dialog. Google OAuth uses `/api/v1/connections/google/callback`, which must also be configured in Google Cloud. Connections require a persistent `CREDENTIAL_ENCRYPTION_KEY`; losing that key prevents credential decryption. See [database operations](database-operations.md) for the deployment and recovery procedure.

Future availability computation belongs in a separate module consuming authorized, masked event intervals through public interfaces; it must not read provider credentials or bypass sharing. Future identity challenges (verification, reset, TOTP) belong behind identity's public interface with purpose-specific, expiring, single-use credentials. Neither module is implemented in this release. Native event CRUD, roles/demo users and additional providers are also deferred.

Tests live under `backend/tests` and `frontend/tests`, including Firefox browser tests in `frontend/tests/e2e`. Source directories contain application code only.
