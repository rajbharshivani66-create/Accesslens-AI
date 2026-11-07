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

## v1.3.0 coverage

The Vitest API suite exercises team creation/details/listing, admin team updates and privilege limits, owner-only deletion and owner protection, member role changes/removal, project role capabilities, team-shared project reads, cross-team isolation, original-owner access after membership removal, delete-team project transfer/conflicts, and invitation security/lifecycle (confirmed email, mismatch, expiry, revocation, single use, and token hash equality). It also covers missing email configuration, Resend request construction/failure handling, and API behavior when the configured sender fails. API authorization uses injected identities and in-memory repositories; the tests do not exercise Prisma against PostgreSQL.

The rate-limit suite verifies HTTP 429 and the stable error body, `RateLimit`/`Retry-After` headers, per-window reset, account-keyed invitation enforcement, exemption of `/health`, and resistance to arbitrary `X-Forwarded-For` values when no trusted proxy is configured. Environment tests cover Redis URL, production Redis requirement, numeric defaults, and proxy CIDR validation. Tests use the in-memory store; they do not verify Redis server connectivity or multi-instance counter sharing.

Previously recorded local verification for the v1.3.0 working tree (these results predate this final verification attempt):

- `pnpm db` â€” passed: Prisma Client generation and schema validation using the configured API environment; the script does not connect to PostgreSQL or apply migrations.
- `pnpm typecheck` â€” passed.
- `pnpm test` â€” passed: 3 test files, 16 tests.
- `pnpm lint` â€” passed.
- `pnpm build` â€” passed.
- `git diff --check` â€” passed.

That initial attempt was blocked by the global pnpm shim and registry proxy. The follow-up verification below resolved package-manager execution without bypassing signature checks.

## v1.2.0 coverage

The Vitest API suite exercises authentication rejection, profile/project CRUD and owner isolation, plus dashboard summary authentication, verified-profile scoping, default date range, and invalid range validation. API tests inject an in-memory repository and token verifier. They validate API behavior, not Prisma SQL execution or hosted services.

The dashboard aggregates and charts are covered by workspace TypeScript, lint, and production build checks. There are no browser-level dashboard tests in this phase.

## External verification status

- **Supabase Auth endpoint:** `GET /auth/v1/settings` returned HTTP 200 for the configured backend URL/key. This verifies endpoint reachability only; user registration, login, logout, session persistence, invalid/expired tokens, and identity mapping were not exercised.
- **PostgreSQL:** Read-only `SELECT 1` succeeded through both configured `DATABASE_URL` and `DIRECT_URL`. The API and frontend Supabase hosts, and the project references in the database usernames, match.
- **Migrations/schema-backed operations:** With explicit approval for the user-confirmed disposable staging database and verified backup, `pnpm db:migrate` applied all three migrations. `prisma migrate status` then reported the schema up to date. Read-only checks verified the `OWNER, ADMIN, DEVELOPER, VIEWER` enum labels, two invitation foreign keys, five invitation indexes, and RLS enabled on `Project`, `Team`, `TeamMember`, and `TeamInvitation`. The personal-project-only owner policy was present; team and invitation tables had no direct-client policies. Before migration, no AccessLens core tables or migration history existed, so no existing AccessLens data was present to convert. This does not verify authorization against populated records.
- **Prisma repository queries:** Read-only team listing, project listing, and dashboard aggregates succeeded against the migrated staging schema using a nonexistent profile ID; all returned empty results. No test users, teams, memberships, projects, or other application rows were inserted.
- **API runtime:** `/health` returned HTTP 200 using the configured PostgreSQL connection. Requests to `/api/auth/me` with no token and an invalid token both returned HTTP 401. These checks do not prove successful login or access to migration-backed application tables.
- **Resend:** `RESEND_API_KEY` and `INVITATION_FROM_EMAIL` are blank/unset. Unit tests cover request construction and provider failure; no provider request or mailbox delivery was tested.
- **Browser:** Playwright smoke checks loaded `/login`, `/register`, and `/forgot-password`; unauthenticated requests to `/dashboard`, `/projects`, and `/team` redirected to login. The login page had no horizontal overflow at 1440px, 768px, or 375px widths. No authenticated Team/Project CRUD, invitation acceptance, or dashboard data flow was tested.

