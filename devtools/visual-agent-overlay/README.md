# AccessLens Visual Agent Overlay

The existing standalone workspace package adds a development-only floating toolbar to the authenticated web app. It helps developers inspect an element and prepare a structured coding request. It does not change the live DOM as a substitute for source edits, call an AI API, write project files, or run shell commands.

## Setup and activation

1. In the repository root `.env`, set `NEXT_PUBLIC_VISUAL_AGENT_ENABLED=true` for local development only.
2. Restart the web app with `pnpm dev` and open the local application.
3. The toolbar appears when `NODE_ENV=development` and the flag equals `true`.

No Gemini/Jira/API key is needed. Do not enable this overlay for a deployed environment. Production `next.config.mjs` replaces the package import with an empty component, and runtime activation checks development mode.

## Use it

1. Open the **Visual Agent · DEV** pill. Drag the Move control to reposition it; focus Move and use arrow keys for keyboard positioning. **Minimize** or **Close** collapses the panel; `Alt+Shift+V` toggles it.
2. Choose **Select UI element**. Hover shows an outline. Click one element to select it; press **Escape** to cancel. The toolbar never selects itself, and the page behaves normally while selection mode is off.
3. Review the semantic element data, selector/parents, safe attributes/classes, allowlisted computed styles, bounds, route hint, and viewport.
4. Enter a requested change and choose **Generate review prompt**. Review the JSON first, then copy it or export it as `accesslens-visual-agent-request.json`.
5. In the supported Antigravity VS Code extension, paste the prompt. Ask the agent to inspect the workspace and produce a plan/diff. Review the diff and approve file edits in the agent. Then reload the page and verify the source change in the browser.

## Antigravity integration status

Google documents Antigravity IDE extensions and custom MCP tool servers. This package does not use an undocumented extension API, private IDE endpoint, or custom MCP bridge. No documented browser-to-agent-panel dispatch mechanism was found, so handoff is manual prompt copy/export. Source modification is performed by the coding agent after developer approval—not by this overlay.

## Context and security

Selection context is local to the browser until the developer copies or exports it. The overlay excludes page text, password/form values, cookies, tokens, headers, query strings, fragments, and non-allowlisted attributes/styles. It sanitizes emails, URLs, credential-like strings, long numeric identifiers, and dynamic route segments. A `data-component` marker is included only when explicitly present. Captured page data is labeled untrusted in the JSON prompt.

The prompt instructs the agent to avoid secrets and shell execution, inspect source files, display a plan/diff, and wait for explicit approval before edits. The package itself contains no filesystem operations or generated-code execution. The downloaded prompt is a user-selected export and may contain the requested change text plus the sanitized context; review it before sharing.

## Validation

Run `pnpm --filter @accesslens-ai/visual-agent-overlay build` and `pnpm exec vitest run devtools/visual-agent-overlay/src/overlay.test.ts`. Current tests cover sanitizer behavior, context allowlists, private/form-value exclusion, prompt-injection boundary text, and overlay self-exclusion. There is no component-test harness; perform a manual browser check for drag, keyboard operation, selection, minimize/reopen, clipboard, and export.

Production bundles must be checked after building to confirm that development toolbar strings/code are absent. See `docs/visual-agent.md`, `docs/security.md`, and `docs/testing.md` for architecture, trust boundaries, and verification status.

## Remove safely

`pnpm remove` runs the repository's preview-only removal script. Review its output before taking any manual removal action; this task did not run it.
