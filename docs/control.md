# Control and Versioning

AccessLens AI uses semantic versions in `vMAJOR.MINOR.PATCH` form. Keep `main` production-ready; use `feature/*`, `fix/*`, and `recovery/*` branches for development.

## Current version

**v1.3.0 candidate — Team management and role-based access (untagged)**

## v1.3.0 implementation record

- **Date:** 2026-11-06
- **Objective:** Extend the v1.2.0 foundation with backend-enforced team/member management, secure invitations, role-based permissions, and team-authorized project/dashboard access.
- **Starting checkpoint:** `v1.2.0` at commit `2dd3bd8`; implementation branch `feature/v1.3-team-management`. Existing v1.2.0 history is preserved.
- **Planned files:** Team API contract/repository and Prisma service; auth email-confirmation context; team-aware project/dashboard queries; team UI; Prisma schema/migration; optional invitation mailer and runtime env validation; API tests; docs and changelog.
- **Files created:** `apps/api/src/config/environment.ts`; `apps/api/src/modules/teams/team.repository.ts`; `apps/api/src/modules/teams/invitation-email.ts`; `apps/api/src/services/prisma-team.repository.ts`; `apps/api/src/utils/api-error.ts`; `apps/api/src/__tests__/environment.test.ts`; `apps/api/src/__tests__/invitation-email.test.ts`; `packages/database/prisma/migrations/20261105200000_team_management/migration.sql`; `docs/migration-checklist.md`.
- **Files modified:** `package.json`; `.env.example`; `apps/api/src/app.ts`; `apps/api/src/main.ts`; `apps/api/src/modules/auth/auth.types.ts`; `apps/api/src/modules/projects/project.repository.ts`; `apps/api/src/services/prisma-project.repository.ts`; `apps/api/src/services/prisma-dashboard.repository.ts`; `apps/api/src/__tests__/app.test.ts`; `apps/web/src/app/(app)/team/page.tsx`; `apps/web/src/app/(app)/projects/page.tsx`; `apps/web/src/app/(app)/projects/[projectId]/project-detail.tsx`; `apps/web/src/app/globals.css`; `packages/database/prisma/schema.prisma`; `README.md`; `CHANGELOG.md`; `docs/api-documentation.md`; `docs/architecture.md`; `docs/database-design.md`; `docs/mindmap.md`; `docs/security.md`; `docs/testing.md`; `docs/deployment.md`; `docs/control.md`.
- **Files deleted:** None.
- **Database changes:** Rename `TeamMemberRole.EDITOR` to `DEVELOPER`; add `TeamInvitation` with token hash, recipient email, role, email delivery status, expiry, acceptance/revocation timestamps, creator/team foreign keys, active invitation uniqueness, and RLS enabled. Restrict the direct-client project-owner RLS policy to personal projects (`teamId IS NULL`) so original owners cannot bypass team membership. All three migrations were applied to the confirmed disposable staging database after verified-backup confirmation and explicit approval; production was not modified.
- **API changes:** Add authenticated team list/create/get/update/delete; invite create/revoke/accept; membership role update/removal; update project CRUD and dashboard queries to use team membership and role authorization.
- **Features implemented:** OWNER/ADMIN/DEVELOPER/VIEWER permissions; strict team isolation including for original project owners; viewer write denial; seven-day, single-use, SHA-256-hashed invitation tokens; confirmed email matching; manual shareable invite links plus optional Resend sender with persistent status; API environment validation; team-aware projects and dashboard; transactionally privatize team projects to the deleting owner when deleting a team.
- **Dependencies:** No new packages.
- **Follow-up rate-limit implementation (2026-11-07):** Added `apps/api/src/middleware/rate-limit.ts` and `apps/api/src/__tests__/rate-limit.test.ts`; added exact API dependencies `express-rate-limit@8.7.1`, `rate-limit-redis@4.2.2`, and `redis@5.12.1`. Updated `.env.example`, API configuration, deployment/security/testing guidance, and the mind map. Production requires shared Redis storage; process-local counters are limited to development/test.
- **Tests and results:** On 2026-11-07, `pnpm db`, `pnpm typecheck`, `pnpm test` (3 files, 16 tests), `pnpm lint`, `pnpm build`, and `git diff --check` passed via the Corepack-signature-verified `pnpm@9.15.0` binary. Typecheck, lint, and build were also run uncached; the Next.js production build completed. `pnpm db` used local placeholder URLs and did not connect to PostgreSQL. The API suite uses an injected verifier and in-memory repositories. Earlier read-only live checks confirmed endpoint/connectivity and migration facts described in `docs/testing.md` but do not establish live-user authentication or populated-record RBAC.
- **Migration status:** `prisma migrate status` reports the staging schema up to date after applying `20261105000000_initial`, `20261105180000_dashboard_query_indexes`, and `20261105200000_team_management`. Before migration, read-only checks found no `_prisma_migrations`, `UserProfile`, `Project`, `Team`, `TeamMember`, `TeamInvitation`, or `TeamMemberRole`; there were no existing AccessLens records to convert.
- **Live schema checks:** Read-only team/project/dashboard repository queries succeeded against the migrated empty database; enum labels, invitation FK/index counts, RLS, project-owner policy scoping, and absence of direct invitation policies were verified. No data rows were inserted for this check.
- **Known issues:** Real-user Auth/session behavior, populated-record Prisma RBAC/data isolation, live invitation acceptance, authenticated browser workflows, Resend delivery, and Redis-backed multi-instance limiter operation remain BLOCKED/not verified. No dedicated test-account credentials/inbox or Resend credentials are configured. API rate limiting is implemented; production requires `RATE_LIMIT_REDIS_URL`. Set trusted proxy CIDRs only after confirming ingress source ranges and header rewriting. The app does not use a service-role key. Team and invitation tables have RLS enabled but no direct-client policies; the API is the authorization boundary. Email status `ACCEPTED` means provider acceptance, not mailbox delivery. Production remains unverified and no production migration was run.
- **Follow-up automated results:** On 2026-11-07, the final post-rate-limit run passed `pnpm db`, `pnpm typecheck` (2 tasks), `pnpm test` (4 files, 24 tests), `pnpm lint` (uncached web lint), `pnpm build` (4 tasks), and `git diff --check`. `pnpm db` used local placeholder URLs only. Rate-limit tests used process-local storage and did not verify a live Redis service or multi-instance sharing. See `docs/testing.md` for exact scope.
- **Git implementation commit:** None; working changes remain uncommitted on `feature/v1.3-team-management`.
- **Git tag:** No `v1.3.0` tag created. Do not tag until final validation passes and release readiness is explicitly confirmed. No push performed.
- **Restore instructions:** The `v1.2.0` tag remains the untouched baseline. To inspect it without changing this working tree, use `git worktree add ..\AccessLens-AI-v1.2.0 v1.2.0`. This feature branch contains uncommitted work; preserve it before switching branches or checking out files.

