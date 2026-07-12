# Website Recorder

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)

Record a polished scroll-through of any webpage as an MP4. Website Recorder loads the page with Playwright, hydrates lazy content, captures a controlled scroll (document or virtual wheel), and encodes H.264 video. Frame the result with backgrounds, rounded corners, and drop shadows.

## Features

- **Smooth scroll capture** — frame-by-frame document scroll or virtual wheel input for fixed-viewport / WebGL sites
- **Motion control** — easing curves (presets + visual bezier handles), scroll speed, hero hold
- **Pause triggers** — hold when a CSS selector first enters the viewport (document scroll)
- **Quality tiers** — Standard and Cinematic capture profiles in the UI (draft/fast available via API)
- **Canvas framing** — background presets, soft bottom shadow, rounded corners; re-style without re-recording
- **Overlay cleanup** — strips cookie banners, modals, and popups by default
- **Three interfaces** — web UI, CLI, and HTTP API

## Requirements

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/)
- [ffmpeg](https://ffmpeg.org/) on your `PATH`
- Playwright Chromium (installed during setup)

```bash
# Ubuntu / Debian
sudo apt install ffmpeg
```

## Quick start

```bash
git clone https://github.com/ken-rl/website_recorder.git
cd website_recorder
pnpm install
npx playwright install chromium
pnpm dev
```

- **API + static UI:** [http://localhost:3847](http://localhost:3847)
- **Vite frontend (hot reload):** URL printed by `pnpm dev:web` (proxies API to 3847)

Enter a URL, choose screen size and quality, then **Start capture**.

## Usage

### Web UI

```bash
pnpm dev          # API + Vite together
# or
pnpm dev:api      # API only (serves built/public UI on :3847)
pnpm dev:web      # Vite frontend only
```

**Recorder workflow**

1. Paste a website URL and pick a viewport (desktop / laptop / tablet / mobile).
2. Choose quality (**Standard** or **Cinematic**).
3. Optionally open **Motion**: easing curve, speed, hero hold, scroll mode, pause triggers.
4. Optionally pick a **Canvas** background, shadow, and rounded corners.
5. Start capture → preview plays inline → download MP4.
6. After capture, restyle the canvas and **Render style** without recording again.

The left nav switches between Recorder and Roadmap; collapse it for more workspace.

### CLI

```bash
pnpm --filter websiterecorder-api record apps/api/config.example.json
```

Videos are written under `OUTPUT_DIR` (default `./outputs/<job-id>/output.mp4`).

### API

**Health**

```http
GET /health
```

**Record**

```http
POST /record
Content-Type: application/json
```

```json
{
  "targetUrl": "https://example.com",
  "exportFormat": "mp4",
  "videoConfig": {
    "framerate": 60,
    "qualityPreset": "high",
    "viewport": {
      "width": 1920,
      "height": 1080,
      "deviceScaleFactor": 2
    }
  },
  "animationConfig": {
    "pixelsPerFrame": 16,
    "preRecordingDelayMs": 2000,
    "removeOverlayElements": true,
    "heroHoldMs": 1500,
    "scrollCurve": { "preset": "ease-in-out" },
    "scrollMode": "auto",
    "pauseTriggers": [
      { "selector": "footer", "durationMs": 1500 }
    ]
  },
  "backgroundPreset": "none",
  "addShadow": true,
  "roundedCorners": true
}
```

**Response**

```json
{
  "ok": true,
  "jobId": "example.com-2026-07-05T12-00-00-000Z",
  "videoUrl": "/outputs/example.com-2026-07-05T12-00-00-000Z/output.mp4",
  "sourceVideoUrl": "/outputs/example.com-2026-07-05T12-00-00-000Z/source.mp4",
  "durationMs": 18500,
  "viewport": { "width": 1920, "height": 1080, "deviceScaleFactor": 2 },
  "scrollStrategy": "document"
}
```

Download: `GET /outputs/<jobId>/output.mp4`.

**Restyle** an existing job (background / shadow / corners) without re-recording:

```http
POST /style
Content-Type: application/json
```

```json
{
  "jobId": "example.com-2026-07-05T12-00-00-000Z",
  "backgroundPreset": "paper_blue",
  "addShadow": true,
  "roundedCorners": true
}
```

## Configuration

Copy the API env example if present, or set variables in the shell:

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `PORT` | `3847` | HTTP server port |
| `OUTPUT_DIR` | `./outputs` | Directory for recordings |
| `RECORD_HEADED` | auto | `1` force headed Chromium; `0` force headless |

### Record request options

| Field | Description |
| ----- | ----------- |
| `targetUrl` | Page URL to record (required) |
| `videoConfig.framerate` | Capture / output FPS |
| `videoConfig.qualityPreset` | `high`, `medium`, or `low` |
| `videoConfig.viewport` | Width, height, optional `deviceScaleFactor` |
| `animationConfig.pixelsPerFrame` | Scroll speed (pixels per frame); higher = faster / shorter |
| `animationConfig.scrollCurve` | Easing preset or custom CSS cubic-bezier |
| `animationConfig.heroHoldMs` | Hold frames at the top before scrolling |
| `animationConfig.preRecordingDelayMs` | Delay after load before capture |
| `animationConfig.removeOverlayElements` | Strip cookie banners / modals (default `true`) |
| `animationConfig.pauseTriggers` | `[{ selector, durationMs }]` — document scroll only |
| `animationConfig.scrollMode` | `auto` (default), `document`, or `virtual` |
| `animationConfig.virtualScrollCycles` | Virtual mode: viewport-heights of wheel input |
| `animationConfig.virtualScrollDurationMs` | Virtual mode: fixed duration override (ms) |
| `animationConfig.fastMode` | Faster draft capture / encode |
| `animationConfig.captureMode` | `preview` or `export` |
| `backgroundPreset` | `none` or a built-in preset id |
| `addShadow` | Soft drop shadow under framed video |
| `roundedCorners` | Round the framed recording |

### Virtual scroll

Some sites lock the document to one viewport (WebGL, scroll-scrubbing, infinite loops). With `scrollMode: "auto"`, Website Recorder detects this and switches to **virtual scroll** (wheel input over time). Force with `"virtual"` or `"document"`.

```json
"animationConfig": {
  "scrollMode": "auto",
  "virtualScrollCycles": 12,
  "pixelsPerFrame": 16,
  "scrollCurve": { "preset": "linear" }
}
```

`pauseTriggers` apply to **document scroll only**.

Virtual captures prefer a **headed** Chromium window when possible (WebGL often throttles headless). Use `RECORD_HEADED=1` / `0` to force.

### Scroll curves

`pixelsPerFrame` sets overall duration; the curve shapes speed over the page.

**Presets:** `linear`, `ease-in`, `ease-out`, `ease-in-out`, `ease-in-cubic`, `ease-out-cubic`, `ease-in-out-cubic`

```json
"scrollCurve": {
  "preset": "custom",
  "bezier": [0.42, 0, 0.58, 1]
}
```

### Quality presets

| Preset | Typical use | Notes |
| ------ | ----------- | ----- |
| `high` | Cinematic export | Higher scale / cleaner encode |
| `medium` | Standard export | Balanced default |
| `low` | Drafts | Smaller / faster |

## How it works

1. **Prep** — navigate, dismiss banners, sanitize overlays, hydrate lazy assets.
2. **Capture** — scroll the page (or inject wheel events) while recording frames / video.
3. **Encode** — stitch / transcode to H.264 MP4.
4. **Optional style** — composite onto a background with shadow and corner radius (`POST /style`).

## Project structure

```
apps/
  api/                 Playwright capture pipeline, HTTP API, CLI
    src/
      api/server.ts
      browser/         scroll, hydrate, sanitize, virtual scroll
      capture/         frame recorder
      editor/          framing / style composite
      pipeline/        record + style orchestration
      transcode/       ffmpeg
    public/            built web assets served by the API
  web/                 React + Vite UI
    src/
      App.tsx
      components/      motion, canvas, pause triggers, preview player
docs/                  design notes, roadmap, production readiness
outputs/               recorded videos (gitignored)
```

## Scripts

| Command | Description |
| ------- | ----------- |
| `pnpm dev` | API + Vite frontend |
| `pnpm dev:api` | API only (port 3847) |
| `pnpm dev:web` | Vite frontend only |
| `pnpm --filter websiterecorder-api record <config.json>` | CLI record |
| `pnpm typecheck` | Typecheck all packages |
| `pnpm --filter websiterecorder-api test` | API tests |

## Security note

The server loads arbitrary URLs in a browser. Do not expose it publicly without authentication and network restrictions. Only record sites you have permission to capture.

## License

[MIT](LICENSE) © [ken-rl](https://github.com/ken-rl)
