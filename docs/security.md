# Security Notes

## UI theme and data visibility

The dark/light preference is stored only in the current browser's local storage and contains no account or project data. Empty project, finding, team-member, and Jira selectors do not fabricate choices; actual options are populated from authenticated API responses scoped to the signed-in user's access. Theme selection does not change API authorization or expose credentials.

## Identity and authorization

- Supabase Auth is the identity provider. The API verifies bearer tokens with `supabase.auth.getUser(token)`.
- The API derives the AccessLens profile ID from the verified identity; it does not accept a caller-selected profile ID.
- Personal project queries are scoped to the verified profile. Team project queries additionally require current team membership; a project's original owner has no access bypass after it is assigned to a team. Dashboard aggregates use the same authorized personal-or-team scope. Dashboard trend queries bind the profile ID and date values as Prisma SQL parameters.
- The backend database connection is trusted and privileged. Ownership filters in the API are security controls, not optional presentation filters.

## Database access

RLS is enabled by the migrations. Profile self-read/safe-insert and personal-project owner policies exist for direct authenticated access. The v1.3 migration limits direct project-owner access to rows with `teamId IS NULL`; team projects cannot be accessed by their original owner through the client. Teams, memberships, and invitations have no direct-client policies and are accessed only through the backend API. Do not expose `DATABASE_URL`, `DIRECT_URL`, or a service-role key to the browser. Add narrowly scoped RLS policies before introducing direct Supabase client access to future tables.

The dashboard repository selects only dashboard fields. It omits arbitrary `ActivityLog.details` because it may contain sensitive metadata.

## Team authorization and invitations

- `OWNER` and `ADMIN` manage team settings and invitations; only the owner can delete a team or grant the `ADMIN` role. Admins cannot manage other admins. Owners cannot be demoted or removed.
- `DEVELOPER` can create/update team projects but cannot delete them. `VIEWER` can read team projects only; the API denies project writes.
- Team project access always requires a current membership row. Client-supplied project, team, member, or user IDs are never proof of authorization.
- Invitation tokens are generated from 32 random bytes, returned only in the invite URL fragment, and stored only as SHA-256 hashes. Invitations expire after seven days, can be revoked, and are claimed atomically before membership is created.
- Optional Resend delivery uses only API-server configuration. The provider receives the recipient, team name, invite URL, and expiry; provider response bodies and raw tokens are never logged. `ACCEPTED` means the provider accepted the send request, not that delivery to the mailbox was confirmed. A failed send leaves the invitation active and available through the manual link.
- The API checks Supabase's confirmed-email field and requires a case-insensitive match with the invited email. Invitation links remain available for manual sharing; optional Resend delivery is supported when the API server is configured.
- Deleting a team transfers its projects to the deleting owner as private projects. Name collisions return a conflict rather than silently deleting or exposing data.

## Dashboard limitations

Dashboard values are derived from persisted records and are filtered by verified project ownership. The accessibility score is a summary of stored automated scan scores, not a compliance determination. Activity remains empty until application actions are wired to write `ActivityLog` rows.

## Scanner outbound protection

- Project write authorization is checked when a scan is queued, and current project membership/role is checked again when a worker claims it.
- Target URLs must use HTTP or HTTPS on standard ports. Userinfo, query strings, fragments, localhost/local domains, IPv4/IPv6 non-unicast ranges, DNS answers containing a non-public address, and IPv6-only targets are rejected.
- The API resolves all answers once, then starts a loopback-only egress proxy. Chromium is configured to route through this proxy with loopback bypass disabled. The proxy connects only to the validated IPv4 address and exact target origin; cross-origin redirects are rejected by the proxy before it opens the destination connection. This also prevents DNS rebinding from changing the address used by the worker.
- Browser contexts are new and non-persistent, service workers and downloads are blocked, Chromium sandboxing is enabled, and only GET/HEAD are allowed. The worker caps pages, navigation/evaluation time, request counts, total transfer bytes, and per-process concurrency. Shutdown waits for an active scan; scans left `IN_PROGRESS` for over 30 minutes are marked retryable `FAILED` during startup.
- Captured snippets remove scripts, input values, textareas, selects, contenteditable text, URLs, and data attributes. Query strings and fragments are not stored. AI/finding pages must display these fields as text, never inject them as HTML.