See [docs/migration-checklist.md](./migration-checklist.md) for staging verification, approval and backup gates, and manual migration commands.

## v1.2.0 release record

- **Date:** 2026-11-05
- **Objective:** Continue the completed v1.1.0 release with real, owner-scoped dashboard aggregates, trends, project performance, and persisted scan/finding views.
- **Starting checkpoint:** `v1.1.0` tag at commit `33e4f64`; work started from a clean `main` and branch `feature/v1.2-dashboard-analytics`.
- **Planned files:** dashboard API contract and Prisma repository, API dependency wiring and range validation, dashboard API tests, dashboard page/charts/styles, scan query index/schema migration, README and dashboard/API/architecture/database/mindmap/control/changelog updates.
- **Files created:** `apps/api/src/modules/dashboard/dashboard.repository.ts`; `apps/api/src/services/prisma-dashboard.repository.ts`; `packages/database/prisma/migrations/20261105180000_dashboard_query_indexes/migration.sql`; `docs/security.md`; `docs/testing.md`.
- **Files modified:** `apps/api/src/app.ts`; `apps/api/src/main.ts`; `apps/api/src/__tests__/app.test.ts`; `apps/web/src/app/(app)/dashboard/page.tsx`; `apps/web/src/app/globals.css`; `apps/web/src/components/app-shell/feature-placeholder.tsx`; `packages/database/prisma/schema.prisma`; `README.md`; `CHANGELOG.md`; `docs/control.md`; `docs/mindmap.md`; `docs/api-documentation.md`; `docs/architecture.md`; `docs/database-design.md`.
- **Files deleted:** None.
- **Database changes:** Add `(projectId, startedAt)` and `(projectId, completedAt)` indexes on `Scan` for scoped trend and latest-score queries. No model or enum changes.
- **API changes:** Add authenticated `GET /api/dashboard/summary?range=7d|30d|90d`; aggregate projects, scans/statuses, findings/statuses/severities, daily trends, recent scans, project performance, and user activity using only the verified profile's projects.
- **Features implemented:** Replaced the project-count-only dashboard with real database-backed KPI cards, trends, severity breakdown, project performance, recent scans/activity, and period selection. The score is the rounded average of each owned project's latest completed stored scan score; it is unavailable before completed scores exist and is not a compliance determination.
- **Dependencies:** No new dependencies; reused existing Recharts.
- **Tests and results:** `pnpm db:validate` passed using temporary placeholder URLs; `pnpm typecheck` passed; `pnpm test` passed (8 tests); `pnpm lint` passed; `pnpm build` passed; `git diff --check` passed. No database migration or live Supabase tests were run without credentials.
- **Known issues:** No scanner creates scan records yet; the dashboard correctly shows empty metrics until records exist. No feature currently writes `ActivityLog` rows. Live PostgreSQL query execution and migration application require Supabase credentials and remain unverified.
- **Git implementation commit:** `f3bb59dfe909b2db9d62633011a876ca4750a8c6`.
- **Git tag:** `v1.2.0`.
- **Restore instructions:** `git switch --detach v1.1.0` restores the prior release. To reverse a merged v1.2.0 release, revert its merge commit; database index rollback should be applied through a reviewed migration rather than a destructive database reset.

