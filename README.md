# AccessLens AI

AccessLens AI is a monorepo for an AI-powered accessibility SaaS platform. The repository includes a Next.js frontend, an Express backend, Prisma and Supabase integration, and a development-only visual agent overlay used for element selection and AI-assisted source editing workflows.

## Features
- AI-powered website accessibility scanning with Playwright and axe-core
- Dashboard, projects, findings, verification, Jira, analytics, team and notifications modules
- AI explanations and fix suggestions via Gemini-ready service interfaces
- Development-only overlay for element selection and structured prompt generation
- Safe removal script for disabling the overlay without disrupting the application

## Monorepo layout
- apps/web � Next.js frontend
- apps/api � Express REST API
- packages/shared � shared types and validation helpers
- packages/database � Prisma schema and Supabase integration layer
- devtools/visual-agent-overlay � isolated dev overlay package
- docs � architecture, control, and version documentation

## Commands
```bash
pnpm install
pnpm dev
pnpm build
pnpm run remove
```

Note: `pnpm remove` is a reserved pnpm package-removal action, so the safe remove workflow is exposed as `pnpm run remove` in this project.

## Production notes
- The overlay is development-only and disabled by default.
- The main application remains independent of the overlay.
- Database and environment variables must be configured before production use.