The public-IP resolver, network egress proxy, cross-origin redirect denial, state-changing request denial, and actual axe-core scan were tested with unit tests and a controlled local browser fixture. The browser fixture injects a safe-target resolver only for the loopback fixture; production validation does not allow loopback. A real public website scan, the migration-backed PostgreSQL persistence workflow, staging RBAC, and deployed container sandbox behavior have not been verified. The API worker's multi-instance claims are atomic in PostgreSQL but have not been exercised against a live database.

## Remaining hardening

**Reviewed in source:** bearer tokens are passed to Supabase `auth.getUser`; repository queries scope projects and teams by verified profile and current membership; request bodies and query parameters use Zod schemas; JSON bodies are capped at 1 MB; Express `x-powered-by` is disabled; Helmet supplies CSP, frame, MIME-sniffing, and referrer-policy headers, plus HSTS in production; invitation tokens use 32 random bytes, SHA-256 hashes at rest, seven-day expiry, confirmed-email matching, and atomic single-use claiming; logs include error names but not tokens or provider response bodies. RLS and migration catalog state were previously checked in staging, where team/invitation tables have no direct-client policies.

**Rate limiting implemented:** API traffic is limited by direct/explicitly trusted IP, authenticated API traffic and mutations by verified profile, invitations more strictly by profile, and dashboard/reserved scan/AI route prefixes by profile. Redis storage is required in production; development/test may use process-local storage. Redis startup uses a bounded connection timeout and does not retry indefinitely; startup fails if the configured shared store is unavailable. A request-time store error fails closed through the generic API error response. The API does not trust forwarded headers unless explicit proxy CIDRs are configured; wildcard and `/0` ranges are rejected. `/health` is outside API quotas. Supabase-hosted registration/login remains subject to Supabase-side abuse controls.

Structured production logging remains hardening work. Redis-backed multi-instance behavior and the deployed proxy CIDR configuration have not been verified against a live production-like service. The configured ingress must overwrite or safely append forwarding headers; its behavior has not been verified here.

**Staging verified:** existing migration/schema and RLS checks as described above; the new scanner migration has not been applied. **Automated tests:** rate-limit enforcement, headers, Redis failure handling, scanner target validation, browser isolation, proxy redirect blocking, scan authorization/status/retry, and axe normalization are covered; see `docs/testing.md`. **Production verified:** no. **Blocked/not verified:** real-user authentication, authorization against populated staging records, authenticated Team/Project workflows, live email delivery, Redis-backed multi-instance behavior, deployed proxy/ingress behavior, real website scanning, and migration-backed scanner persistence.

## Findings access and data handling

Finding reads are scoped through the scan's project and current team membership. Status and assignment writes require project ownership or OWNER/ADMIN/DEVELOPER team role, and assignment targets are rechecked against the same team. VIEWER remains read-only. Sort fields are allow-listed by request validation. The UI renders captured snippet/context as text and explicitly labels axe results as automated checks that require manual review; it does not assert WCAG conformance. Manual resolution is disabled until verification evidence is available. Local repository tests cover current-user membership filters, read-only roles, non-member assignment denial, and actor/action/resource metadata written transactionally with status changes. Populated-staging authorization is not verified.

## Verification authorization

Verification requests require current project write access and rescan only the captured path after confirming that it shares the project's origin. Query strings and fragments are discarded. Current project membership is rechecked when the worker claims the scan. Finding status RESOLVED can be written only when the latest persisted verification run completed with RESOLVED outcome; API validation and repository persistence both enforce this condition. Verification history is scoped through the related project on every read.
## Gemini AI handling

Gemini is optional and configured only on the API server through `GEMINI_API_KEY`; it is never exposed to the web bundle. `@google/genai` calls the Interactions API with `store: false`, JSON schema output, a 20-second abort, and the configured `GEMINI_MODEL`. Requests are server-scoped to a writable finding and reject extra fields; the payload is capped at 8 KB and passes through the expensive-operation rate limit. The model receives bounded axe rule metadata and a tag-only sanitized snippet, not page URLs, selectors, failure summaries, cookies, credentials, form values, or finding IDs. Finding data is explicitly treated as untrusted evidence and no URL-fetching tools are provided.