## v1.1.0 release record

- **Date:** 2026-11-05
- **Objective:** Continue the existing v1.0.0 scaffold with verified Supabase Auth, Prisma PostgreSQL integration, first application layout, user profiles, and owner-authorized project CRUD.
- **Starting checkpoint:** `v1.0.0` tag at commit `d73b6edf5314453790d25eb50dc1c948b924e0ee`; the repository did not exist before this task, so the existing scaffold was first preserved as a local Git checkpoint.
- **Planned files:** package manifests/lockfile, Prisma schema and initial migration, database client, Express auth/profile/project routes, Next.js auth/session/layout/profile/project pages, API tests, `.env.example`, README, mindmap, control, changelog, and API/database/deployment docs.
- **Files created:** `apps/api/src/app.ts`; `apps/api/src/modules/auth/auth.types.ts`; `apps/api/src/modules/projects/project.repository.ts`; `apps/api/src/services/prisma-project.repository.ts`; `apps/api/src/types/express.d.ts`; `apps/api/src/utils/async-handler.ts`; `apps/api/src/__tests__/app.test.ts`; `apps/web/src/app/(auth)/*`; `apps/web/src/app/(app)/*`; `apps/web/src/app/auth/callback/route.ts`; `apps/web/src/components/auth/auth-form.tsx`; `apps/web/src/components/app-shell/*`; `apps/web/src/lib/api.ts`; `apps/web/src/lib/supabase/browser.ts`; `apps/web/src/middleware.ts`; `packages/database/src/client.ts`; `packages/database/prisma/migrations/20261105000000_initial/*`; `packages/database/turbo.json`.
- **Files modified:** root `package.json`, `pnpm-lock.yaml`, `turbo.json`, `.env.example`, `.gitignore`; `apps/api/package.json`, `apps/api/src/main.ts`; `apps/web/package.json`, `apps/web/next.config.mjs`, `apps/web/src/app/globals.css`, `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx`, `apps/web/src/components/app-shell/app-shell.tsx`; `packages/database/package.json`, `packages/database/prisma/schema.prisma`, `packages/database/src/index.ts`; `README.md`, `CHANGELOG.md`, `docs/mindmap.md`, `docs/control.md`, `docs/api-documentation.md`, `docs/database-design.md`, `docs/architecture.md`, and `docs/deployment.md`.
- **Files deleted:** `apps/web/src/lib/mock-data.ts`; the old static dashboard at `apps/web/src/app/page.tsx` was replaced with a redirect to the protected data-backed dashboard.
- **Database changes:** Added domain enums to all 13 planned Prisma models; added initial PostgreSQL migration, indexes, constraints, foreign keys, RLS on all app tables, and safe profile-read/insert plus project-owner policies. Generated Prisma Client and validated the schema. The migration was not applied to a live Supabase project because credentials were not configured.
- **API changes:** Added verified bearer auth and `GET /api/auth/me`; added `GET/PUT /api/profile`; added paginated owner-scoped project list/create/read/update/delete routes and `/health`. Removed placeholder responses for unimplemented future modules.
- **Features implemented:** Supabase Auth frontend flows and callback/session handling; protected routes; profile initialization/editing; responsive app shell; project CRUD; loading/error/empty states; success toasts; cross-user isolation.
- **Dependencies:** Added `@supabase/ssr`, `@supabase/supabase-js`, and `dotenv`; used existing Prisma, Zod, Next.js, and Vitest dependencies.
- **Tests and results:** `pnpm install --frozen-lockfile` succeeded; Prisma Client generation succeeded; `pnpm db:validate` succeeded with temporary local placeholder URLs; `pnpm typecheck` passed; `pnpm test` passed (6 tests); `pnpm lint` passed; `pnpm build` passed. `pnpm db:migrate` was attempted but stopped before connecting because `DIRECT_URL` is not configured. Live Supabase Auth, database connectivity, and applying the migration remain unverified without real credentials.
- **Known issues:** Hosted Supabase connectivity and authentication have not been tested; project migration remains unapplied. Future scanner, Gemini, verification, Jira, teams, analytics, notifications, and audit modules are not implemented. Future direct Supabase access needs scoped RLS policies before use.
- **Git implementation commit:** `0156d023daa022a75419ecba3b5fcb0408d88a41`.
- **Git tag:** `v1.1.0`.
- **Restore instructions:** `git switch --detach v1.0.0` checks out the original scaffold; `git switch --detach v1.1.0` checks out this release. Database schema changes require a Supabase backup/restore; do not run a destructive reset on a database with user data.

