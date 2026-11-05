# AccessLens AI

AccessLens AI is a pnpm/Turborepo monorepo for an accessibility SaaS platform. Version **v1.2.0** builds on the Supabase Auth, Prisma, profile, and project foundation with an authenticated dashboard backed by saved project, scan, finding, and activity records.

Website scanning, Gemini, Jira, notifications, team management, and full analytics/reporting are not implemented yet. Their screens identify themselves as planned modules and do not display fabricated records.

## Repository map

- `apps/web` — Next.js App Router frontend
- `apps/api` — Express REST API
- `packages/database` — Prisma schema, initial migration, and shared Prisma client
- `packages/shared` — shared application types
- `devtools/visual-agent-overlay` — separate development-only overlay package
- `docs` — architecture, database, API, security, testing, deployment, and version documentation

## Requirements

- Node.js 22 or newer
- pnpm 9.15.0 (the version declared in the root package manifest)
- A Supabase project with PostgreSQL and Supabase Auth enabled

## Supabase setup

1. Copy `.env.example` to `.env` at the repository root.
2. In Supabase Project Settings, copy the project URL and public anon key into:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
3. Configure `DATABASE_URL` with the Supabase Postgres pooler connection string and `DIRECT_URL` with the direct database connection string. The latter is used for Prisma migrations.
4. In Supabase Auth URL configuration, allow `http://localhost:3000/auth/callback` during local development, plus the equivalent callback URL for each deployed web origin.
5. Keep `SUPABASE_ANON_KEY` server-side in `.env`; only the `NEXT_PUBLIC_*` anon key is exposed to the browser. Do not configure or expose a service-role key for this app.

The Prisma migrations enable RLS on all application tables. The initial migration adds profile self-read/safe-insert policies and owner-scoped project policies; tables for later modules have no client policies yet. The v1.2 migration adds indexes for dashboard scan queries. The Express API verifies Supabase tokens and enforces ownership in every implemented profile/project/dashboard query. The API database connection is trusted and privileged, so authorization must remain in the API and direct database credentials must never be exposed to the browser.

## Dashboard

The authenticated dashboard reads owner-scoped aggregates from `GET /api/dashboard/summary`. It shows actual project, scan, finding, status, severity, recent scan, and project performance data. Its 7/30/90-day selector filters the daily scan and finding trends; summary totals cover saved records across the user's projects. Empty results display empty states rather than example statistics.

The displayed accessibility score is the rounded average of each owned project's latest completed persisted scan score. It remains unavailable until completed scored scans exist. Automated scores are not proof of WCAG compliance. Activity entries likewise require a later feature to begin writing `ActivityLog` records.

## Database setup

From the repository root:

```bash
pnpm install
pnpm db:generate
pnpm db:validate
pnpm db:migrate
```

`pnpm db:migrate` uses `prisma migrate deploy` to apply checked-in migrations without creating a shadow database; it requires working `DATABASE_URL` and `DIRECT_URL` credentials. The initial schema and v1.2 dashboard index migration are in `packages/database/prisma/migrations/`. They have not been applied to a live Supabase project in this workspace because real credentials were not configured. Use `pnpm --filter @accesslens-ai/database prisma:migrate:dev` only with a development database/shadow-database setup when authoring later migrations.

## Authentication setup

- Registration, login, logout, forgot-password, and reset-password use Supabase Auth.
- Email verification and password recovery exchange their PKCE code at `/auth/callback`; add this URL to Supabase's allowed redirect URLs.
- The frontend middleware protects `/dashboard` and application routes.
- The Express API verifies bearer tokens with Supabase Auth `getUser(token)`. It creates a profile from the verified identity on first authenticated API use.
- Passwords are never stored in AccessLens tables.

## Local development

After configuring `.env` and applying the migration:

```bash
pnpm dev
```

The web app runs at `http://localhost:3000`; the API listens on port `4000`. The API refuses to start when it cannot connect to PostgreSQL. Protected web routes show an explicit configuration response when Supabase Auth environment values are missing.

## Validation commands

```bash
pnpm db:generate
pnpm db:validate
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

The automated API tests use injected test identities and an in-memory repository to verify authorization and project behavior. They do not prove a live Supabase login or database connection. Those require the project's real credentials.

## Development-only Visual Agent

`devtools/visual-agent-overlay` remains an independent package and is not imported by the application. It is not required for the web app build. See its [README](./devtools/visual-agent-overlay/README.md) for its development scope and removal preview.

## Version history

See [docs/control.md](./docs/control.md) for the v1.0.0, v1.1.0, and v1.2.0 records, verification results, and restore commands. See [docs/mindmap.md](./docs/mindmap.md) for current and planned module boundaries, [docs/security.md](./docs/security.md) for current trust boundaries, and [docs/testing.md](./docs/testing.md) for executed versus pending verification.