Gemini output must satisfy a strict Zod schema. Static HTML/JSX suggestions reject scripts, handlers, executable URLs, remote sources, and JSX expressions. They are displayed as text, never executed or applied to project source. Provider messages and prompt data are not logged; route failures expose generic messages only. Missing credentials/provider failure returns `503`, malformed output returns `502`. Automated tests mock the SDK; live Gemini behavior, Google data retention beyond the request setting, and provider-account controls are not verified. AI content can be wrong and requires developer review.
## Jira OAuth and issue operations

Jira OAuth state is a random one-time value stored only as a SHA-256 hash, bound to the authenticated profile, and expires after ten minutes. The callback claims it atomically before exchanging the code. Jira refresh/access tokens are encrypted with AES-256-GCM using a server-only 32-byte key; credentials and provider response bodies are not logged or returned to clients. Refresh token rotation replaces the stored pair. Site IDs are validated and all Jira API calls use the fixed api.atlassian.com host, never a user-supplied API host. Issue creation rechecks writable finding access and uses a unique local finding reference; disconnect clears credentials while retaining issue history.

Issue detail and disconnect lookups are scoped to the integration owner. The OAuth callback has an IP rate limit; issue creation and status sync use the expensive-operation rate limit. Finding text is bounded and control characters removed; page URLs are included only when they match the project's origin, and query strings/fragments are removed. Captured snippets and failure summaries are excluded from Jira descriptions. AI explanation is optional, and remediation is sent only when the user explicitly confirms developer review. A stored remote `403`/`404` is represented as `INACCESSIBLE`/`DELETED`; sync records the timestamp and continues processing the batch. Temporary refresh errors do not erase tokens; only Atlassian `invalid_grant` forces reconnection. The OAuth client secret, access tokens, and refresh tokens remain server-side.

## Notifications and report export

Notification reads and state changes are scoped by the authenticated profile ID. Activity history is currently account-scoped and only scan completion/verification events are written. Report queries require the authenticated user and select findings only through projects owned personally or available through current team membership; requested project IDs are part of that same authorization filter. CSV output neutralizes spreadsheet formula prefixes, report responses are private/no-store, and exports are capped at 5,000 latest records. Team/project mutation audit coverage and staging authorization tests remain incomplete.


Audit coverage update: team, invitation, membership, project, finding, AI assistance, and Jira issue actions are recorded for the authenticated actor; completed scans/verifications are also recorded. These are user-profile scoped activity entries, not a tamper-evident security log or organization-wide administrative audit facility. Staging verification remains pending.


## Analytics authorization

Analytics accepts only fixed 7/30/90-day windows and optional project IDs. A requested project is first checked through personal ownership or current team membership; inaccessible IDs return 404. Every Prisma and parameterized PostgreSQL aggregate applies the same owner/team membership predicate, including project summaries, WCAG groups, and trends. Date boundaries use UTC midnight through request time. This has automated query-scope tests but has not been validated against a live populated database or staging environment; database-side RLS remains defense-in-depth, not a substitute for these API checks.

Settings audit: profile edits remain limited to full name/avatar URL and derive identity/email from verified Supabase Auth. Email/password/security preferences and notification preferences are not editable through this app; no unsupported controls were introduced.

## Visual Agent overlay

The Visual Agent is opt-in local development UI (`NODE_ENV=development` and `NEXT_PUBLIC_VISUAL_AGENT_ENABLED=true`), with a production webpack alias to an empty stub. It has no API endpoint, Gemini credentials, filesystem access, shell runner, source patcher, or persistence. Selection listeners are installed only while selection mode is on; the toolbar excludes its own subtree. Captured context uses tag-only selectors, an attribute/style allowlist, bounded classes/labels, geometry, and a route hint with dynamic segments redacted. It never reads form values, text nodes, cookies, authorization headers, query strings, or fragments. Metadata is labeled untrusted in the prompt. The developer reviews and manually copies/exports it to the Antigravity VS Code extension; source edits happen in that agent only after diff review and approval. Local prompt text or downloaded JSON is user-controlled data, so review before sharing it externally.
## Scanner execution and data handling update

