# Changelog

## Unreleased - Phase 17 UI and accessibility polish - 2026-11-07

- Added keyboard focus containment, Escape dismissal, initial close-button focus, and return-focus behavior for the Findings detail dialog.
- Added concise screen-reader labels and visible data summaries for Dashboard and Analytics charts.
- Removed nested `<main>` landmarks from authenticated pages; the shared AppShell remains the single main landmark.
- Added a visible keyboard focus indicator to select controls and honored reduced-motion preferences for smooth scrolling, transitions, and animations.
- No routes, APIs, database models, or migrations changed. Automated checks and browser/manual verification status are recorded in `docs/testing.md`; no WCAG conformance claim is made.

## Unreleased - Phase 15 Visual Agent overlay - 2026-11-07

- Extended the existing development-only overlay with draggable/keyboard-positionable controls, minimize/reopen shortcut, element details, safe context inspection, clear selection, prompt review, clipboard copy, and JSON export.
- Added bounded accessible role/name, parent hierarchy, allowlisted attributes and computed styles, geometry, optional `data-component` marker, and a route hint with dynamic segments redacted. Page/form content, input values, cookies, tokens, query strings, and fragments remain excluded.
- Hardened the prompt boundary for untrusted captured metadata and require a reviewed diff/explicit approval before an Antigravity agent edits source. No file writer, shell execution, Gemini call, or automatic source change was added.
- Documented the supported manual Antigravity VS Code extension workflow. No documented browser-to-agent dispatch interface was found; handoff remains copy/export.
- Added focused privacy, prompt, allowlist, and self-exclusion tests. Added the existing ReactDOM workspace dependency to the overlay for Shadow DOM rendering; no database schema change.
- Verification: overlay TypeScript build and web/API typechecks passed; full suite passed (20 files, 112 tests); lint passed; monorepo build passed (4 tasks, 21 Next pages); production output scan found no overlay markers. Pointer/clipboard browser interaction remains manually unverified because no component harness is installed.

## Unreleased - Phase 14 Jira Cloud integration - 2026-11-07

- Completed authenticated Jira status, issue detail/create, and disconnect routes while retaining the existing OAuth/site/project APIs and legacy aliases.
- Added explicit Jira destination selection, issue status/last-sync display, and Finding detail create/link controls. AI remediation is included only after an explicit developer-review acknowledgement.
- Jira issue descriptions now include bounded accessibility context, WCAG information, AI explanation when present, and a same-origin page URL stripped of query/fragment; captured snippets and failure summaries are omitted.
- Added owner-scoped issue reads/disconnect, callback IP limiting, graceful DELETED/INACCESSIBLE synchronization outcomes, activity logging, and transient refresh-error handling that preserves credentials.
- Added `JiraIssue.lastSyncedAt` with additive migration `20261107230000_jira_issue_sync` (not applied). Focused Jira tests: 9 passed; workspace typecheck passed. Live Jira OAuth/API verification was not run.

## Unreleased - Phase 12 Gemini accessibility assistant - 2026-11-07

- Replaced the raw Gemini HTTP adapter with Google's official `@google/genai` SDK and server-side Interactions API using `GEMINI_MODEL` and optional server-only `GEMINI_API_KEY`.
- Added authenticated `POST /api/ai/explain` and `POST /api/ai/fix-suggestions`, preserving the legacy finding AI route. Both use current project/team write authorization, bounded Zod input, API cost limiting, safe structured output validation, and transactional persistence/activity logging.
- Extended existing AI explanation and fix records with root cause, WCAG explanation, manual test instructions, and separate HTML/JSX suggestions through additive migration `20261107220000_gemini_accessibility_assistant` (not applied).
- Connected Findings and AI Fixes pages with AI review warnings, loading/error/retry messaging, remediation/test details, and copy controls. Generated suggestions are never executed or applied automatically.
- Local mocked-SDK checks only; no live Gemini verification, database migration, or deployment was run.

