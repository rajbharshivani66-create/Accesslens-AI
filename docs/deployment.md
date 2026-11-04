# Deployment Notes

## Frontend
- Target: Vercel
- App: `apps/web`
- Build: `pnpm --filter @accesslens-ai/web build`

## Backend
- Target: Render
- App: `apps/api`
- Build: `pnpm --filter @accesslens-ai/api build`
- Health check: `/health`

## Database
- Supabase PostgreSQL
- Prisma migrations via `pnpm --filter @accesslens-ai/database prisma:migrate`
