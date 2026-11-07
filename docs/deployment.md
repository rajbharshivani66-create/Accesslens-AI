# Deployment and Local Setup

## Local Supabase configuration

1. Copy the root `.env.example` to `.env`.
2. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, and `SUPABASE_ANON_KEY` from the Supabase project API settings.
3. Set `DATABASE_URL` to the Supabase Postgres pooler URL and `DIRECT_URL` to the direct Postgres connection string.
4. Add the web origin plus `/auth/callback` to the Supabase Auth allowed redirect URLs.
5. Apply the initial Prisma migration:

```bash
pnpm install
pnpm db:generate
pnpm db:validate
pnpm db:migrate
```

`pnpm db:migrate` deploys checked-in migrations without creating a shadow database. The API validates required `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, and `SUPABASE_ANON_KEY` values on startup. It reports configuration errors by variable name and does not print configured values. `pnpm db` only generates Prisma Client and validates the schema; it does not connect to a database or apply migrations.

For v1.3.0, use the [migration verification checklist](./migration-checklist.md) and test against a disposable staging database before any production change. Migration execution is a manual developer action and must not run automatically during deployment. Never use `migrate reset` for an existing database.

## Optional team invitation email

The API can send invitation emails using the Resend HTTP API. Configure both of these **only in the API/server environment**:

- `RESEND_API_KEY` — private Resend API key.
- `INVITATION_FROM_EMAIL` — sender address verified with Resend.
- `GEMINI_API_KEY` — optional server-side Gemini key for AI finding assistance.
- `GEMINI_MODEL` — optional Interactions API model ID; defaults to `gemini-3.8-flash`.

If either variable is missing, startup rejects the partial configuration. If both are blank/unset, the integration is disabled and the Teams UI provides a manually shareable invitation link. On provider failure, the invitation remains valid and the API returns `emailStatus: FAILED` with the manual link; on success the status is `ACCEPTED`, meaning the provider accepted the request, not that the recipient's mailbox delivered it. Provider secrets and raw invitation tokens are not logged. Never use `NEXT_PUBLIC_` for these settings.

Gemini settings are optional and must remain API-server secrets. Without a key, AI generation returns an unavailable response and stores no fabricated output. The API sends bounded sanitized finding evidence without the scanned page URL, validates structured responses, and displays code suggestions as text only. A reviewer must decide whether to apply and test a suggestion.

To enable Jira Cloud OAuth, configure `JIRA_CLIENT_ID`, `JIRA_CLIENT_SECRET`, `JIRA_REDIRECT_URI`, and a random 32-byte hex `JIRA_TOKEN_ENCRYPTION_KEY` in the API environment. The redirect URI must exactly match the Atlassian Developer Console callback and must use HTTPS in production. Configure classic Jira scopes `read:jira-work`, `write:jira-work`, and `offline_access`. If any setting is missing, Jira OAuth remains disabled. Do not expose the client secret or token encryption key to the browser.

Invitation URLs continue to use a URL fragment, and only the token hash is stored. Acceptance still requires the authenticated, confirmed email to match the invitation and the token to be unexpired and unused.

## API rate limits

The API uses `express-rate-limit` with `rate-limit-redis` and the `redis` client. Development and tests can use process-local counters; **production startup requires `RATE_LIMIT_REDIS_URL`** so every API instance shares counters. Use a private Redis/Valkey-compatible service and a `rediss://` URL where TLS is available. If Redis is unreachable, startup fails or requests fail closed; the API does not silently disable production limits.

Configure `TRUSTED_PROXY_CIDRS` as a comma-separated list of exact ingress proxy IPs/CIDRs only when the ingress is trusted and rewrites forwarded-IP headers. Express trusts no proxy headers by default. Wildcard and `/0` ranges are rejected; do not set a broad client network. When unset, limits use the direct peer IP; behind a shared proxy that can place multiple clients in one quota. Confirm the hosting provider's proxy ranges and ingress behavior before enabling trusted proxy CIDRs.