## v1.0.0 — Initial monorepo foundation

- **Date:** 2026-11-05
- **Files:** Initial monorepo scaffold, frontend, API, shared package, database schema, Visual Agent package, deployment examples, and documentation.
- **Tests:** `pnpm install` and `pnpm build` passed before the v1.1.0 work.
- **Known issue:** Initial feature endpoints were demo-shaped and were removed when implementing real v1.1.0 endpoints; no real external service credentials were present.
- **Git commit:** `d73b6edf5314453790d25eb50dc1c948b924e0ee`.
- **Git tag:** `v1.0.0`.
- **Restore:** `git switch --detach v1.0.0` checks out the original scaffold checkpoint.

## Development process

1. Read this file and `docs/mindmap.md`.
2. Inspect branch, status, and affected files.
3. Preserve uncommitted changes with a commit/checkpoint before new work.
4. Record the version objective and expected file/API/database changes.
5. Implement only the requested version scope.
6. Run targeted tests, schema validation, type checks, lint, and build.
7. Update `docs/mindmap.md`, `docs/control.md`, `CHANGELOG.md`, and related module documentation.
8. Commit changes with a meaningful message and the required co-author trailer; tag verified releases.

## Branch strategy

- `main` — production-ready release line
- `develop` — integration line when needed
- `feature/*` — new development
- `fix/*` — bug fixes
- `recovery/*` — recovery work

## Ongoing implementation status - 2026-11-07

