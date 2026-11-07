# AccessLens API

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

Returns workspace metrics for the authenticated profile's personal projects and projects shared with current team memberships. `range` accepts `7d`, `30d`, or `90d` and defaults to `30d`. The range filters the daily scan/finding trend; project, status, severity, recent scan, and project performance values represent authorized persisted records.

The response contains:

- `metrics.projectCount`
- `metrics.scans.total` and `metrics.scans.byStatus` (`QUEUED`, `IN_PROGRESS`, `COMPLETED`, `FAILED`)
- `metrics.findings.total`, `metrics.findings.byStatus` (`OPEN`, `IN_REVIEW`, `RESOLVED`), and `metrics.findings.bySeverity`
- `metrics.accessibilityScore` and `metrics.scoredProjectCount`
- `trends`: one UTC calendar-day entry per selected day, including zero-count days
- `recentScans` (up to 6), `projectPerformance` (up to 8 most recently updated projects), and `recentActivity` (up to 8)

`accessibilityScore` is the rounded average of the latest completed persisted scan score for each authorized project with a completed scan. It is `null` when no project has a completed scored scan. It is an automated metric, not proof of WCAG compliance. Activity results are empty until application actions are wired to write `ActivityLog` rows.

All project queries are scoped to personal ownership or a current team membership (and activity to the authenticated profile). A project's original owner has no access to a team-assigned project without team membership. The endpoint does not accept a user ID.

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

Returns personal projects owned by the authenticated user and team projects visible through current membership. `page` starts at 1; `pageSize` defaults to 20 and is capped at 100.

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

Creates a personal project, or a team project when an optional `teamId` is supplied. Required fields: `name` (2–100 chars) and `url` (HTTP(S), valid, no embedded credentials). `description` is optional and limited to 500 characters. Team project creation requires OWNER, ADMIN, or DEVELOPER. The API derives `ownerId` from the authenticated profile.

### `GET /api/projects/:projectId`

Returns a personal project only to its owner or a team project only to current team members. Unauthorized requests receive `404`.

### `PUT /api/projects/:projectId`

Updates one or more of `name`, `url`, and `description`, with the same validation as create. Personal ownership or team membership with OWNER, ADMIN, or DEVELOPER role is required. VIEWER and non-members cannot update team projects.

### `DELETE /api/projects/:projectId`

Deletes a personal project or a team project. Team project deletion requires OWNER or ADMIN; VIEWER/DEVELOPER and non-members receive `404`. The Prisma foreign key cascades to scan data.

## Scans

Scan creation, history, details, retry, and the background worker are implemented locally. The checked-in scanner migration must be applied to the intended non-production database before these routes can use the new schema.

## Findings

- `GET /api/findings?page=1&pageSize=20&projectId=...&scanId=...&severity=SERIOUS&status=OPEN&wcag=1.1.1&search=...&sortBy=createdAt&sortOrder=desc` returns paginated findings visible to the authenticated user. Filters are optional; page size is capped at 100. Search covers rule ID, title, and description. `sortBy` accepts `createdAt`, `severity`, `status`, or `ruleId`; `sortOrder` accepts `asc` or `desc`.
- `GET /api/findings/:findingId` returns a finding with project, scan, assignee, element context, WCAG tags, and remediation guidance, or 404 when absent or outside the caller's project scope.
- `PATCH /api/findings/:findingId` accepts `{ "status": "OPEN" | "IN_REVIEW" | "IGNORED" | "RESOLVED" }`. `RESOLVED` is accepted only after the latest verification completed with a resolved outcome; otherwise the API returns `409 VERIFICATION_REQUIRED`.
- `POST /api/findings/:findingId/assign` accepts `{ "assignedToId": "profile-id" | null }`. Assignment is limited to active members of the same team; personal findings can only be assigned to their owner.

