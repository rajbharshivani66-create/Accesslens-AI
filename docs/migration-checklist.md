# v1.3.0 Database Migration Verification Checklist

Migration: `packages/database/prisma/migrations/20261105200000_team_management/migration.sql`

**Current status:** On 2026-11-07, after the user confirmed this is a dedicated disposable staging database with a verified restorable backup and explicitly approved applying all pending migrations, `pnpm db:migrate` successfully applied the initial, dashboard-index, and team-management migrations. A subsequent read-only Prisma status check reported the database schema up to date. Before migration, the `_prisma_migrations` table and AccessLens core tables/enum were absent, so there were no existing AccessLens records or legacy `EDITOR` memberships in those tables to preserve or convert. No production database was touched.

## What the migration changes

- Renames the existing `TeamMemberRole` enum label `EDITOR` to `DEVELOPER`. PostgreSQL preserves rows that already use `EDITOR` by relabeling the enum value.
- Creates `InvitationEmailStatus` and `TeamInvitation`, including a unique invitation-token hash, team and creator foreign keys, expiry/acceptance/revocation timestamps, and delivery status.
- Adds lookup indexes and a partial unique `(teamId, lower(email))` index for unaccepted, unrevoked invitations.
- Enables RLS on `TeamInvitation` without a client policy. Invitation access remains API-only.
- Replaces the project owner RLS policy so owner-only direct access applies only when `teamId IS NULL`. Existing assigned team projects do not become visible to their original owner through the direct client policy.
- Does not drop tables, delete rows, or apply any destructive data rewrite.

## Before any migration

- [x] Confirm the target is disposable staging with the project owner; never infer environment from a shell session.
- [x] Obtain explicit approval for applying the pending migrations.
- [x] Confirm a provider-managed backup and verified restore procedure.
- [x] Confirm prior migration state. This empty staging database had no `_prisma_migrations` table or AccessLens schema, so all three checked-in migrations were applied in order.
- [x] Review the migration SQL and confirm the intended database is selected in secure environment configuration. Never echo connection strings or secrets.
- [ ] Before production, repeat the backup, restore verification, target confirmation, migration review, and explicit production approval gates.

## Staging procedure

Set `DATABASE_URL` and `DIRECT_URL` from the staging database's secret store in the current shell or approved local secret manager. Do not place real values in command history, source files, screenshots, or reports.

From the repository root, with the target staging database explicitly selected:

```bash
pnpm db
pnpm --filter @accesslens-ai/database exec prisma migrate status --schema=./prisma/schema.prisma
pnpm db:migrate
pnpm --filter @accesslens-ai/database exec prisma migrate status --schema=./prisma/schema.prisma
```

`pnpm db` only generates Prisma Client and validates the schema; it does not connect to a database or apply migrations. `pnpm db:migrate` applies migrations to the database selected by the configured URLs. Run it only after confirming staging is the target.

The staging database now has all three repository migrations applied. Do not run this command against production until staging verification succeeds, a backup/restore is confirmed, and the database owner separately approves the production change.

After applying to disposable staging, verify read-only:

- [x] Prisma reports all migrations applied and the schema up to date.
- [x] `TeamMemberRole` contains `DEVELOPER`. The pre-migration database had no `TeamMember` table or enum, so there were no legacy memberships to convert.
- [x] `TeamInvitation` and `InvitationEmailStatus` exist after the migration.
- [x] Invitation foreign keys and indexes were verified; migration SQL defines token uniqueness, lookup indexes, and partial active-invitation uniqueness.
- [x] `TeamInvitation` has RLS enabled and no direct-client policy.
- [x] The `project_owner_access` policy is restricted to `teamId IS NULL`.
- [x] Pre-migration checks found no AccessLens core tables or migration history; no existing AccessLens records were present to rewrite.
- [x] Read-only Prisma team/project/dashboard repository queries succeeded for a nonexistent profile and returned empty results.
- [ ] Live role authorization, team project assignment, membership removal, invitation acceptance/revocation, and team deletion still need authenticated test identities and disposable fixture data.

## Production gate

Do not run `pnpm db:migrate` against production until staging verification succeeds, a backup/restore is confirmed, and the database owner separately approves the production change. Deployment and migration execution are manual; CI or application startup must not apply migrations.

## Migrations added after the historical staging check

The staging status recorded above covered only the initial, dashboard-index, and team-management migrations. Later local migrations for scanner persistence, findings assignment, verification runs, and Jira OAuth have been added and have NOT been applied to staging or production. Local Prisma generation/validation does not apply these migrations. Reconfirm the target and approval requirements before any non-local migration.