The API accepts scans only for projects writable by the verified profile (personal owner or current team OWNER/ADMIN/DEVELOPER); reads include current team members and personal owners. A worker rechecks current writable membership before claiming a queued job. DNS results must all be public unicast; the worker pins traffic to a validated public IPv4 and rejects IPv6-only destinations until equivalent pinning exists. Only HTTP/HTTPS on default ports is accepted. Chromium uses an origin-restricted loopback egress proxy, exact-origin requests, GET/HEAD only, and blocks cross-origin redirects before following them. The browser context is fresh, sandboxed, has service workers/downloads disabled, and is bounded by pages, requests, transfer bytes, concurrency, navigation/axe deadline, and browser startup timeout. Deploy as non-root with Chromium sandbox support; no `--no-sandbox` flag is used.

No auth headers, cookies, or form values are persisted. Finding snippets discard all text and element attributes; page title and same-origin query-free final URL are retained as bounded page metadata. `ScanPage` receives RLS enabled and no direct client policy; API membership checks are the access boundary. Server-side DB credentials may bypass RLS, making repository scoping mandatory. Automated scanning covers only axe-supported rules and does not establish WCAG conformance. Live staging/production egress, DNS/ingress, browser sandbox, and PostgreSQL authorization remain unverified.

### Visual Agent isolation follow-up

The development overlay now renders through a Shadow DOM portal to isolate toolbar CSS from the host application. The host loader catches dynamic import failures and provides a retry action. Context sanitization also redacts `Authorization: Bearer …`, standalone Bearer values, `api_key`, and `client_secret` patterns. This is local implementation; component behavior in an authenticated browser remains **not verified**. The overlay has no source writer, shell executor, or automatic Antigravity dispatch.

## Phase 16 local audit finding

Audit found that migration `20261107200000_jira_oauth` creates `JiraOAuthState`, which stores temporary encrypted Jira access/refresh tokens and OAuth state but did not enable RLS. The API scopes these records by the authenticated profile; a new additive migration `20261107233000_jira_oauth_state_rls` enables RLS and intentionally creates no client policy (default deny). **Migration is generated and reviewed locally only; it has not been applied.** Application through the repository's trusted database role remains possible by design, so API-side user scoping remains required. Database-backed policy behavior and staging/production state are not verified in this phase.

Local hygiene checks: targeted high-confidence secret-pattern scan found no matches outside excluded environment files; client chunks contained no server-only credential variable names, and the production build contained no Visual Agent UI markers. These source/bundle scans are limited pattern checks, not a certification.

### Phase 17 UI security and accessibility notes

Finding detail focus handling is client-side only and does not change authorization. Chart summaries reuse already-authorized API response data. No API, token, environment, database, or migration changes were made. AI suggestions remain displayed as untrusted text/code and are not executed. UI/browser security behavior has not been verified in staging.

## Phase 18 staging controls

The API now binds to `0.0.0.0` for service ingress and fails startup in production mode unless `FRONTEND_URL` uses HTTPS and is not localhost. CORS remains restricted to that exact origin. Production Redis remains mandatory. Do not configure a Supabase service-role key in the browser; current API source does not require it. The Jira OAuth state RLS migration is reported unapplied and remains an approval-gated blocker. The dependency vulnerability status is NOT VERIFIED because the package audit endpoint was not retried. No live staging security tests were run. A Resend credential-like value previously present in `.env.example` was removed; rotate it before staging.

### Live auth callback and frontend API configuration

The web callback exchanges Supabase PKCE codes and supported email OTP `token_hash` types, then uses a same-origin safe destination. Invalid or expired links return to login with a user-facing message; raw callback codes/tokens are not included in error output. The web API client uses localhost only during development. A deployed browser must receive the real HTTPS API origin through `NEXT_PUBLIC_API_URL`; API CORS must allow the exact deployed Vercel origin through server-only `FRONTEND_URL`. Never put database URLs, service-role keys, Gemini/Jira/Resend secrets, or Redis credentials in Vercel `NEXT_PUBLIC_` variables.