## Unreleased — Phase 13 verification follow-up — 2026-11-07

- Calculate score deltas from only the targeted page in both baseline and verification scans, and fail closed when the target URL cannot be normalized. Add repository-level regression-persistence and worker-failure tests.

## Unreleased — API security and scanner foundation

- Added Helmet response security headers and fail-closed, shared Redis rate-limit behavior with bounded startup retries.
- Added a durable PostgreSQL scan queue, authorized worker claim/retry/status routes, and axe-core finding persistence.
- Added Playwright Chromium scanning with public-IP validation, an egress-restricting HTTP proxy pinned to validated addresses, same-origin redirects, method restrictions, and page/request/byte/concurrency limits.
- Added the scanner page with project selection, queued/running/completed status polling, scan history, and initial finding summaries.
- Added paginated finding list/detail APIs with project/scan/severity/status/WCAG/search filters, authorized status updates, and team-scoped assignment.
- Added allow-listed finding sorting by finding date, severity, status, and axe rule ID, with ascending/descending order in the Findings UI and API.
- Added a findings workflow page with accessible loading/empty/error states, sanitized finding context, axe rule guidance, and an explicit manual-review caveat; RESOLVED remains reserved for verification evidence.
- Added verification rescans for the affected path, persisted run history, same-rule/page comparison, and resolved/remaining/regressed outcomes. RESOLVED status updates require the latest completed verification to report the target rule absent.
- Added backend Gemini Interactions API assistance with structured explanations, WCAG context, validated HTML/JSX suggestions, and a connected review UI. Provider credentials remain optional and generated code is never executed or applied automatically.
- Added Jira Cloud OAuth 2.0 connection with hashed one-time state, site/project selection, encrypted rotating tokens, permission-checked issue creation, retained references on disconnect, and on-demand issue-status synchronization.
- Completed the development-only Visual Agent toolbar with UI element selection, sanitized context, and copyable structured source-change prompts; production webpack resolves the package to an empty stub.
- Local checks pass; the scanner migration has not been applied to staging or production, and no live website or staging scan was run.

## v1.3.0 — Team management and role-based access

- Added database-backed team CRUD, membership management, and OWNER/ADMIN/DEVELOPER/VIEWER authorization enforced by the API.
- Added expiring, single-use invitations with cryptographically random tokens, SHA-256 token-hash storage, confirmed-email matching, revocation, and fragment-based invite links.
- Added team-aware project listing and dashboard aggregates. Team membership, not original project ownership, controls access to team-assigned projects.
- Added project write restrictions for viewers and role-specific member/team/invitation controls.
- Added team management UI and optional team assignment when creating projects; project detail controls reflect server-provided capabilities.
- Added the `20261105200000_team_management` migration for the DEVELOPER role rename and `TeamInvitation` table; all repository migrations are currently applied to confirmed staging, not production.
- Added API authorization tests for team isolation, invitation security/lifecycle, role behavior, and team/project CRUD paths.
- Added optional Resend invitation email delivery with server-only configuration and persisted NOT_CONFIGURED/PENDING/ACCEPTED/FAILED status; manual links remain usable when delivery is disabled or fails.
- Added API startup environment validation and a pre-deployment migration verification checklist.
- Read-only connectivity to the configured Supabase Auth endpoint and PostgreSQL URLs was verified. After user confirmation of disposable staging, verified backup, and explicit approval, all three migrations were applied there; migration status and read-only Prisma repository queries/catalog checks passed. Real-user authentication, populated-record RBAC, Resend delivery, browser workflows, and production migration remain unverified.
- Final local verification on 2026-11-07 passed with the signature-verified pinned pnpm 9.15.0: Prisma schema validation, typecheck, 16 tests, lint, build, and `git diff --check`. Live Auth, populated-record RBAC, authenticated browser workflows, and Resend delivery remain blocked/not verified; see `docs/testing.md`.
- Added backend rate limiting with configurable tiers, Redis-backed shared production storage, explicit trusted-proxy CIDRs, standard rate-limit headers, and automated enforcement/reset tests. Production startup now requires `RATE_LIMIT_REDIS_URL`. Final suite: 4 files, 24 tests passed; live Redis multi-instance behavior remains unverified.