## v1.3.0 final blocker resolution â€” 2026-11-07

Corepack 0.34.5 fetched and selected pinned `pnpm@9.15.0` with signature verification enabled. The global PowerShell `pnpm` shim resolves to pnpm 11.25.0 and conflicts with the repository pin, so scripts were run through Corepack's verified 9.15.0 entry point with a temporary PATH shim for nested `pnpm` calls. No pin or signature-check setting was changed.

- `pnpm db` â€” passed. Prisma Client generation and schema validation passed with local placeholder PostgreSQL URLs; this command did not connect to a database or apply migrations.
- `pnpm typecheck` â€” passed: 2 TypeScript tasks. A forced uncached Turbo rerun also passed both tasks.
- `pnpm test` â€” passed: 3 files, 16 tests. The suite uses injected identities and in-memory repositories; it is not database-backed RBAC verification.
- `pnpm lint` â€” passed; uncached ESLint task reported no warnings or errors.
- `pnpm build` â€” passed: 4 tasks. An uncached build executed API and database TypeScript checks, Prisma Client generation, visual-agent typecheck, and Next.js production build. Turbo warned that the visual-agent build has no configured output files.
- `git diff --check` â€” passed.

The regular registry path was blocked by a configured proxy refusing `127.0.0.1:9`; Corepack's verified fetch succeeded when network access was allowed. Prisma's schema-engine artifact also required network access. Initial sandboxed attempts failed on network/process restrictions; the network-enabled reruns passed.

**Staging verified:** prior documented migration/status, catalog/RLS, connectivity, and empty-result repository checks only. **Automated tests passed:** local results above. **Production verified:** no; no production database or migration was touched. **Blocked/not verified:** live Auth flows, populated-record RBAC and cross-team isolation, authenticated Team/Project browser workflows, and Resend delivery. No dedicated test-account credentials or approved test inbox are configured. `RESEND_API_KEY` and `INVITATION_FROM_EMAIL` are blank/unset; manual invitation links remain available. Do not treat endpoint reachability, `SELECT 1`, or empty-result Prisma queries as proof of authentication or populated-record authorization.

## Follow-up rate-limit implementation â€” 2026-11-07

The former missing API limiter is now implemented. The verified `pnpm@9.15.0` scripts and uncached checks produced these results after the change:

- `pnpm db` â€” passed Prisma generation and schema validation with local placeholder URLs; no database connection or migration was performed.
- `pnpm typecheck` â€” passed both workspace TypeScript tasks.
- `pnpm test` â€” passed: 4 files, 24 tests. This includes 6 rate-limit tests covering 429 response/headers, window reset, invitation quotas, health exemption, reserved expensive routes, forwarded-header spoofing, CORS allow-list behavior, and `x-powered-by` removal. The first run had one incorrect CORS test expectation; it was corrected and the final suite passed.
- `pnpm lint` â€” passed; the uncached web ESLint task reported no warnings or errors. The API package has no lint script.
- `pnpm build` â€” passed: 4 workspace tasks; the API TypeScript build and Next.js production build completed. Turbo reports the existing visual-agent task has no configured output files.
- `git diff --check` â€” passed after the final code and documentation edits.

Redis-backed multi-instance sharing was not tested against a Redis service. Production startup now requires `RATE_LIMIT_REDIS_URL` and fails closed if Redis cannot connect; deploy only after configuring a shared Redis/Valkey service and confirming trusted proxy CIDRs/ingress behavior. Staging authentication, populated-record RBAC, authenticated browser flows, Resend delivery, and production verification remain blocked as described above.

## Phase 2 API security hardening â€” 2026-11-07

Helmet response headers were added to API responses. Production responses include HSTS; development and test responses omit HSTS. The Redis client now uses a bounded connection timeout with automatic reconnect disabled during startup, so a configured but unavailable store prevents API startup instead of leaving startup retrying indefinitely. Request-time Redis store failures also fail closed through the generic 500 handler.

Focused verification used the pinned Corepack pnpm 9.15.0:

- `corepack pnpm exec vitest run apps/api/src/__tests__/rate-limit.test.ts apps/api/src/__tests__/environment.test.ts` â€” passed: 2 files, 15 tests. Covered rate-limit response/reset, API/auth/write/invitation/expensive-route limits, proxy-header spoof resistance, health exemption, CORS, security headers, closed behavior on request-time store error, and startup failure when Redis is unavailable. The Redis outage cases use an injected failure and a local refused connection; they do not verify a live Redis service.
- `corepack pnpm --filter @accesslens-ai/api typecheck` â€” passed.