Local development phases now include API rate limiting and security headers, safe Playwright/axe scanning, findings workflow, verification rescans, Gemini AI assistance, and Jira Cloud OAuth/issue handling. These implementations have local automated coverage and documentation. Scanner, findings, verification, and Jira migrations are unapplied; no live Gemini or Atlassian calls, populated staging RBAC, authenticated browser workflows, or production verification were performed. See docs/testing.md for exact local check evidence and external blockers. No commit, tag, merge, push, or production migration was performed.

Phase 8 local implementation adds profile-scoped persistent notification APIs and inbox, scan completion/verification audit events, account activity view, and project-authorized CSV/PDF finding exports. Local exporter tests and API/web typechecks passed. Audit writers do not yet cover all team/project/invitation/finding/Jira mutations; staging and production remain unverified.


## Phase 9 analytics/settings integration audit — 2026-11-07

Implemented `GET /api/analytics/summary?range=7d|30d|90d&projectId=...` with PostgreSQL-backed totals, daily scan/finding trends, severity counts, WCAG version grouping, and per-project counts. Queries scope to personal projects or current team membership and conceal inaccessible project IDs with 404. Analytics now has real range/project filters, responsive charts/table, empty/loading/error states, and retains Phase 8 CSV/PDF export. Profile and project settings were confirmed already backed by validated persistent APIs; profile/project load errors now offer retry. No notification-preference or auth-security settings were added because the schema/provider has no functional persistence surface for them. No Prisma model or migration changed.

Validation on 2026-11-07 using the signature-verified pnpm 9.15.0 shim: `pnpm db` passed generation/schema validation with non-routable URLs; `pnpm typecheck` passed (2 tasks); `pnpm test` passed (16 files, 80 tests); `pnpm lint` passed (1 task); `pnpm build` passed (4 tasks; Turbo emitted its existing no-output warning for the overlay package); `git diff --check` passed with line-ending warnings. No live DB, staging, production, or authenticated browser verification was performed.
## Phase 10 scanner completion — 2026-11-07

Inspected existing `Scan`/`Finding` models, scanner route/repository/service, Scanner UI, Playwright/axe dependency versions, SSRF proxy, and scanner tests before editing. Reused the existing scanner. Added root scan create/list APIs, retained project history/detail/retry APIs, persisted page title/final URL/duration/passed/incomplete results and scan-level duration/pass totals, hard per-page timeout, WCAG 2.0/2.1/2.2 A/AA/AAA axe tags, text/attribute-free snippets, stricter path input validation, and Scanner UI metadata display. There is no cancellation endpoint because browser cancellation is not safely exposed by the current worker model.

Dependencies: none added; existing pinned Playwright 1.58.0 and axe-core 4.14.0 are used. Database change: new `ScanPage` model and fields `Scan.passedCount`/`Scan.durationMs`; migration `20261107160000_scan_page_results`. This migration and prior scanner migration `20261107120000_scanner_engine` have not been applied to any live database during this phase.

`pnpm db:generate`, API/web typechecks, focused scanner tests (5 files/32 tests), and Prisma validation with non-routable placeholder URLs passed. Full checks and repository-wide test totals follow in the next recorded verification section. Staging/production, live DB persistence, public target scans, populated-record RBAC, and authenticated browser verification remain BLOCKED / NOT VERIFIED. No `.env` was modified; no destructive or deployment operation occurred.
Final Phase 10 verification: `pnpm db` passed; `pnpm typecheck` passed (2 tasks); `pnpm test` passed (17 files/88 tests); `pnpm lint` passed (1 task); `pnpm build` passed (4 tasks, including Next production `/scanner`); `git diff --check` passed with line-ending warnings. Database commands used non-routable placeholder URLs. Live DB/scanner and staging/production remain not verified; scanner migrations are unapplied. No `.env`, production data, or live service was touched.
## Phase 11 findings management completion - 2026-11-07

Audit confirmed existing scan-generated findings, APIs, project/team authorization, status and assignment activity writes, and responsive Findings workflow. Added validated sorting by creation time, severity, status, or axe rule ID in ascending/descending order; replaced the card list with a responsive table and added a detail panel that fetches the authorized finding API. Focused API/repository tests and API/web typechecks passed; Findings page lint passed. No schema or migration changes, dependencies, `.env` edits, database access, or deployment actions. Staging and production authorization remain unverified.