Default per-client limits are API 300 requests/15 minutes by IP, auth API 30/15 minutes by IP, authenticated API 600/15 minutes per profile, writes 60/15 minutes per profile, invitations 5/hour per profile, and dashboard/reserved scan/AI operations 10/minute per profile. Override with `RATE_LIMIT_API_MAX`, `RATE_LIMIT_API_WINDOW_MS`, and matching `AUTH`, `USER`, `WRITE`, `INVITATION`, and `EXPENSIVE` pairs. Rate-limit responses use HTTP 429, a stable `{ error: { code: "RATE_LIMITED", message } }` body, `RateLimit` headers, and `Retry-After`. `/health` is outside API quotas. Supabase-hosted registration/login flows do not pass through this API; configure abuse protection in Supabase as well.

## Scanner runtime

The API requires Playwright's Chromium headless shell. In a local environment, install the matching browser with `pnpm --filter @accesslens-ai/api exec playwright install chromium --only-shell`. Deployment build configuration must install the browser matching the locked Playwright version. Run the API as a non-root user with Chromium sandbox support; do not add `--no-sandbox`. Configure the scanner limits from `.env.example`. The scan database migration is not automatically applied by startup and must be reviewed/applied to a non-production database before testing the workflow. The worker runs in the API process and coordinates through PostgreSQL; multi-instance queue behavior is implemented with atomic row claims but has not been tested against a live database.

## Development

```bash
pnpm dev
```

The Next.js app uses port 3000 by default; the API uses `PORT` (default 4000) and requires a working PostgreSQL connection before startup.

## Deployment targets

- **Web:** `apps/web`, intended for Vercel. Configure all `NEXT_PUBLIC_*` values and `NEXT_PUBLIC_API_URL` at build time.
- **API:** `apps/api`, intended for Render. Configure Supabase URL/anon key, `DATABASE_URL`, `DIRECT_URL`, `FRONTEND_URL`, and `PORT`. `/health` is the readiness endpoint.
- **API rate limits:** Production also requires `RATE_LIMIT_REDIS_URL`. Configure `TRUSTED_PROXY_CIDRS` only after confirming the proxy's actual source ranges and forwarded-header rewrite behavior.
- **Optional API mail:** Configure `RESEND_API_KEY` and `INVITATION_FROM_EMAIL` in the hosting provider's secret environment, or leave both unset for manual invite links.
- **Database:** Supabase PostgreSQL with Prisma Migrate.

`vercel.json` and `render.yaml` are starting configuration examples only. On 2026-11-07, read-only Supabase Auth and PostgreSQL connectivity checks passed; all three migrations were applied to the user-confirmed disposable staging database after approval and backup confirmation. Prisma reports the staging schema up to date, and read-only repository queries and RLS/policy catalog checks passed. No live user Auth flow, populated-record authorization scenario, Resend request, or production deployment/migration was performed. Follow the migration checklist and repeat the backup, restore, and approval gates before production.

The Visual Agent uses `NEXT_PUBLIC_VISUAL_AGENT_ENABLED=true` only for local development. It also requires `NODE_ENV=development`; production webpack aliases the package to an empty stub. Leave the flag false or unset in all deployment environments.

## Phase 18 staging readiness audit — 2026-11-07

**Status: BLOCKED / NOT VERIFIED.** This is a local configuration and source audit only. No platform settings were read, no external services were changed, no migration was applied, no dependency audit endpoint was called, and no deployment was made. Do not use this report as evidence that staging or production is live.

### Deployment configuration review

