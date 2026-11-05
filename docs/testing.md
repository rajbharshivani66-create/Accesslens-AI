# Testing and Verification

## Local commands

Run from the repository root:

```bash
pnpm db:generate
pnpm db:validate
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

`pnpm db:validate` needs syntactically valid `DATABASE_URL` and `DIRECT_URL` values even though it does not connect to PostgreSQL. `pnpm db:migrate` does connect and must only be run with the intended Supabase project configured.

## v1.2.0 coverage

The Vitest API suite exercises authentication rejection, profile/project CRUD and owner isolation, plus dashboard summary authentication, verified-profile scoping, default date range, and invalid range validation. API tests inject an in-memory repository and token verifier. They validate API behavior, not Prisma SQL execution or hosted services.

The dashboard aggregates and charts are covered by workspace TypeScript, lint, and production build checks. There are no browser-level dashboard tests in this phase.

## External verification status

Live Supabase authentication, PostgreSQL connectivity, Prisma migration deployment, and real dashboard query execution have not been tested because credentials are not configured. Do not treat schema validation or in-memory API tests as a live integration test.