## v1.2.0 — Database-backed dashboard foundation

- Added the authenticated `/api/dashboard/summary` endpoint with validated 7/30/90-day ranges and owner-scoped project, scan, finding, severity, recent scan, project performance, activity, and trend data.
- Replaced the project-count-only dashboard with real metric cards, date-filtered scan/finding charts, severity distribution, project performance, recent scans, and recent activity.
- Documented that persisted scan scores are automated metrics and not evidence of WCAG compliance; absent scan/activity records remain clearly empty.
- Added Scan `(projectId, startedAt)` and `(projectId, completedAt)` indexes to support dashboard trends and latest-score aggregation.
- Added API tests for dashboard authentication, profile scoping, default range, and invalid range handling.
- Live PostgreSQL query execution and migration application remain unverified without Supabase credentials.

## v1.1.0 — Supabase, Prisma, authentication, and application foundation

- Added Supabase Auth registration, login, logout, email confirmation callback, forgot-password, reset-password, and protected app routes.
- Added Supabase PostgreSQL connection configuration, Prisma client lifecycle helpers, typed enums/models, and an initial migration with RLS policies.
- Added bearer-token verification, authenticated profile initialization/update, and owner-scoped project CRUD with pagination and URL validation.
- Replaced demo dashboard/project records with authenticated API data and explicit empty/loading/error states.
- Added responsive application navigation and clearly marked not-yet-implemented feature pages.
- Added accessible toast notifications for successful profile and project changes.
- Added API authorization and profile/project CRUD tests.
- Documented environment setup, Auth callback configuration, database migrations, API behavior, RLS boundaries, verification, and known limitations.
- Live Supabase Auth, database connectivity, and migration execution remain unverified until real project credentials are configured.

## v1.0.0 — Initial monorepo foundation

- Created the pnpm/Turborepo workspace, Next.js frontend, Express API, Prisma schema, shared package, and isolated Visual Agent scaffold.
- Added deployment examples, initial documentation, and the Visual Agent removal preview.
- Verified the initial build before beginning v1.1.0.

## Unreleased - Phases 8-9

- Added authenticated persistent notification inbox/read APIs and account activity history for completed scans and verifications.
- Added project-authorized, capped CSV/PDF finding reports; CSV formula prefixes are neutralized.

- Added authenticated database-backed analytics with UTC date ranges, per-project filtering, severity and WCAG-version summaries, and responsive scan/finding trends; existing secure CSV/PDF exports remain available.
- Improved retry/error recovery for profile and project settings reads; identity and unsupported preference controls remain read-only/unavailable.
- Extended the existing Playwright/axe worker with persisted per-page title/URL/status/timing/pass results, scan pass totals and duration, hard page execution deadlines, stricter path validation, and root-level authenticated scan create/list APIs.
- Kept existing Playwright and axe-core pinned dependencies; added the unapplied `20261107160000_scan_page_results` migration for per-page result metadata.

## Unreleased - Phase 15 Visual Agent hardening

- Isolated the development overlay in Shadow DOM, added a retryable loader failure state, and expanded credential redaction for bearer tokens and API/client secrets. Manual Antigravity prompt handoff and developer-reviewed source changes remain the only verified workflow.

## Unreleased - Phase 16 security audit

- Added a default-deny RLS migration for user-scoped Jira OAuth state and temporary encrypted OAuth tokens, plus a migration guard test. Migration remains unapplied pending database-owner approval.
- Completed local security-focused regression checks; npm dependency audit and live provider/staging verification remain blocked or unverified. See `docs/security.md` and `docs/testing.md`.
