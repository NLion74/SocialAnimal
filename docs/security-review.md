# Security review · 2026-10-01

Sharing links use random credentials stored only as hashes. Feed and web-preview reads recheck current access and apply the subscription's permission ceiling. Replacing a subscription revokes its previous links in the same transaction. Preview responses allowlist event fields, exclude account/provider details, and disable caching. Browser links keep the token in the fragment, which is not sent in page requests or referrers.

Provider requests validate DNS results at socket creation, reject private and reserved addresses unless their exact hostname is explicitly configured in `PRIVATE_PROVIDER_HOSTS`, check each redirect, refuse HTTPS downgrades, and strip authorization on cross-origin redirects. Responses are limited to 16 MiB. Self-hosted providers on private networks need an explicit allowlist entry.

The frontend dependency audit reports no known advisories after compatible dependency updates and the Next.js security update. The backend audit still reports advisories in Prisma's tooling dependency chain (`deepmerge-ts`, `mysql2`, and their parent packages), plus a low-severity development-tool advisory in `esbuild`. The database tools are included in the backend image for initialization. The audit's suggested Prisma downgrade is a breaking change and has not been applied. The application uses PostgreSQL and does not expose a Prisma tooling server, but these dependencies still need upstream fixes or a separately tested replacement.

Remaining work includes API/authentication rate limiting, session revocation after password changes, email verification, password recovery, and two-factor authentication. Existing historical calendar configuration is retained and can contain credentials; new connection credentials are encrypted. Review retained configuration before treating a database copy as free of plaintext secrets.

Automated checks cover sharing authorization, revocation, secret exclusion, atomic replacement, private-network address classification, unsafe redirects, frontend authentication handling, and anonymous browser previews. They do not constitute a complete penetration test or verification against live provider accounts.
