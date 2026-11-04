# Control and Versioning

## Version policy
AccessLens AI uses semantic versioning in the format `vMAJOR.MINOR.PATCH`.

Current version: `v1.0.0`

## Release history

### v1.0.0 — Initial monorepo foundation
- Date: 2026-11-05
- Feature: Initial AccessLens AI monorepo scaffold
- Prompt summary: Create the complete monorepo structure, shared packages, databases, docs, and a development-only visual agent foundation.
- Files created:
  - `package.json`
  - `turbo.json`
  - `pnpm-workspace.yaml`
  - `README.md`
  - `CHANGELOG.md`
  - `.env.example`
  - `apps/web/package.json`
  - `apps/web/src/app/page.tsx`
  - `apps/api/src/main.ts`
  - `packages/shared/src/index.ts`
  - `packages/database/prisma/schema.prisma`
  - `devtools/visual-agent-overlay/src/overlay.tsx`
  - `docs/mindmap.md`
  - `docs/control.md`
- Files modified: none
- Files deleted: none
- Database changes: Prisma schema created for project, scan, finding, verification, team, notification, and Jira models
- API changes: Health endpoint and sample auth/project/scan/AI/Jira endpoints implemented
- Logic changes: Dashboard UI and accessibility command center created
- Dependencies: Next.js, Express, Prisma, Zod, Recharts, Tailwind, Lucide
- Tests and results: Build validation pending after dependency install
- Known issues: External SaaS integrations are represented as mock or adapter interfaces; live credentials are not configured
- Git commit hash: not yet committed
- Git tag: pending stable release
- Restore instructions: `git checkout -- .` from project root if repo is initialized later; otherwise restore from backup or recreate the workspace from this scaffold

## Development flow
1. Read `docs/control.md` and `docs/mindmap.md` before a new task.
2. Inspect the current branch and working tree.
3. Identify the latest version.
4. Create a checkpoint and record the planned change.
5. Implement the requested change.
6. Run relevant tests or build checks.
7. Update `docs/mindmap.md`, `docs/control.md`, and `CHANGELOG.md`.
8. Commit the work with a meaningful message.

## Branch strategy
- `main` — production-ready
- `develop` — active integration
- `feature/*` — feature work
- `fix/*` — bug fixes
- `recovery/*` — recovery work

## Restoration guidance
```bash
# Example restore commands
# Restore working tree to last commit
# git restore .

# Recreate a release tag
# git tag v1.0.0
```
