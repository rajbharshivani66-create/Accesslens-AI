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
### Pending Jira OAuth RLS migration

Migration `20261107233000_jira_oauth_state_rls` enables RLS on the temporary Jira OAuth state/token table and defines no direct-client policy. It is not applied. Review and apply only to the confirmed non-production database after the owner approves the migration; do not treat local Prisma validation as database verification.
