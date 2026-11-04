# API Documentation

The API is implemented in `apps/api/src/main.ts` and exposes a baseline set of endpoints for auth, projects, scans, AI processing, verification, Jira, analytics, notifications, and team management.

## Included endpoints
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/scans`
- `POST /api/scans`
- `GET /api/scans/:scanId/findings`
- `POST /api/ai/explain`
- `POST /api/ai/suggest-fix`
- `POST /api/verification`
- `GET /api/analytics/overview`
- `GET /api/analytics/trends`
- `GET /api/notifications`
- `GET /api/team`
- `POST /api/team/invite`
- `POST /api/jira/connect`
- `POST /api/jira/test-connection`
- `POST /api/jira/create-issue`
- `GET /api/jira/issues`
