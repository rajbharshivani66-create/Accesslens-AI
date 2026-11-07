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
- `Team`, `TeamMember`, and `TeamInvitation`.
- `Notification`, `ActivityLog`.

Enums represent user/team roles, scan states, finding severity/status, fix suggestion state, verification state, and notification type. Team roles are `OWNER`, `ADMIN`, `DEVELOPER`, and `VIEWER`; the v1.3 migration renames the previous `EDITOR` enum value to `DEVELOPER`. Jira issue status is a string to accommodate custom Jira workflows.

Foreign keys, unique constraints, indexes, created/updated timestamps, and delete behavior are declared in Prisma. Project deletion cascades through scans/findings and their dependent records. Team deletion is transactional in the API: team projects are reassigned as private projects to the deleting owner before the team is removed. Name conflicts return `409` without deleting the team.

The v1.2 dashboard migration adds `Scan(projectId, startedAt)` to support project-scoped time-series queries and `Scan(projectId, completedAt)` for selecting each project's latest completed score. Finding daily trend queries use the existing `Finding(scanId, createdAt)` index and join through the scan's project.

The un-applied `20261107120000_scanner_engine` migration adds scan requester/path/error/page/manual-review fields and finding rule ID, impact, WCAG tags, help URL, failure summary, and affected-element count. Scan requests are persisted as `QUEUED`; the API worker atomically claims them as `IN_PROGRESS`. The requester relation allows the worker to recheck current project membership before scanning. The migration has been schema-validated but has not been applied to staging or production.

## Initial migration

`packages/database/prisma/migrations/20261105000000_initial/migration.sql` creates the tables and indexes and enables RLS on all app tables. `20261105180000_dashboard_query_indexes` adds the scan indexes used by dashboard trends and score aggregation.

The migration adds `authenticated` policies for users to read and safely insert their own `UserProfile`, and access owner-linked personal `Project` records. The v1.3 migration changes the project policy to require `teamId IS NULL`, preventing an original owner from bypassing team membership through direct Supabase access. Profile updates stay behind the API so client requests cannot change roles. Other models, including teams and invitations, have RLS enabled but no client policies; team data is accessed through the backend authorization boundary.

The API uses a trusted backend PostgreSQL role and bypasses RLS; therefore the API must verify Supabase tokens and scope all data operations. The project and dashboard repositories enforce personal ownership or current team membership, and the team repository enforces role permissions. Never expose database credentials or use a privileged database connection in the browser.

The v1.3 migration `20261105200000_team_management/migration.sql` renames `EDITOR` to `DEVELOPER`, creates `TeamInvitation` and its email-status enum/column, and adds a partial unique index for active invitations by team and case-insensitive email. The enum rename preserves existing membership values; no row rewrite or table drop is involved. Invitation tokens are stored as SHA-256 hashes. On 2026-11-07, all three repository migrations were applied to the user-confirmed disposable staging database after backup and explicit approval. Before migration, read-only catalog checks found no `_prisma_migrations` table or AccessLens core tables/enum, so there were no existing AccessLens records or memberships to rewrite. Production was not touched.

## Live migration requirements

Copy `.env.example` to `.env`, configure valid Supabase pooler/direct URLs, then run:

```bash
pnpm db:generate
pnpm db:validate
pnpm db:migrate
```

`pnpm db:migrate` runs `prisma migrate deploy`, which applies checked-in migrations without requiring a shadow database. Use `pnpm --filter @accesslens-ai/database prisma:migrate:dev` only with a development database and configured shadow database when creating future migrations. Schema generation and validation can run without a live database. Migration status was verified as up to date on the confirmed staging database; production migration remains a separate approved operation.

Before deploying, follow [the v1.3 migration verification checklist](./migration-checklist.md). Confirm expected prior migrations, back up and verify restore capability, validate role values and project constraints on a disposable staging clone, then apply to the explicitly approved production target. Do not use `migrate reset` or destructive SQL.

## Findings workflow schema

The findings-management schema adds the `IGNORED` workflow state and nullable `Finding.assignedToId` relation to `UserProfile` with an index on assignee and status. `RESOLVED` remains reserved for a later verification-backed workflow. The migration `20261107150000_findings_management` is checked in but has not been applied to staging or production; local Prisma generation is schema tooling only.

## Fix verification schema

`Scan.verificationForFindingId` links a queued rescan to its target finding. `VerificationRun` stores QUEUED/IN_PROGRESS/COMPLETED/FAILED state, RESOLVED/REMAINING/REGRESSED outcome, rule/page reference, counts, and heuristic score delta. Supplemental rows record new rule/page regressions. Migration 20261107180000_fix_verification adds these fields and enum values; it has not been applied to staging or production.
## Jira OAuth state

JiraIntegration stores a cloud ID, token expiry, scopes, and encrypted server-side credentials. JiraOAuthState stores the user-bound hash of a one-time OAuth state, short expiry, callback use, encrypted pending tokens, and authorized site metadata. Jira issue rows retain the Jira key, URL, last synchronized status, and nullable `lastSyncedAt`. Additive migration `20261107230000_jira_issue_sync` adds only that timestamp column; it is checked in but unapplied. The OAuth/model migration `20261107200000_jira_oauth` is also checked in and unapplied.


## Scanner result metadata schema update

`Scan` now has `passedCount` and nullable `durationMs`. `ScanPage` stores one bounded page result per unique `(scanId, requestedUrl)`: final same-origin URL, bounded title, status, duration, passed axe rule count, incomplete axe rule count, and created timestamp. The migration `20261107160000_scan_page_results` enables RLS on `ScanPage` without granting browser/client policies; reads go through authenticated project-scoped API queries. This migration is checked in but unapplied to live databases.
