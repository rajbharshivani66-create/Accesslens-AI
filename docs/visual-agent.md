# Visual Agent Notes

Phase 15 expands the existing package at `devtools/visual-agent-overlay`; the app-shell loader remains the only application entry point. It is optional developer tooling, dynamically loaded only when `NODE_ENV=development` and `NEXT_PUBLIC_VISUAL_AGENT_ENABLED=true`.

## Architecture and behavior

- The overlay package owns its React UI, event listeners, Shadow DOM-isolated styles, selector/context helpers, and local JSON prompt export. It has no backend endpoint, Gemini credential, database model, filesystem writer, shell executor, or source-code patch applier. The app-shell loader reports a failed dynamic import and offers a retry.
- The floating panel can be opened/minimized/closed, dragged with a pointer, and moved with arrow keys from its Move control. `Alt+Shift+V` toggles the panel. Selecting is opt-in; pointer/click handlers are installed only while selection mode is active and Escape cancels it.
- Hover uses a pointer-transparent outline and click selects one page element. The overlay subtree is excluded from selection.
- Captured context is bounded to semantic tag/role/name, a tag-only selector and short parent chain, allowlisted attributes/classes, a small computed-style allowlist, dimensions, a safe route hint, viewport, and optional `data-component` marker. Values, text nodes, cookies, request headers, query strings, URL fragments, arbitrary attributes, and arbitrary CSS properties are omitted. Dynamic route segments, emails, URLs, bearer credentials, API keys, other credential-like strings, and long number sequences are redacted.
- The instruction field builds a JSON handoff prompt locally. Page metadata is explicitly labeled untrusted. The prompt tells the coding agent to inspect the workspace, propose a plan/diff, avoid secrets and arbitrary command execution, and wait for developer approval before editing. The developer can review/copy the prompt or download a JSON file.

## Antigravity handoff and source edits

Google documents an [Antigravity VS Code extension](https://antigravity.google/docs/extensions) and [custom MCP servers](https://antigravity.google/docs/mcp). No documented browser API for sending content directly into the VS Code agent panel was found. This implementation uses manual prompt handoff to the supported extension, and does not claim an MCP bridge or automatic source integration. In Antigravity, inspect the relevant project files, review the generated plan/diff, and explicitly approve the edit. Verify the changed page in the browser afterward. The overlay itself never writes project files or modifies only the live DOM as if it had changed source.

## Activation and production behavior

At the repository root, set `NEXT_PUBLIC_VISUAL_AGENT_ENABLED=true` in the local `.env` and restart `pnpm dev`. Keep it unset or `false` by default. No API or database credentials are required. `apps/web/next.config.mjs` aliases the package to an empty component in production builds; `NODE_ENV` is also checked by the client loader. Production exclusion must be verified from the generated bundle after changes to this setup.

## Tests and limitations

The package tests context sanitization (including bearer/API key patterns), form/private-value omission, safe prompt construction, untrusted-page-data handling, and overlay self-exclusion. There is no React component-test harness in this package, so Shadow DOM interactions, pointer dragging, toolbar accessibility, actual browser selection, and clipboard download require manual browser checks. The source editing step is performed by the coding agent only after developer review, outside the overlay.

The existing `pnpm remove` script is a preview-only removal helper; it has not been run.
