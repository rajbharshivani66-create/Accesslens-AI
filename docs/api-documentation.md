# AccessLens API (v1.2.0)

Base URL: `http://localhost:4000` in local development.

All `/api/*` routes require `Authorization: Bearer <Supabase access token>`. Tokens are verified with Supabase Auth `getUser(token)`. The authenticated Supabase ID and email are trusted; user identity fields in request bodies are ignored.

## Response conventions

Successful JSON responses use `{ "data": ... }`. Project list responses include pagination inside `data`. Errors use `{ "error": { "code": "...", "message": "...", "details"?: ... } }`. `DELETE /api/projects/:projectId` returns `204` without a body.

## Health

### `GET /health`

Checks the PostgreSQL connection. Returns `200` with database status or `503` when PostgreSQL is unavailable.

## Authentication

### `GET /api/auth/me`

Returns the verified Supabase user ID, email, and AccessLens profile ID.

## Dashboard

### `GET /api/dashboard/summary?range=30d`

Returns workspace metrics for the authenticated profile's projects. `range` accepts `7d`, `30d`, or `90d` and defaults to `30d`. The range filters the daily scan/finding trend; project, status, severity, recent scan, and project performance values represent all persisted records.

The response contains:

- `metrics.projectCount`
- `metrics.scans.total` and `metrics.scans.byStatus` (`QUEUED`, `IN_PROGRESS`, `COMPLETED`, `FAILED`)
- `metrics.findings.total`, `metrics.findings.byStatus` (`OPEN`, `IN_REVIEW`, `RESOLVED`), and `metrics.findings.bySeverity`
- `metrics.accessibilityScore` and `metrics.scoredProjectCount`
- `trends`: one UTC calendar-day entry per selected day, including zero-count days
- `recentScans` (up to 6), `projectPerformance` (up to 8 most recently updated projects), and `recentActivity` (up to 8)

`accessibilityScore` is the rounded average of the latest completed persisted scan score for each owned project with a completed scan. It is `null` when no project has a completed scored scan. It is an automated metric, not proof of WCAG compliance. Activity results are empty until application actions are wired to write `ActivityLog` rows.

All queries are scoped to the verified profile's project ownership (and its own activity rows). The endpoint does not accept a user ID.

## Profile

### `GET /api/profile`

Returns the authenticated user's profile. The profile is idempotently created from verified identity data on the first successful `/api/*` request.

### `PUT /api/profile`

Updates `fullName` and/or `avatarUrl`. Does not accept user ID, email, or role changes.

Example:
```json
{ "fullName": "Avery Example", "avatarUrl": "https://example.com/avatar.png" }
```

## Projects

### `GET /api/projects?page=1&pageSize=20`

Returns only projects owned by the authenticated user. `page` starts at 1; `pageSize` defaults to 20 and is capped at 100.

Response:
```json
{
  "data": {
    "items": [],
    "pagination": { "page": 1, "pageSize": 20, "total": 0, "totalPages": 0 }
  }
}
```

### `POST /api/projects`

Creates a project for the authenticated profile. Required fields: `name` (2–100 chars) and `url` (HTTP(S), valid, no embedded credentials). `description` is optional and limited to 500 characters. The API does not accept an owner ID.

### `GET /api/projects/:projectId`

Returns the project only if owned by the authenticated profile. Other users receive `404`.

### `PUT /api/projects/:projectId`

Updates one or more of `name`, `url`, and `description`, with the same validation as create. Ownership is included in the database update condition.

### `DELETE /api/projects/:projectId`

Deletes an owned project. Other users receive `404`. The Prisma foreign key cascades to its scan data.

## Not available in v1.2.0

Scanner execution, finding-management routes, AI, verification, Jira, full analytics, notifications, and team API routes have not been implemented. Dashboard charts are limited to persisted database metrics and do not return demo or fabricated data.
