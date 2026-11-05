# AccessLens AI Architecture

## v1.2.0 runtime boundaries

- **Web:** `apps/web` is a Next.js App Router application. Supabase SSR middleware refreshes session cookies and protects authenticated routes. Browser API calls send the Supabase access token to the API.
- **Auth:** Supabase Auth handles passwords, session management, email confirmation, and password recovery. PKCE callbacks exchange codes through `/auth/callback`.
- **API:** `apps/api` verifies bearer tokens with Supabase Auth `getUser(token)`. It derives the profile identity from the verified user and applies owner constraints for profile, project, and dashboard operations.
- **Database:** `packages/database` owns the Prisma schema, generated client, migrations, and RLS policy SQL. Runtime queries use `DATABASE_URL`; migrations use `DIRECT_URL`.
- **Dashboard:** The protected dashboard calls `GET /api/dashboard/summary`; Prisma aggregates persisted project, scan, finding, and activity records only for the verified profile's projects. Parameterized PostgreSQL date aggregation produces UTC daily trends.
- **Shared types:** `packages/shared` contains package-shared domain types.
- **Visual Agent:** `devtools/visual-agent-overlay` remains outside application imports and business logic.

## Request/data flow

```mermaid
sequenceDiagram
  participant Browser
  participant Supabase as Supabase Auth
  participant API as Express API
  participant Prisma
  participant DB as Supabase PostgreSQL
  Browser->>Supabase: Login / session refresh
  Browser->>API: Bearer access token + request
  API->>Supabase: Verify token with getUser(token)
  Supabase-->>API: Verified user ID/email
  API->>Prisma: Owner-scoped operation
  Prisma->>DB: DATABASE_URL connection
  DB-->>Browser: API response through API
```

The API database user is trusted and privileged; its owner filters are mandatory. RLS is enabled in the initial migration; profile self-read/safe-insert and project-owner policies exist, and future-module tables deny direct client access until policies are designed.

The dashboard returns no generated/sample statistics. Its period selector filters daily trends to the last 7, 30, or 90 UTC calendar days; aggregate cards cover all persisted records. Its score is the rounded average of the latest completed stored scan score per owned project and is explicitly not a WCAG compliance claim. Recent activity remains empty until application flows write `ActivityLog` records.

## Deployment

The intended targets are Vercel for `apps/web`, Render for `apps/api`, and Supabase for PostgreSQL/Auth. Deployment files are examples and have not been used for a live deployment.