**Implemented:** local API security headers and fail-closed Redis handling. **Automated tests passed:** focused suite above. **Staging verified:** no new staging checks in this phase. **Production verified:** no. **Blocked/not verified:** shared Redis behavior across API instances and deployed proxy/ingress forwarding configuration.

## Phase 3 accessibility scanner â€” 2026-11-07

Implemented a durable scan queue, API worker, authenticated status/history/detail/retry routes, project-role checks, Playwright + axe-core execution, WCAG tag/finding normalization, persistence methods, and scanner UI polling. Requests return `202 Accepted`; scans persist as `QUEUED`, transition to `IN_PROGRESS`, then `COMPLETED` or `FAILED`. Failed retries create a new scan with the original requested paths. Stale `IN_PROGRESS` work older than 30 minutes is marked retryable on API startup.

Scanner SSRF and execution controls include DNS answer validation, public-unicast address checks, standard-port restrictions, DNS-pinned local egress proxying, exact-origin enforcement, redirect denial before outbound connection, GET/HEAD-only requests, a fresh sandboxed Chromium context, service-worker/download blocking, and configurable page/time/request/transfer-byte/concurrency limits. Captured HTML snippets strip scripts, form values, editable text, URLs, and data attributes. axe incomplete results are surfaced for manual review. The score is a documented heuristic and not a compliance claim.

Verification on the current working tree:

- `corepack pnpm db` â€” passed Prisma Client generation and schema validation with non-routable placeholder URLs. This did not connect to PostgreSQL or apply migrations.
- `corepack pnpm exec vitest run` â€” passed: 8 files, 53 tests. Includes a real Playwright/Chromium run against a controlled local page; the test verifies axe finds an image-alt failure, cross-origin resources and redirects do not reach the loopback destination, and POST side effects do not reach the fixture server. It injects a test-only resolver for the local fixture; production DNS validation rejects loopback.
- `corepack pnpm --filter @accesslens-ai/api typecheck` â€” passed.
- `corepack pnpm --filter @accesslens-ai/web typecheck` â€” passed.

**Implemented:** local scanner code and UI. **Automated tests passed:** above. **Staging verified:** no; the scanner migration was not applied and no staging website was scanned. **Production verified:** no. **Blocked/not verified:** database-backed queue persistence, real public-site scan behavior, live team-role enforcement against populated rows, actual deployment browser sandbox support, and multi-instance worker coordination against PostgreSQL. The worker and browser run in the API process; deploy as non-root with Playwright's matching Chromium headless shell installed.

## Phase 4 findings workflow — 2026-11-07

Implemented paginated, filterable finding list/detail APIs and a connected frontend for project, scan, severity, workflow status, WCAG, and text search. Findings expose scanner rule metadata, severity/impact, WCAG tags and rule reference, page/selector/sanitized context, failure summary, project/scan and heuristic score. Writable roles can assign to a current team member, unassign, or update OPEN/IN_REVIEW/IGNORED workflow states. RESOLVED is intentionally rejected until Phase 6 verification can establish a comparison record. This is automated axe output and does not certify WCAG conformance.

Focused local verification: findings/app API suite passed (2 files, 14 tests); API typecheck passed; web typecheck and lint passed; Prisma client generation passed. `git diff --check` passed; full workspace regression checks remain for final integration. Staging/production migration, populated-record RBAC, authenticated browser workflow, and database-backed integration remain unverified. Migration `20261107150000_findings_management` is not applied.

## Phase 5 fix verification

Implemented authorized verification scan requests for the affected page, persisted QUEUED/IN_PROGRESS/COMPLETED/FAILED history, same-origin/path and axe-rule comparison, resolved/remaining/regressed outcomes, newly introduced rule detection, and a verified-only transition to RESOLVED. The verification page polls active runs and displays history, scan status, outcome, score delta (heuristic), and regression/resolution counts.

