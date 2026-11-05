# Database Design

## Database provider and connection strings

The project uses Supabase PostgreSQL with Prisma ORM:

- `DATABASE_URL` — Supabase pooler connection used by the API at runtime.
- `DIRECT_URL` — direct PostgreSQL connection used by Prisma Migrate.
- Credentials are read from the environment, never hardcoded.
- `packages/database/src/client.ts` owns the Prisma singleton and explicit connect/disconnect helpers.

## Models and enums

The schema is at `packages/database/prisma/schema.prisma`. It includes:

- `UserProfile` — one app profile for a Supabase Auth UUID; never stores passwords.
- `Project` — website owned by a profile, optional team assignment, and scan collection.
- `Scan`, `Finding`, `AIExplanation`, `FixSuggestion`, `VerificationRun`.
- `JiraIntegration`, `JiraIssue`.
- `Team`, `TeamMember`.
- `Notification`, `ActivityLog`.

Enums represent user/team roles, scan states, finding severity/status, fix suggestion state, verification state, and notification type. Jira issue status is a string to accommodate custom Jira workflows.

Foreign keys, unique constraints, indexes, created/updated timestamps, and delete behavior are declared in Prisma. Project deletion cascades through scans/findings and their dependent records; team deletion sets project team assignment to null.

The v1.2 dashboard migration adds `Scan(projectId, startedAt)` to support project-scoped time-series queries and `Scan(projectId, completedAt)` for selecting each project's latest completed score. Finding daily trend queries use the existing `Finding(scanId, createdAt)` index and join through the scan's project.

## Initial migration

`packages/database/prisma/migrations/20261105000000_initial/migration.sql` creates the tables and indexes and enables RLS on all app tables. `20261105180000_dashboard_query_indexes` adds the scan indexes used by dashboard trends and score aggregation.

The migration adds `authenticated` policies for users to read and safely insert their own `UserProfile`, and access owner-linked `Project` records. Profile updates stay behind the API so client requests cannot change roles. Other models have RLS enabled but no client policies yet, denying direct client access until a feature adds scoped policies.

The API uses a trusted backend PostgreSQL role and bypasses RLS; therefore the API must verify Supabase tokens and scope all data operations. Current profile/project repository queries enforce that ownership. Never expose database credentials or use a privileged database connection in the browser.

## Live migration requirements

Copy `.env.example` to `.env`, configure valid Supabase pooler/direct URLs, then run:

```bash
pnpm db:generate
pnpm db:validate
pnpm db:migrate
```

`pnpm db:migrate` runs `prisma migrate deploy`, which applies checked-in migrations without requiring a shadow database. Use `pnpm --filter @accesslens-ai/database prisma:migrate:dev` only with a development database and configured shadow database when creating future migrations. Schema generation and validation pass without a live database. The migration SQL is generated, but application to a hosted Supabase project requires real credentials and has not been claimed as tested.
