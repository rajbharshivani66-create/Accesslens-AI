# Security Notes

## Identity and authorization

- Supabase Auth is the identity provider. The API verifies bearer tokens with `supabase.auth.getUser(token)`.
- The API derives the AccessLens profile ID from the verified identity; it does not accept a caller-selected profile ID.
- Project and dashboard database queries are scoped to that profile. Dashboard trend queries bind the profile ID and date values as Prisma SQL parameters.
- The backend database connection is trusted and privileged. Ownership filters in the API are security controls, not optional presentation filters.

## Database access

RLS is enabled by the initial migration. Profile self-read/safe-insert and project-owner policies exist for direct authenticated access. Other tables have no client policies yet. Dashboard access uses the backend API; do not expose `DATABASE_URL`, `DIRECT_URL`, or a service-role key to the browser. Add narrowly scoped RLS policies before introducing direct Supabase client access to future tables.

The dashboard repository selects only dashboard fields. It omits arbitrary `ActivityLog.details` because it may contain sensitive metadata.

## Dashboard limitations

Dashboard values are derived from persisted records and are filtered by verified project ownership. The accessibility score is a summary of stored automated scan scores, not a compliance determination. No scan executor or audit-event writer is implemented yet.

## Remaining hardening

Rate limiting, structured production logging, expanded security headers, and deeper integration/security tests remain future work. The planned scanner must add SSRF protections, DNS/redirect checks, browser isolation, and resource limits before it makes outbound requests.