Focused verification on this working tree: 3 suites, 12 tests passed (verification comparisons, finding API authorization/workflow, scan behavior); API build/typecheck and web typecheck/lint/production build passed; Prisma schema validation passed with non-routable placeholder URLs; git diff --check passed. Live database-backed verification persistence, staging migration, populated RBAC, authenticated browser flow, and real-site rescans are not verified. Migration 20261107180000_fix_verification has not been applied.
## Gemini AI implementation

Implemented a backend-only Gemini Interactions API adapter, structured response validation, bounded prompts that omit page URLs and IDs, safe suggestion checks, persisted explanations/fixes, and a connected AI Fixes page. The provider key is optional; without it, generation is explicitly unavailable and no result is stored. No live provider call was run; approved credential availability was not verified. Local tests cover response extraction, validation, unsafe output rejection, private URL omission, persistence via an in-memory repository, and unconfigured-provider behavior.
## Jira Cloud implementation

Implemented server-side OAuth 2.0 3LO authorization/code exchange, one-time hashed state, accessible-site/project selection, encrypted access and rotating refresh tokens, disconnect, permission-checked issue creation, persistent issue references, and explicit issue-status synchronization. Phase 14 focused tests cover token encryption/tamper rejection, Jira site/scope validation, hashed OAuth state, callback token handling, safe issue payload/page URL behavior, duplicate prevention, user-scoped issue/disconnect queries, mixed success/403/404 sync results, last-sync timestamps, activity records, and transient versus invalid-grant refresh failures. `pnpm exec vitest run apps/api/src/__tests__/jira.test.ts` passed (1 file, 9 tests). `pnpm typecheck` passed for API and web. Tests mock Jira HTTP and Prisma; they do not exercise a real database or Atlassian site. No live Jira credentials/site were used; OAuth consent, real project permissions, issue creation, refresh rotation, and remote status sync remain unverified. Migrations 20261107200000_jira_oauth and 20261107230000_jira_issue_sync are unapplied.
## Visual Agent development tooling

Audited the prior component: it rendered hard-coded sample data and did not implement hover/click selection. It is now an opt-in development toolbar with hover outline, click selection, Escape cancellation, limited context capture, redaction, reviewable structured JSON, and explicit clipboard handoff. It does not call Antigravity or execute/edit source. Local verification: Visual Agent package TypeScript build passed, web typecheck/lint passed, and 2 sanitizer/prompt tests passed. A Next.js production build completed; searching emitted `.next/static` chunks found no `ACCESSLENS VISUAL AGENT` toolbar text after production aliasing to an empty stub. Browser interaction in an authenticated development session was not performed.

## Phase 8 notifications, activity, and reports â€” 2026-11-07

Implemented account-scoped notification listing/read state and activity history APIs backed by existing Prisma models; completed scan/verification jobs now write persistent notification and audit records. Added a connected notification inbox and account activity view. Implemented CSV and PDF finding exports with authorized-project scoping and a 5,000-row cap; CSV values beginning with spreadsheet formula characters are neutralized. Report-export tests passed (2 tests), and API/web typechecks passed. No staging database or browser session was used; events are currently recorded for scan completion/verification only, so team/project mutation audit coverage remains incomplete. Staging/production behavior is not verified.

Commands executed: pnpm 9.15.0 "pnpm --filter @accesslens-ai/api typecheck" (passed); "pnpm --filter @accesslens-ai/web typecheck" (passed); "pnpm exec vitest run apps/api/src/modules/reports/report-export.test.ts" (2 tests passed; sandbox retry required approval after spawn EPERM); "git diff --check" (passed with line-ending warnings). No DB migration or live staging test was run.


Phase 8 follow-up: audit events now also cover team create/update/delete, invitations, membership/role changes, project create/update/delete, finding status/assignment, AI assistance persistence, and Jira issue creation. Jira issue creation emits an account notification. Added an API authorization test for profile scoping. This improves but does not establish staging or production audit completeness; event storage and reads are profile-scoped, not a cross-team admin audit console.


## Phase 9 analytics/settings/final integration audit â€” 2026-11-07

Analytics route test covers unauthenticated rejection, invalid range rejection, profile-scoped repository call, and inaccessible-project 404. Repository tests cover tenant scope predicates, project/date query parameters, category/totals wiring, and early rejection for inaccessible project IDs. Logic tests cover UTC calendar boundaries and zero-filled date buckets. API app tests also verify notification/activity scoping; existing export tests continue to cover CSV formula escaping and PDF marker output. Settings persistence remains covered by existing profile API tests; no UI component test harness is installed, so loading/error rendering was validated by typecheck/lint/build rather than component tests.