- **Frontend:** `apps/web` is Next.js 14.2.15. `vercel.json` declares a Next.js build entry for `apps/web/package.json` but does not prove the Vercel project root, install/build overrides, Preview environment variables, or redirect settings. The web app imports a workspace package from `devtools/`, so verify that the Vercel project build context can see the repository workspace and that it builds the web app with the pinned pnpm lockfile. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_API_URL` in the Vercel Preview environment; these values are compiled into the browser bundle by design. Set `NEXT_PUBLIC_VISUAL_AGENT_ENABLED=false` outside local development. Do not set API secrets in Vercel's browser-exposed `NEXT_PUBLIC_*` variables.
- **API:** `apps/api` is Express and runs Prisma-backed services plus the scan worker in the same process. `/health` checks PostgreSQL and returns 503 if it is unavailable. The API now explicitly binds `0.0.0.0` and production configuration rejects a local or non-HTTPS `FRONTEND_URL`. CORS allows exactly `FRONTEND_URL`. `render.yaml` now declares the workspace root, Node runtime, frozen workspace install, Prisma generation, matching Playwright Chromium download, and filtered API build/start commands. This Render build command has not been executed on Render; the file still selects Free compute (0.1 CPU, 512 MB RAM) and has no pinned Node runtime. Chromium OS libraries, non-root sandbox behavior, and scanner operation remain **NOT VERIFIED**. Render documents Free services as preview/hobby compute that idles down after 15 minutes; its 0.1 CPU/512 MB plan is not a safe demonstrated capacity for Chromium scans. Select and approve a compatible staging compute plan before deployment; no paid plan has been selected here.
- **Runtime and worker:** the API's scan worker polls PostgreSQL and is stopped on SIGINT/SIGTERM; Chromium uses a restricted local egress proxy, fresh contexts, bounded pages/time/requests/bytes, and no `--no-sandbox` argument. Local controlled Playwright tests passed in earlier verification, but Render's operating-system libraries, non-root Chromium sandbox, memory headroom, graceful worker shutdown under platform termination, and scan execution are **NOT VERIFIED**. Do not disable browser sandbox protections to make deployment succeed.
- **Database:** Prisma migrations are manually invoked; no migration runs at API startup. Never add `db:migrate` to Render's build/start command. Live migration status was not queried in this audit.
- **Operations:** Redis is mandatory when `NODE_ENV=production`; Redis/Valkey must be shared and reachable. `PORT` defaults to 4000 but the host supplies it in deployment. API logs use error names and avoid printing the configuration object. Monitoring, staging log redaction, alerts, and real health checks remain **NOT VERIFIED**.

### Environment checklist (names from source)

| Service | Required in staging | Optional / conditional |
| --- | --- | --- |
| Vercel Preview | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL` | `NEXT_PUBLIC_VISUAL_AGENT_ENABLED` should be `false` |
| Render API (`NODE_ENV=production`) | `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, non-local HTTPS `FRONTEND_URL`, `RATE_LIMIT_REDIS_URL`; provider `PORT` | `TRUSTED_PROXY_CIDRS` only for verified ingress; `GEMINI_API_KEY` + optional `GEMINI_MODEL`; `RESEND_API_KEY` and `INVITATION_FROM_EMAIL` together; Jira `JIRA_CLIENT_ID`, `JIRA_CLIENT_SECRET`, `JIRA_REDIRECT_URI`, `JIRA_TOKEN_ENCRYPTION_KEY` together; bounded `SCAN_*` and `RATE_LIMIT_*` overrides |

`SUPABASE_SERVICE_ROLE_KEY`, `CORS_ORIGIN`, `REDIS_URL`, and `ENCRYPTION_KEY` are not the names this code reads. The API verifies Supabase tokens using the project URL and anon/public key; no service-role key is required by the current source. Use only dedicated staging credentials. `.env.example` must contain placeholders; the actual `.env` was not manually opened or edited. The local Next build loaded `.env` through its normal build behavior, without printing its values. A populated Resend example setting was replaced with an empty placeholder under the brief's requirement. Revoke/rotate that value before staging because it was present in the repository example and chat context. Keep `DIRECT_URL` private and use a direct/session-mode connection for migration commands; use the supported pooler mode for runtime according to the chosen Supabase setup.

### Migration review

The repository contains 11 ordered migrations. Earlier project documentation records the initial schema, dashboard indexes, and team-management migrations as applied to a user-confirmed disposable staging database. That historical statement was not rechecked in this Phase 18 audit. The following eight later migrations are pending candidates according to repository history; **current live staging status is NOT VERIFIED**. The user specifically marks the Jira OAuth RLS migration unapplied.

| Migration | SQL purpose and affected data | Dependency / safety notes |
| --- | --- | --- |
| `20261107120000_scanner_engine` | Adds scan requester/error/path/count fields, index, and nullable requester FK (`SET NULL`). Existing scans receive defaults. | Requires initial `Scan` and `UserProfile` schema. No row deletion. |
| `20261107150000_findings_management` | Adds axe rule/impact/WCAG metadata, assignment field/index/FK (`SET NULL`), and `IGNORED` enum value. Existing findings receive defaults. | Requires `Finding`, `FindingStatus`, and `UserProfile`. No row deletion. |
| `20261107160000_scan_page_results` | Adds scan passed/duration fields; creates `ScanPage`, unique/index constraints and scan FK (`CASCADE`); enables RLS with no direct-client policy. | Requires scanner-era `Scan`; existing scans receive defaults. A scan deletion cascades to page records. |
| `20261107180000_fix_verification` | Adds verification enum values/outcome, scan target finding FK (`SET NULL`), verification metadata and indexes. | Requires `Scan`, `Finding`, and `VerificationRun`. No row deletion. |
| `20261107200000_jira_oauth` | Extends Jira integration with cloud/token expiry/scopes, replaces user/project uniqueness with user/cloud uniqueness, and creates temporary OAuth state table/indexes/FK (`CASCADE`). | Requires Jira models and profiles. Existing integration rows gain null/default values; review uniqueness behavior before applying. |
| `20261107220000_gemini_accessibility_assistant` | Adds nullable explanation and suggestion fields plus a non-null instructions array with empty default. | Requires existing `AIExplanation` and `FixSuggestion`. No row deletion. |
| `20261107230000_jira_issue_sync` | Adds nullable Jira issue `lastSyncedAt`. | Requires Jira issue table. No row deletion. |
| `20261107233000_jira_oauth_state_rls` | Enables RLS on `JiraOAuthState`; creates no direct-client policies (default deny). | Requires `20261107200000_jira_oauth`. Application/API database role must be confirmed compatible. User says it remains unapplied. |

SQL was reviewed locally against migration order and current Prisma model names; `pnpm db:validate` passed using disposable process-local URL placeholders and did not connect to PostgreSQL. This is not a live schema compatibility check. No migration in this list has a repository-provided down migration. For enum changes, RLS, constraints, or cascades, prefer a tested forward-fix; never drop data or disable RLS as an automatic rollback. Before any approved staging migration: identify exact non-production project/ref, take and verify a restorable backup, inspect `prisma migrate status`, confirm the three earlier migrations, review the SQL and impact, and apply only approved migrations with `pnpm db:migrate`. Do not run reset or target production. A Git rollback does not reverse database DDL.

### External systems and security blockers

- **Phase 16:** JiraOAuthState RLS is reported unapplied. Review the migration and role behavior as above; it is a deployment blocker until explicitly approved and verified against the correct staging database.
- **Dependency audit:** `corepack pnpm audit --prod --audit-level=high` previously failed with `ECONNREFUSED` and requires approval to transmit dependency metadata. It was not retried and no alternate audit endpoint was used. Vulnerability status: **NOT VERIFIED**.
- **Supabase:** staging Auth URLs/redirects, session refresh, JWT behavior, live RLS and populated-record RBAC were not tested.
- **Gemini, Jira, Resend, Redis:** no staging credentials or live provider calls were used. Optional integrations are **NOT VERIFIED**. In particular, API startup only validates Redis URL syntax; connectivity is attempted by rate-limit runtime startup and has not been exercised against staging Redis.
- **Staging:** no Vercel/Render account config, backup, host, or service credentials were available in the reviewed repository; no deployment or end-to-end staging workflow was run. Status: **NOT VERIFIED**.

### Rollback and incident response preparation

For a frontend or API regression, stop further auto-deploys, record the failing deployment ID and logs, and use the provider's previous known-good deployment rollback only after reviewing its environment compatibility. Restore the previous environment variable values from the provider's secure history; never paste secrets into Git or incident docs. If a migration has already been approved/applied, do not use Git rollback as database rollback. Pause writes/scanning if data integrity is in question, preserve logs without sensitive page contents, and prepare a forward-fix or a verified provider backup restore plan with the database owner. Recheck OAuth redirect URLs and worker settings after rollback. No rollback was executed in this phase.

Official platform references used for plan/runtime limitations: [Render Free services](https://render.com/docs/free), [Render compute plans](https://render.com/docs/compute-plans), [Render monorepo support](https://render.com/docs/monorepo-support), [Vercel build configuration](https://vercel.com/docs/builds/configure-a-build), and [Playwright browser installation](https://playwright.dev/docs/browsers). Platform account settings and service behavior remain to be verified in the respective dashboards.
### Pending Jira OAuth RLS migration

Migration `20261107233000_jira_oauth_state_rls` enables RLS on the temporary Jira OAuth state/token table and defines no direct-client policy. It is not applied. Review and apply only to the confirmed non-production database after the owner approves the migration; do not treat local Prisma validation as database verification.
