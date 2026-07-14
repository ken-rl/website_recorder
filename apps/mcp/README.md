# Scrollizard MCP

Use Scrollizard locally from Codex to inspect a website, direct section-level
motion, and create an MP4.

## Install in Codex CLI

From this repository root:

```bash
codex mcp add scrollizard -- pnpm --dir "$(pwd)" --filter websiterecorder-mcp start
```

Restart Codex after adding the server. The server uses `OUTPUT_DIR` (or
`./outputs`) and supports public websites and localhost development URLs.

Always ask the AI to inspect before recording. Inspection reports whether the
page uses document or virtual scrolling, pairs each storyboard image with a
usable target, and returns semantic selectors for normal pages.

Example prompt:

> Inspect https://linear.app. Create a draft that holds the hero for 1.2 seconds,
> eases into the first major section over 2.5 seconds, holds it for 1 second,
> then moves through the remaining sections deliberately and finishes at the
> bottom. Show me the applied motion plan and local MP4 path.

For document pages, use selector targets for held sections and reserve normalized
progress for non-held fly-through waypoints. Inspection includes safe viewport
insets and a recommended transition duration for every semantic section. For
virtual-scroll pages, use the progress targets returned by the storyboard.

Each beat accepts `transitionMs`, a curve, and an optional `holdMs`. Scrollizard
automatically merges redundant targets, replaces harsh curves at hold boundaries,
and stretches transitions that exceed 1.5 viewport heights per second. The
resolved `motionPlan.adjustments` array explains every correction.

Unless the user names more sections, use at most two section holds. Do not add a
separate page-end beat when the previous target is already near the bottom.

The legacy `pace`, `curve`, `heroHoldMs`, `durationMs`, and `pauses` controls
remain available when `direction` is omitted. Do not mix the two direction
models in one request.