Exact final commands (pnpm 9.15.0): `pnpm db` passed; `pnpm typecheck` passed, 2 Turbo tasks; `pnpm test` passed, 16 test files/80 tests; `pnpm lint` passed, 1 task; `pnpm build` passed, 4 tasks; `git diff --check` passed with Git LF-to-CRLF warnings. DB generation/validation used non-routable placeholder URLs and did not connect or migrate. The production Next build reports `/analytics` generated successfully. No staging/production/authenticated browser tests were run.
## Phase 10 scanner implementation update â€” 2026-11-07

Audit confirmed Playwright 1.58.0 and axe-core 4.14.0 were already pinned and installed; no dependency was added. Existing API worker, scanner UI, URL guard/proxy, queue, and scan/finding models were extended rather than recreated. Added authenticated root `POST /api/scans` and paginated `GET /api/scans` routes while retaining project-scoped history routes. Results now store passed checks, elapsed duration, and per-page requested/final URL, title, status, duration, and passed/incomplete counts in `ScanPage`; existing `Scan`/`Finding` continue to store status and violations. Added a hard page deadline covering navigation and axe evaluation, WCAG 2.0/2.1/2.2 A/AA/AAA tags supported by axe, and safer snippet capture that strips all page text and attributes. URL path inputs reject protocol-relative paths, query/fragment delimiters, backslashes, and controls.

Focused command: `pnpm exec vitest run apps/api/src/__tests__/safe-target.test.ts apps/api/src/__tests__/playwright-axe-scanner.test.ts apps/api/src/__tests__/scanner-browser.test.ts apps/api/src/__tests__/scans.test.ts apps/api/src/__tests__/prisma-scan.repository.test.ts` â€” passed, 5 files/32 tests. This included a real Playwright/Chromium run against a controlled local HTTP fixture with a test-only resolver and asserted axe violation detection, per-page metadata, private redirect/resource blocking, and blocked POST side effects. API/web typechecks passed. Prisma schema validation passed with non-routable placeholder URLs. The Prisma persistence test is an isolated transaction mock, not a live database test.

`ScanPage`/scan metadata migration `20261107160000_scan_page_results` is new and unapplied. The earlier scanner schema migration `20261107120000_scanner_engine` is also unapplied to staging/production per this work. No live database, staging account, public website, or production scan was used. Exact final full-suite/lint/build results are recorded after final check execution below.
Final repository-wide Phase 10 check results on 2026-11-07 using the verified pnpm 9.15.0 shim: `pnpm db` passed (Prisma generate + validate); `pnpm typecheck` passed (2 Turbo tasks); `pnpm test` passed (17 test files, 88 tests); `pnpm lint` passed (1 Turbo task); `pnpm build` passed (4 Turbo tasks; Next production build generated 21 static pages and `/scanner`); `git diff --check` passed with Git LF-to-CRLF warnings. Database checks used `DATABASE_URL` and `DIRECT_URL` set in the command process to non-routable placeholder URLs; no DB connection/migration was attempted. Vitest/Next build were run outside the sandbox after sandbox worker spawning returned EPERM. No public target, live staging account, staging database, or production environment was accessed. The controlled Playwright fixture is not equivalent to live staging verification.
## Phase 11 findings management completion - 2026-11-07

Audit confirmed scan-backed finding persistence, authenticated list/detail/status/assignment APIs, current membership and project-role enforcement, transactional activity writes, and sanitized scanner context were already present. Added allow-listed sorting by createdAt, severity, status, or axe rule ID, with ascending/descending ordering exposed in the page filters. Replaced the Findings card list with a responsive table and wired a detail panel to GET /api/findings/:findingId; status and assignment controls remain authorization-aware. No schema or migration change was required.

Focused validation: API and web TypeScript checks passed; Next lint for the Findings page passed with no warnings or errors. `vitest run apps/api/src/__tests__/findings.test.ts apps/api/src/__tests__/prisma-finding.repository.test.ts` passed (2 files, 8 tests). New repository tests cover tenant-filter construction, sort/pagination forwarding, transactional status audit writes, and rejection of assignment to a non-member. No live database or staging authorization test was run; production remains unverified. No `.env` change or migration execution occurred.
## Phase 12 Gemini accessibility assistant - 2026-11-07

