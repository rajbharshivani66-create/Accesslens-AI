# Changelog

## v1.2.0 — Database-backed dashboard foundation

- Added the authenticated `/api/dashboard/summary` endpoint with validated 7/30/90-day ranges and owner-scoped project, scan, finding, severity, recent scan, project performance, activity, and trend data.
- Replaced the project-count-only dashboard with real metric cards, date-filtered scan/finding charts, severity distribution, project performance, recent scans, and recent activity.
- Documented that persisted scan scores are automated metrics and not evidence of WCAG compliance; absent scan/activity records remain clearly empty.
- Added Scan `(projectId, startedAt)` and `(projectId, completedAt)` indexes to support dashboard trends and latest-score aggregation.
- Added API tests for dashboard authentication, profile scoping, default range, and invalid range handling.
- Live PostgreSQL query execution and migration application remain unverified without Supabase credentials.

## v1.1.0 — Supabase, Prisma, authentication, and application foundation

- Added Supabase Auth registration, login, logout, email confirmation callback, forgot-password, reset-password, and protected app routes.
- Added Supabase PostgreSQL connection configuration, Prisma client lifecycle helpers, typed enums/models, and an initial migration with RLS policies.
- Added bearer-token verification, authenticated profile initialization/update, and owner-scoped project CRUD with pagination and URL validation.
- Replaced demo dashboard/project records with authenticated API data and explicit empty/loading/error states.
- Added responsive application navigation and clearly marked not-yet-implemented feature pages.
- Added accessible toast notifications for successful profile and project changes.
- Added API authorization and profile/project CRUD tests.
- Documented environment setup, Auth callback configuration, database migrations, API behavior, RLS boundaries, verification, and known limitations.
- Live Supabase Auth, database connectivity, and migration execution remain unverified until real project credentials are configured.

## v1.0.0 — Initial monorepo foundation

- Created the pnpm/Turborepo workspace, Next.js frontend, Express API, Prisma schema, shared package, and isolated Visual Agent scaffold.
- Added deployment examples, initial documentation, and the Visual Agent removal preview.
- Verified the initial build before beginning v1.1.0.
