# ACCESSLENS VISUAL AGENT

The AccessLens Visual Agent is a development-only overlay that sits above the app and helps product teams select frontend elements, inspect their metadata, and generate AI-coded change prompts for a supported coding agent.

## Design goals
- Independent package, not a production dependency
- Disabled by default through the VISUAL_AGENT_ENABLED flag
- Separate from the core AccessLens business logic
- Safe removal via scripts/remove-visual-agent.js

## Supported behavior
- Hover outline and click-to-select elements
- Structured context generation for element selection
- Exportable prompt payload for Antigravity-style agent workflows
- Fallback local bridge mechanism when direct integration is unavailable

## Remove safely
```bash
pnpm remove
```

The script previews the intended changes and warns before any destructive action is taken.
