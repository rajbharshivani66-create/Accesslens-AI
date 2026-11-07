# AccessLens AI

AccessLens AI is a pnpm/Turborepo monorepo for an accessibility SaaS platform. The v1.3.0 foundation and local follow-up phases include database-backed teams, role-based access, secure invitations, accessibility scanning/findings, verification, Gemini guidance, Jira Cloud issue handling, notifications, and analytics/reporting. Live provider, staging, and production verification are tracked separately in `docs/testing.md`.

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

The Prisma migrations enable RLS on all application tables. The initial migration adds profile self-read/safe-insert policies and owner-scoped policies for personal projects; the v1.3 migration restricts that policy to projects without a team assignment. Team and invitation tables have no client policies, so team data access goes through the authenticated API. The v1.2 migration adds indexes for dashboard scan queries. The v1.3 migration renames the team developer role and adds hashed-token invitations. The Express API verifies Supabase tokens and enforces ownership and team membership for profile, project, team, and dashboard queries. The API database connection is trusted and privileged, so authorization must remain in the API and direct database credentials must never be exposed to the browser.

### Team management

- Team roles are **OWNER**, **ADMIN**, **DEVELOPER**, and **VIEWER**. Owners/admins manage teams and members; developers can create and edit team projects; viewers are read-only.
- Team invitations expire after seven days, store only a SHA-256 token hash, are single-use, and can be accepted only by a Supabase-authenticated user whose email is confirmed and matches the invitation.
- Invitation links are created in the Teams page and can be shared manually.
- Optional Resend delivery is available when `RESEND_API_KEY` and `INVITATION_FROM_EMAIL` are both configured on the API server. A provider-accepted message is shown as accepted (not delivered); on failure the invitation remains valid and the manual link is still available.
- Team project data is visible only to current team members, regardless of the project's original owner. Deleting a team makes its projects private to the deleting owner; a project-name conflict must be resolved first.
- All three repository migrations were applied to the user-confirmed disposable staging database after explicit approval and backup confirmation; production was not modified. Prisma reports staging up to date. Follow the [migration verification checklist](./docs/migration-checklist.md) and repeat backup, restore, target confirmation, and approval gates before production.

## Dashboard

The authenticated dashboard reads aggregates from `GET /api/dashboard/summary` scoped to the user's personal projects and projects shared with current teams. It shows actual project, scan, finding, status, severity, recent scan, and project performance data. Its 7/30/90-day selector filters the daily scan and finding trends; summary totals cover saved records across authorized projects. Empty results display empty states rather than example statistics.

The displayed accessibility score is the rounded average of each authorized project's latest completed persisted scan score. It remains unavailable until completed scored scans exist. Automated scores are not proof of WCAG compliance. Activity entries likewise require a later feature to begin writing `ActivityLog` records.

## Database setup

From the repository root:

```bash
pnpm install
pnpm db:generate
pnpm db:validate
pnpm db:migrate
```

`pnpm db:migrate` uses `prisma migrate deploy` to apply checked-in migrations without creating a shadow database; it requires working `DATABASE_URL` and `DIRECT_URL` credentials. The initial schema, v1.2 dashboard indexes, and v1.3 team management migration are in `packages/database/prisma/migrations/`. On 2026-11-07 all three migrations were applied to the user-confirmed disposable staging database after explicit approval and backup confirmation; Prisma status reports the schema up to date. Before migration, read-only checks found no AccessLens core tables or migration history. No production database was modified. Review the [migration verification checklist](./docs/migration-checklist.md) and repeat backup, restore, staging, and approval checks before production. Use `pnpm --filter @accesslens-ai/database prisma:migrate:dev` only with a development/shadow-database setup when authoring later migrations.

## Authentication setup

- Registration, login, logout, forgot-password, and reset-password use Supabase Auth.
- Email verification and password recovery exchange their PKCE code at `/auth/callback`; add this URL to Supabase's allowed redirect URLs.
- The frontend middleware protects `/dashboard` and application routes.
- The Express API verifies bearer tokens with Supabase Auth `getUser(token)`. It creates a profile from the verified identity on first authenticated API use.
- The API validates required Supabase and PostgreSQL configuration at startup. Optional email delivery requires both server-only Resend settings; never prefix these with `NEXT_PUBLIC_`.
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

`devtools/visual-agent-overlay` is dynamically loaded only in development when `NEXT_PUBLIC_VISUAL_AGENT_ENABLED=true`. It is disabled in production and by default. It supports draggable/minimizable toolbar controls, hover/click element selection, bounded and sanitized context inspection, and reviewed prompt copy/JSON export. Use the supported Antigravity VS Code extension by pasting the exported prompt; the browser overlay does not directly dispatch to the agent or edit files. Antigravity should inspect source, show a diff, and wait for your approval before edits. See the [Visual Agent setup and safety guide](./devtools/visual-agent-overlay/README.md).

## Version history

See [docs/control.md](./docs/control.md) for the v1.0.0–v1.3.0 records, verification results, and restore commands. See [docs/mindmap.md](./docs/mindmap.md) for current and planned module boundaries, [docs/security.md](./docs/security.md) for current trust boundaries, and [docs/testing.md](./docs/testing.md) for executed versus pending verification.

### Phase 16 security status

Local automated checks passed, but the dependency audit could not be completed because the npm audit endpoint was unreachable and external manifest disclosure was not approved. A new default-deny RLS migration for temporary Jira OAuth state is prepared but unapplied. See `docs/security.md` and `docs/testing.md`; live/staging verification remains separate.

### Phase 17 UI and accessibility status

Local UI polish adds keyboard focus containment, Escape dismissal and focus restoration to Finding details; accessible chart summaries; one main landmark per authenticated page; visible focus for select controls; and reduced-motion support. Responsive breakpoints and application routes were source-audited. No authenticated browser session or frontend Playwright harness was available for full page-by-page browser verification, so viewport and manual assistive-technology results are documented as not verified in `docs/testing.md`.