Finding reads require personal ownership or current team membership. Mutations require project owner or OWNER/ADMIN/DEVELOPER team role; VIEWER is read-only. Every write rechecks project access in the repository. The findings-management migration adds the `IGNORED` status and nullable assignee relation but remains unapplied outside local Prisma schema generation.

## Fix verification

- `POST /api/findings/:findingId/verify` queues a new authorized scan for the finding's captured path on the same project origin and returns `202` with the scan summary.
- `GET /api/verifications?findingId=...` returns up to 100 verification history rows visible to the authenticated user. Omit `findingId` for project-scoped history.
- A completed verification compares the targeted axe rule on the same origin and path. It records `RESOLVED` when the rule is absent, `REMAINING` when the issue remains at the same or lower affected-element count, and `REGRESSED` when it increases. Newly introduced rule/page pairs are also recorded as regressions. Scan failure is stored as a failed verification.
- Verification score change is a heuristic recalculated from findings on the affected page on both scans; it does not compare a one-page verification scan against a multi-page baseline score. Invalid or missing target URLs fail closed as `REMAINING`.
- `PATCH /api/findings/:findingId` accepts `RESOLVED` only after the latest verification is completed with `RESOLVED` outcome.

The verification migration adds queue states, comparison outcomes, and a scan-to-target-finding link. It is not applied to staging or production.

## Gemini AI assistance

- `POST /api/ai/explain` accepts `{ "findingId": "..." }`; `POST /api/ai/fix-suggestions` accepts the same body. Both require a verified Supabase bearer token and OWNER/ADMIN/DEVELOPER access to the finding's current project. VIEWER and cross-team requests are concealed as `404`.
- The legacy `POST /api/findings/:findingId/ai` route remains available. All three generate the same complete explanation and HTML/JSX suggestion bundle, persist it in the existing `AIExplanation`/`FixSuggestion` rows, and write a `finding.ai_assistance_generated` activity event.
- Requests are Zod validated, capped at 8 KB, and pass through API plus expensive-operation rate limits. A missing key/provider failure returns a generic `503`; invalid model output returns `502`. Provider errors, credentials, and prompt content are not returned to clients.
- `GEMINI_API_KEY` is optional and belongs only in the API server environment; never use a `NEXT_PUBLIC_` variable. `GEMINI_MODEL` defaults to `gemini-3.8-flash`. Restart the API after setting the key. The official `@google/genai` SDK uses the Interactions API with structured JSON output.
- Output contains simple explanation, root cause, user impact, WCAG context, manual test steps, and static HTML/React JSX suggestions. AI text is a suggestion, not executable code or an automated source edit. Developer review is required.
- `GET /api/ai/fixes` lists saved AI explanations and suggestions scoped to projects where the caller currently has a writable role.

The backend uses Google's Interactions API with structured JSON output, bounded output, and an API-side timeout. It sends scanner rule details and sanitized element context but omits the page URL and finding identifier. All model output is schema-validated and potentially executable markup is rejected. Suggestions are rendered as text and never run or applied automatically.

## Jira Cloud

- `GET /api/jira/status` returns whether server OAuth is configured, the caller's connection state, and safe connection/issue metadata only.
- `POST /api/jira/connect` creates a hashed, single-use, ten-minute OAuth state and returns the Atlassian authorization URL.
- `GET /api/jira/callback` is the configured OAuth callback. It exchanges the code server-side, fetches accessible Jira sites, encrypts tokens, and redirects to the frontend with an opaque pending-state value.
- `GET /api/jira/pending?state=...` returns only the authorized sites for the authenticated owner. `GET /api/jira/projects?state=...&cloudId=...` lists projects available through that pending grant.
- `POST /api/jira/complete` accepts `{ "state", "cloudId", "projectKey" }`, revalidates the project through Jira, and stores a user-owned integration.
- `GET /api/jira/integrations` returns connection metadata and issue references, never tokens. `POST /api/jira/disconnect` accepts `{ "integrationId" }`; the legacy `DELETE /api/jira/integrations/:integrationId` is also supported. Both clear credentials while preserving issue references.
- `POST /api/jira/issues` accepts `{ "findingId", "integrationId", "includeReviewedRemediation" }`, creates or returns the unique linked Jira issue, and requires a writable finding role plus a caller-owned active integration. The remediation flag is an explicit developer review acknowledgement. The legacy `POST /api/findings/:findingId/jira` remains supported.
- `GET /api/jira/issues/:issueId` returns only issues belonging to the authenticated user's integration; inaccessible records return `404`.
- `POST /api/jira/integrations/:integrationId/sync` synchronizes up to 50 recent issues, persists `lastSyncedAt`, and marks missing/forbidden remote issues `DELETED`/`INACCESSIBLE` without failing the rest of the batch.