## Phase 12 Gemini accessibility assistant - 2026-11-07

Implemented server-side Gemini accessibility explanations and safe HTML/JSX suggestions using the official Google GenAI SDK. Added authenticated, project-authorized explain and fix-suggestion endpoints, structured validation, persisted root cause/WCAG/testing fields, developer-review UI, and local automated coverage. API credentials remain optional and server-only. The additive migration is unapplied; no live Gemini request, staging database check, deployment, or production verification was performed. See the Phase 12 entry in `docs/testing.md` and API/security docs for limits and setup.
## Phase 13 verification and regression follow-up - 2026-11-07

Audited and reused the existing VerificationRun model, authorized rescan queue, scanner worker, comparison logic, verification APIs, and history page. Corrected score deltas to compare only the affected page across scans and made malformed/missing target URLs fail closed as REMAINING. Added transaction-level regression-persistence and failed-worker coverage. The existing verification migration remains unapplied; no live database or website was accessed.

## Phase 14 Jira Cloud completion � 2026-11-07

Jira Cloud now exposes status, issue detail/create, disconnect, and sync flows on the authenticated backend. Finding detail and Jira pages are connected to persisted Jira issues. OAuth secrets and tokens remain server-only and AES-256-GCM encrypted; Jira issue descriptions use bounded, sanitized finding fields and omit captured snippets. JiraIssue.lastSyncedAt is an additive, unapplied migration. Focused tests (9) and workspace typecheck passed. Live Atlassian verification and migration application remain pending; see docs/testing.md.

## Phase 15 Visual Agent overlay - 2026-11-07

Audited and extended the existing Visual Agent package without replacing prior work. The overlay now supports drag/keyboard positioning, minimize/reopen, hover/select/cancel, sanitized context review, clear selection, JSON prompt generation, clipboard copy, and JSON export. Captured page metadata is untrusted and filtered; the overlay has no source writer or command execution. Official Antigravity extension docs were reviewed; no documented browser-to-agent dispatch API was found, so handoff is manual via the supported VS Code extension and all source changes remain developer-reviewed. No schema/migration changes. Final checks passed: workspace typecheck (API/web), full Vitest suite (20 files, 112 tests), lint, monorepo build (4 tasks; 21 Next pages), production bundle marker scan, and git diff whitespace check (line-ending warnings only). Component-level browser interactions remain manually unverified because no React component harness is installed. Full evidence is in docs/testing.md.

## Phase 15 isolation follow-up

Implemented: Shadow DOM style isolation, visible/retryable overlay import failure state, and expanded credential redaction. Automated tests: focused Visual Agent suite passed 6/6 after the sanitizer regression fix; package TypeScript build passed. Browser selection, drag, clipboard/download, and authenticated-session behavior remain **not verified**. Antigravity handoff remains manual prompt copy/export because no supported browser-to-agent dispatch was verified. No schema or migration changed.

## Phase 16 security audit follow-up

Found and prepared an additive RLS migration for `JiraOAuthState`, which contains temporary encrypted OAuth tokens but lacked RLS enablement. The migration enables RLS without client policies and remains unapplied pending database-owner approval. Local full suite: 21 files / 113 tests passed, including a migration guard; Prisma validation, typecheck, lint, and build passed. Staging and production security verification is not established by these local checks.

### Phase 17 UI and accessibility polish

Findings details now manage keyboard focus and Escape dismissal; Dashboard and Analytics charts expose textual summaries; select controls have visible keyboard focus; and reduced-motion preferences are honored. No API/schema changes. Automated/browser/manual evidence and limitations are in docs/testing.md. No WCAG conformance claim is made.

### Phase 18 deployment readiness

Local audit only. API binds explicitly to `0.0.0.0`; production API configuration now rejects local/insecure frontend origins. Render Free Chromium capacity/build setup remains unverified and is a staging blocker. Jira OAuth RLS is reported unapplied; the dependency audit was not retried. No external change, migration, or deployment was made. See `docs/deployment.md` for exact environment names, migration review, and approval gates.