The backend now uses Google's official `@google/genai` SDK and Interactions API. Focused tests mock only the SDK; they cover response parsing, strict output validation, unsafe suggestion rejection, omission of URL/selector/failure-summary/form values, prompt-injection evidence handling, persistence through an in-memory repository, and missing-key/malformed-output failures. Exact Phase 12 local checks: `vitest run` passed (20 files, 98 tests); API and web typechecks passed; lint passed for both edited pages; Prisma schema validation passed using non-routable placeholder URLs; `git diff --check` passed with line-ending warnings. No frontend component-test harness exists. No live Gemini call or database migration was run; live credentials/model access and staging database remain BLOCKED / NOT VERIFIED.
## Phase 13 verification regression follow-up - 2026-11-07

Audited the existing verification queue, worker and history UI. Corrected score deltas so one-page verification scans compare only findings on the affected page against that page's baseline, rather than the original multi-page scan score. Invalid or missing target URLs now fail closed as REMAINING. Added comparison edge-case tests, same-page score-delta and newly introduced regression persistence tests, and worker failure status propagation tests.

Focused command `vitest run apps/api/src/__tests__/verification.test.ts apps/api/src/__tests__/prisma-scan.repository.test.ts apps/api/src/__tests__/findings.test.ts apps/api/src/__tests__/scans.test.ts` passed: 4 files, 20 tests. API and web typechecks passed; Prisma schema validation passed with non-routable placeholder URLs; Verification page lint passed; `git diff --check` passed with existing line-ending warnings. No migration, live database, staging site, or production site was accessed.

## Phase 15 Visual Agent overlay

The existing overlay package was extended in place. Focused tests exercise metadata redaction, attribute/style allowlists, password/form-value and dynamic route omission, prompt safety framing, and toolbar self-exclusion. pnpm --filter @accesslens-ai/visual-agent-overlay build passed; pnpm exec vitest run devtools/visual-agent-overlay/src/overlay.test.ts passed (1 file, 5 tests); pnpm --filter @accesslens-ai/web typecheck passed. No React component-test harness is present, so pointer dragging, keyboard movement, browser selection, clipboard, and download interactions still need manual browser verification. Final checks: `pnpm typecheck` passed (API/web); `pnpm test` passed (20 files, 112 tests); `pnpm lint` passed (Turbo lint task); `pnpm build` passed (4 tasks, Next generated 21 pages; overlay has no build artifacts); production output scan passed with no Visual Agent marker strings. Git emitted only existing LF-to-CRLF warnings during diff hygiene. Antigravity handoff is manual; no MCP/browser bridge or automatic source modification is implemented. No database schema changed.

### Phase 15 Visual Agent isolation follow-up

`corepack pnpm --filter @accesslens-ai/visual-agent-overlay build` passed after the package declared the already-used React DOM runtime/types. `corepack pnpm exec vitest run devtools/visual-agent-overlay/src/overlay.test.ts` passed: 1 file, 6 tests, including Authorization Bearer, standalone Bearer, API key, and client secret redaction. The sandbox initially blocked Vitest worker startup (`spawn EPERM`); the final run outside the sandbox passed. No authenticated browser interaction was performed. Production exclusion still requires a fresh bundle check in this follow-up.

## Phase 16 local security verification

- `corepack pnpm test` (pinned pnpm 9.15.0 shim): passed, 21 files / 113 tests. Includes API auth/RBAC and IDOR-style tests with injected identities/in-memory repositories, scanner SSRF tests and controlled Chromium fixture, mocked Gemini/Jira workflows, report export tests, rate-limit tests, and the new Jira OAuth RLS migration guard.
- `corepack pnpm db` with non-routable process-local placeholder PostgreSQL URLs: passed Prisma Client generation and schema validation; no connection or migration was performed.
- `corepack pnpm typecheck`: passed, 2 Turbo tasks. `corepack pnpm lint`: passed. `corepack pnpm build`: passed, 4 Turbo tasks / 21 Next pages.
- `git diff --check`: passed (Git emitted existing LF-to-CRLF working-copy warnings). Dependency audit was not completed: npm audit network access failed with `ECONNREFUSED`; escalation was rejected because sending the repository dependency manifest/lock metadata to the npm audit endpoint was not approved. No alternate endpoint/workaround was used.