OAuth requests use Jira Cloud 3LO with `read:jira-work`, `write:jira-work`, and `offline_access`. Atlassian tokens are AES-256-GCM encrypted with `JIRA_TOKEN_ENCRYPTION_KEY`; rotating refresh tokens replace the stored pair after use. Jira API URLs are built from the fixed Atlassian API host and a provider-returned validated cloud ID.

Configure `JIRA_CLIENT_ID`, `JIRA_CLIENT_SECRET`, `JIRA_REDIRECT_URI` (exact Atlassian callback URL, `/api/jira/callback`), and `JIRA_TOKEN_ENCRYPTION_KEY` (32 random bytes encoded as 64 hex characters) together on the API server. Production callback URLs must use HTTPS. Never place credentials in web environment variables.

### `POST /api/projects/:projectId/scans`

Requires project write permission (personal owner or team OWNER/ADMIN/DEVELOPER). Accepts an optional `paths` array of relative paths, defaulting to `/`. Returns `202 Accepted` with a persisted `QUEUED` scan. The API worker claims queued scans using an atomic status transition, then updates the record to `IN_PROGRESS`, `COMPLETED`, or `FAILED`.

```json
{ "paths": ["/", "/about"] }
```

The worker rechecks current project membership before claiming a queued scan. Retrying a failed scan creates a new scan and preserves the original requested paths.

### `GET /api/projects/:projectId/scans?page=1&pageSize=20`

Returns paginated scan history for an authorized project. Readers may view history; only writable project roles may start or retry a scan.

### `GET /api/scans/:scanId`

Returns the authorized scan status, heuristic score, page count, manual-review count, error state, and persisted axe-core findings. The score subtracts weighted observed violations (critical 10, serious 5, moderate 2, minor 1 per affected element) from 100, bounded at 0. It is only an internal heuristic and is not proof of WCAG conformance.

### `POST /api/scans/:scanId/retry`

Creates a new queued scan from a failed scan. A scan that is not failed returns `409`; inaccessible or missing scans return `404`.

## Scanner safety and limits

The backend accepts only HTTP(S) targets on standard web ports, rejects credentials and URL query/fragment data, resolves all DNS answers, and rejects non-public addresses. The isolated Chromium process uses a local egress proxy that only connects to the validated public IP for the exact target origin; cross-origin redirects and resources are denied before outbound connection. The browser context is non-persistent, sandboxed, blocks service workers and downloads, and only permits GET/HEAD requests. Configured limits cap pages, navigation time, per-page requests, total scan bytes, and concurrent scans per API process. IPv6-only sites are currently unsupported. The scanner reports axe incomplete items for manual review and never claims complete WCAG conformance.

## Teams and membership

### `GET /api/teams`

Lists only teams the authenticated profile belongs to, including the caller's role and member count.

### `POST /api/teams`

Creates a team and makes the authenticated profile its OWNER. Requires `name` (2–100 characters); optional `description` is limited to 500 characters.

### `GET /api/teams/:teamId`

Returns team details, members, role, and (for OWNER/ADMIN only) active invitations. Non-members receive `404`.

