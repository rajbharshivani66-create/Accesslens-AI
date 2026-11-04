# Deployment and Local Setup

## Local Supabase configuration

1. Copy the root `.env.example` to `.env`.
2. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, and `SUPABASE_ANON_KEY` from the Supabase project API settings.
3. Set `DATABASE_URL` to the Supabase Postgres pooler URL and `DIRECT_URL` to the direct Postgres connection string.
4. Add the web origin plus `/auth/callback` to the Supabase Auth allowed redirect URLs.
5. Apply the initial Prisma migration:

```bash
pnpm install
pnpm db:generate
pnpm db:validate
pnpm db:migrate
```

`pnpm db:migrate` deploys the checked-in migration without creating a shadow database. Use `pnpm --filter @accesslens-ai/database prisma:migrate:dev` only with a development/shadow database when authoring future migrations. The schema and generated SQL can be validated locally without credentials. Applying the migration and using Auth require valid Supabase settings.

## Development

```bash
pnpm dev
```

The Next.js app uses port 3000 by default; the API uses `PORT` (default 4000) and requires a working PostgreSQL connection before startup.

## Deployment targets

- **Web:** `apps/web`, intended for Vercel. Configure all `NEXT_PUBLIC_*` values and `NEXT_PUBLIC_API_URL` at build time.
- **API:** `apps/api`, intended for Render. Configure Supabase URL/anon key, `DATABASE_URL`, `DIRECT_URL`, `FRONTEND_URL`, and `PORT`. `/health` is the readiness endpoint.
- **Database:** Supabase PostgreSQL with Prisma Migrate.

`vercel.json` and `render.yaml` are starting configuration examples only. No live deployment was performed or verified in v1.1.0.
