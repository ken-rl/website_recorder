# Deio Scroll MCP

Use Deio Scroll locally from Codex to inspect a website, direct section-level
motion, and create an MP4.

## Install in Codex CLI

From this repository root:

```bash
codex mcp add deio-scroll -- pnpm --dir "$(pwd)" --filter deio-scroll-mcp start
```

Restart Codex after adding the server. The server uses `OUTPUT_DIR` (or
`./outputs`) and supports public websites and localhost development URLs.

Always ask the AI to inspect before recording. Inspection reports whether the
page uses document or virtual scrolling, pairs each storyboard image with a
usable target, and returns semantic selectors plus guarded interaction
candidates for normal pages.

Example prompt:

> Inspect https://linear.app. Create a draft that holds the hero for 1.2 seconds,
> eases into the first major section over 2.5 seconds, holds it for 1 second,
> then moves through the remaining sections deliberately and finishes at the
> bottom. Show me the applied motion plan and local MP4 path.

Interactive prompt:

> Inspect https://linear.app and create a 20-second draft with one continuous
> smooth scroll. Use two safe interaction candidates returned by inspection.
> Ease into each target, pause, zoom in gently, move the visible cursor to it,
> show its hover or local control state, then zoom out and continue scrolling.

Interactive beats use the candidate's `recommendedTarget`, at least its
`recommendedHoldMs`, and its complete `recommendedInteraction` object. Only
change `action` when the new action is returned for that exact candidate. The
semantic candidate ID, label, and role let the recorder recover safely if a
dynamic site changes the original DOM selector between inspection and capture.
All targets are preflighted before frame capture, and separate controls are
never merged merely because they share a scroll position. Links, forms,
destructive labels, popup navigation, downloads, and top-level navigation are
not eligible for click interactions. Component interactions are intentionally
unavailable for virtual-scroll pages.

For document pages, use selector targets for held sections and reserve normalized
progress for non-held fly-through waypoints. Inspection includes safe viewport
insets and a recommended transition duration for every semantic section. For
virtual-scroll pages, use the progress targets returned by the storyboard.

Each beat accepts `transitionMs`, a curve, and an optional `holdMs`. Deio Scroll
automatically merges redundant targets, replaces harsh curves at hold boundaries,
and stretches transitions that exceed 1.5 viewport heights per second. The
resolved `motionPlan.adjustments` array explains every correction.

Unless the user names more sections, use at most two section holds. Do not add a
separate page-end beat when the previous target is already near the bottom.

The legacy `pace`, `curve`, `heroHoldMs`, `durationMs`, and `pauses` controls
remain available when `direction` is omitted. Do not mix the two direction
models in one request.
