# AccessLens API (v1.1.0)

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

## Not available in v1.1.0

Scanner, findings, AI, verification, Jira, analytics, notifications, and team API routes have not been implemented. They intentionally do not return demo or fabricated data.