These tests use mocks and controlled local fixtures. They are not live Supabase, Jira, Gemini, populated PostgreSQL RBAC, or authenticated staging browser verification. `20261107233000_jira_oauth_state_rls` is unapplied and must be reviewed against staging before use.


Additional Phase 16 local checks: a high-confidence secret-pattern scan (excluding `.env` files) found no matches; client chunk scan found no server-only credential variable names; production output scan found no Visual Agent markers. The static checks do not prove the absence of unknown secret formats or replace a runtime bundle review.

## Phase 17 UI and accessibility verification

### Source audit and changes

Audited authentication routes; Dashboard; Projects and project details; Scanner/history/results; Findings/details; AI Fixes; Fix Verification; Jira; Team; Notifications; Activity; Analytics; Settings; shared AppShell, auth form, toast provider, global styles; and README/control/security/mindmap/testing documentation. Reports are exposed through Analytics exports; no separate Reports page was found. Removed duplicate nested `<main>` landmarks from authenticated routes. Added keyboard focus management to the Findings detail dialog, textual chart summaries for Dashboard and Analytics, select focus styling, and reduced-motion CSS.

### Automated checks

Using the repository-installed pnpm 9.15.0 shim: `pnpm typecheck` passed (2 Turbo tasks); `pnpm test` passed (21 files, 113 tests); `pnpm lint` passed; `pnpm build` passed (4 Turbo tasks, Next.js generated 21 static pages); `git diff --check` passed with existing Git LF-to-CRLF notices. The initial full-suite run had one transient rate-limit test failure (expected 429, got 200); that test passed on isolated rerun and the subsequent full run passed all 113 tests. `corepack pnpm typecheck` itself did not start because Corepack selected pnpm 11.25.0 while the repository pins 9.15.0; the installed `pnpm` shim selected the pinned version without modifying project configuration. Existing Playwright/axe coverage is controlled scanner-target testing; no frontend app-page Playwright/axe harness was present during audit. Automated source/build checks are not WCAG conformance evidence.

### Browser, responsive, and manual checks

Status: NOT VERIFIED. No authenticated browser session or frontend browser-test harness was available to exercise all routes at 320, 375, 425, 768, 1024, 1280, and 1440 CSS pixels. Keyboard and screen-reader checks were not performed manually. The narrow-screen navigation is horizontally scrollable; it requires runtime verification. Staging and production are not verified.

### Limits

No live services, production accounts, or populated production data were used. Automated axe results, if any, apply only to the controlled scanner fixtures and do not establish WCAG 2.2 AA conformance for the application.

## Phase 18 deployment-readiness verification

- `pnpm typecheck`: passed, 2 Turbo tasks.
- `pnpm test`: passed, 21 files / 114 tests. `scanner-browser.test.ts` launched local Playwright Chromium on a controlled local fixture; `playwright-axe-scanner.test.ts` passed 5 scanner-target tests. No remote target or staging credentials were used.
- `pnpm lint`: passed for the configured web lint task; no API lint script is configured.
- `pnpm build`: passed, 4 Turbo tasks and 21 Next static pages. Turbo emitted its no-output warning for the Visual Agent overlay `tsc --noEmit` build task; the task and overall build succeeded.
- `pnpm db:validate`: passed with disposable process-local PostgreSQL URL placeholders. It made no database connection and applied no migrations.
- Built `.next/static` scan: no server-only credential variable names found. `.env.example` Resend setting is blank; `.env` was not manually opened or edited. Next loaded it during the normal local build without printing values.
- `git diff --check`: passed with Git LF-to-CRLF working-copy notices.

No `prisma migrate status`, live PostgreSQL/RLS query, backup, Vercel/Render dashboard inspection, dependency audit, staging API/website request, external Gemini/Jira/Resend/Redis request, migration, or deployment was performed. The Jira OAuth RLS migration is reported unapplied; live status of all other post-base migrations is NOT VERIFIED. Dependency audit is NOT VERIFIED (endpoint remains approval-gated). Local Playwright success is not Render Chromium/runtime verification. E2E, staging, production, monitoring, rollback execution, and live integration statuses remain NOT VERIFIED.
