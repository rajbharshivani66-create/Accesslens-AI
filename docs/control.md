# Control and Versioning

AccessLens AI uses semantic versions in `vMAJOR.MINOR.PATCH` form. Keep `main` production-ready; use `feature/*`, `fix/*`, and `recovery/*` branches for development.

## Current version

**v1.1.0 — Supabase, Prisma, authentication, profile, and project foundation**

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