### `PUT /api/teams/:teamId`

Updates team `name` and/or `description`; OWNER or ADMIN only.

### `DELETE /api/teams/:teamId`

Deletes a team; OWNER only. Team projects are reassigned as private projects to the deleting owner in the same transaction. If project names conflict with the owner's existing private projects or with each other, the API returns `409` and leaves the team intact.

### `POST /api/teams/:teamId/invitations`

Creates an invitation with an email and optional role (`ADMIN`, `DEVELOPER`, or `VIEWER`; default `DEVELOPER`). OWNER/ADMIN may invite. Only OWNER may grant ADMIN. The `inviteUrl` contains a one-time random token in its URL fragment; only the token hash is stored. Links expire after seven days. If Resend is configured, the API attempts email delivery. The response includes `emailStatus`: `NOT_CONFIGURED`, `PENDING`, `ACCEPTED` (accepted by the provider, not confirmed delivered), or `FAILED`. A failed attempt does not invalidate the invitation; the manual link remains available. Only the invited recipient should receive it.

### `DELETE /api/teams/:teamId/invitations/:invitationId`

Revokes an active invitation; OWNER/ADMIN only. Returns `204` on success.

### `POST /api/team-invitations/accept`

Accepts `{ "token": "..." }`. Requires a verified Supabase email that matches the invitation's email. The invitation must be active, unexpired, and unused. Mismatch or unverified email returns `403`; expired, revoked, or already-used tokens return `410`.

### `PATCH /api/teams/:teamId/members/:memberId`

Changes a member to `ADMIN`, `DEVELOPER`, or `VIEWER`. OWNER/ADMIN only; owners cannot be changed. ADMIN cannot manage or grant ADMIN to another member.

### `DELETE /api/teams/:teamId/members/:memberId`

OWNER/ADMIN can remove other members; a member may leave their own team. Owners cannot be removed or leave through this route. ADMIN cannot remove another ADMIN.

## Team roles

| Role | Read team projects | Create/update team projects | Delete projects | Manage team/members/invitations |
|---|---:|---:|---:|---:|
| OWNER | Yes | Yes | Yes | Yes |
| ADMIN | Yes | Yes | Yes | Yes, except owner/admin restrictions |
| DEVELOPER | Yes | Yes | No | No |
| VIEWER | Yes | No | No | No |

## Still not implemented

Remaining limitations include live staging verification and any feature not described as implemented above. Scanner, findings, verification, Jira, Gemini, analytics, notifications, activity, and PDF/CSV report functionality has local implementations. Database migration application and external-provider workflows remain separately unverified. Dashboard charts use persisted database metrics and do not return demo or fabricated data.



## Scan API additions and result metadata

- `POST /api/scans` accepts `{ "projectId": "...", "paths": ["/", "/about"] }`; writable project role required; returns 202 with a queued scan.
- `GET /api/scans?page=1&pageSize=20[&projectId=...]` returns paginated scans across all readable projects or one readable project.
- Existing `GET /api/projects/:projectId/scans`, `GET /api/scans/:scanId`, and `POST /api/scans/:scanId/retry` remain supported.
- Scan detail includes persisted `passedCount`, `incompleteCount`, `durationMs`, `createdAt`, and page records containing requested/final same-origin URLs, title, completion status, duration, and pass/incomplete counts. The response does not contain cookies, request authorization headers, or form values.
- Scan routes use the shared `/api/scans` expensive-operation limiter in addition to general IP/profile/write limits. IDs and path arrays are validated; path inputs reject query/fragment, protocol-relative, backslash, and control-character paths.

### Jira OAuth state storage boundary

`JiraOAuthState` contains per-user OAuth state hashes and temporary encrypted tokens. The additive migration `20261107233000_jira_oauth_state_rls` enables RLS with no direct-client policy. API repository operations remain profile-scoped; this migration is not yet applied to staging or production.
