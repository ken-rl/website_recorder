# Scrollizard MCP

Use Scrollizard locally from Codex to inspect a website, direct its scroll, and create an MP4.

## Install in Codex CLI

From this repository root:

```bash
codex mcp add scrollizard -- pnpm --dir "$(pwd)" --filter websiterecorder-mcp start
```

Restart Codex after adding the server. The server uses the local `OUTPUT_DIR` (or
`./outputs`) and supports both public websites and localhost development URLs.

Ask Codex to inspect the page before capture, for example: “Inspect
http://localhost:5173 and create a cinematic recording that lingers on the hero and
Features section.”

`inspect_website` returns screenshots and selector candidates. `create_recording`
accepts the AI's selected pace, curve, hero hold, and pause selectors, and returns a
local MP4 file link.
