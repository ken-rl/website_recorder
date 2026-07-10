# Website Recorder

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)

Record a smooth scroll-through of any webpage as an MP4 video. Website Recorder uses Playwright to load a page, hydrate lazy content off-camera, then captures a smooth scroll animation and transcodes it to H.264.

## Features

- **Smooth scrolling** — `requestAnimationFrame`-driven scroll, not jerky native capture
- **Lazy-load hydration** — pre-scrolls the page before recording so images and content are ready
- **Full HD output** — records at the viewport resolution you choose (e.g. 1920×1080)
- **Overlay cleanup** — optionally strips cookie banners, modals, and popups
- **Pause triggers** — hold on specific elements as they enter the viewport
- **Three interfaces** — web UI, CLI, and HTTP API
- **Quality presets** — balance file size and sharpness with `high`, `medium`, or `low`

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
pnpm dev:api
```

Open [http://localhost:3847](http://localhost:3847), enter a URL, and hit **Record**.

## Usage

### Web UI

```bash
pnpm dev:api
```

Visit [http://localhost:3847](http://localhost:3847). Enter a URL, choose viewport size and quality, then record. The finished video plays inline with a download link.

For frontend development with Vite hot reload, run `pnpm dev` and open the Vite URL it prints (the API continues to run on port 3847).

### CLI

```bash
pnpm record config.example.json
```

Videos are saved to `./outputs/<job-id>/output.mp4`.

### API

**Health check**

```http
GET /health
```

**Record a page**

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
      "height": 1080
    }
  },
  "animationConfig": {
    "pixelsPerFrame": 4,
    "preRecordingDelayMs": 2000,
    "removeOverlayElements": true,
    "pauseTriggers": [
      { "selector": "footer", "durationMs": 1500 }
    ]
  }
}
```

**Response**

```json
{
  "ok": true,
  "jobId": "example.com-2026-07-05T12-00-00-000Z",
  "videoUrl": "/outputs/example.com-2026-07-05T12-00-00-000Z/output.mp4",
  "durationMs": 18500,
  "viewport": { "width": 1920, "height": 1080, "deviceScaleFactor": 2 }
}
```

Download the finished video at `GET /outputs/<jobId>/output.mp4`.

## Configuration

Copy `.env.example` to `.env` to customize settings:

```bash
cp .env.example .env
```

### Environment variables

| Variable     | Default     | Description              |
| ------------ | ----------- | ------------------------ |
| `PORT`       | `3847`      | HTTP server port         |
| `OUTPUT_DIR` | `./outputs` | Directory for recordings |

### Record request options

| Field | Description |
| ----- | ----------- |
| `targetUrl` | Page URL to record (required) |
| `videoConfig.framerate` | Output FPS (default: 30) |
| `videoConfig.qualityPreset` | `high`, `medium`, or `low` |
| `videoConfig.viewport` | Width, height, and optional `deviceScaleFactor` |
| `animationConfig.pixelsPerFrame` | Base scroll speed in pixels per animation frame (default: 4). Controls total duration; the curve shapes how that speed varies. |
| `animationConfig.scrollCurve` | Easing curve for scroll speed — preset name or custom CSS `cubic-bezier` |
| `animationConfig.fastMode` | Skip deep hydration, scroll faster, and use quick encoding (default: false) |
| `animationConfig.preRecordingDelayMs` | Pause at the top before scrolling (default: 2000) |
| `animationConfig.removeOverlayElements` | Strip cookie banners, modals, and popups (default: true) |
| `animationConfig.pauseTriggers` | Pause when a selector enters the viewport |
| `animationConfig.scrollMode` | `auto` (default), `document`, or `virtual` — see below |
| `animationConfig.virtualScrollCycles` | Virtual mode: viewport-heights of wheel input to replay (default: 12, or 5 in fast mode) |
| `animationConfig.virtualScrollDurationMs` | Virtual mode: fixed capture duration in ms (overrides cycle-based timing) |

### Virtual scroll (infinite / fixed-viewport sites)

Some sites — especially scroll-scrubbing, WebGL, or infinitely looping experiences — lock the document to one viewport (`overflow: hidden`, no page scroll). Website Recorder auto-detects this and switches to **virtual scroll**: it replays wheel input over a timed duration instead of calling `window.scrollTo()`.

Use `scrollMode: "virtual"` to force it, or leave `auto` to detect. Tune how much of the loop you capture with `virtualScrollCycles` (default 8 ≈ 10s of scroll). Virtual captures use a headed browser with real GPU for smooth WebGL video. For sites like [ui8.ai/forge](https://ui8.ai/forge/), use a **Linear** curve and 8–12 cycles.

```json
"animationConfig": {
  "scrollMode": "auto",
  "virtualScrollCycles": 16,
  "pixelsPerFrame": 4,
  "scrollCurve": { "preset": "linear" }
}
```

`pauseTriggers` apply to document scroll only.

Virtual-scroll captures use a **headed Chromium window** when possible. WebGL sites (e.g. ui8.ai) throttle their render loop to a few fps in headless mode, which makes video look choppy even when wheel input is fast. Set `RECORD_HEADED=1` to force headed capture, or `RECORD_HEADED=0` to force headless.

### Fast mode

Set `"fastMode": true` in `animationConfig` to prioritize speed over completeness:

- One hydration pass with shorter waits
- Faster scroll (`pixelsPerFrame` defaults to 12)
- Shorter pre-roll delay (500ms)
- Quick ffmpeg encode at 1× capture scale

Some below-fold lazy content may not load. Best for quick drafts or simple pages.

### Scroll curves

Control how scroll speed changes over the recording. `pixelsPerFrame` sets the overall duration; the curve redistributes that speed across the page.

**Presets:** `linear`, `ease-in`, `ease-out`, `ease-in-out`, `ease-in-cubic`, `ease-out-cubic`, `ease-in-out-cubic`

**Custom CSS bezier:**

```json
"scrollCurve": {
  "preset": "custom",
  "bezier": [0.42, 0, 0.58, 1]
}
```

### Quality presets

| Preset | Device scale | Encoding |
| ------ | ------------ | -------- |
| `high` | 2× | CRF 15, slow preset, Lanczos scaling |
| `medium` | 2× | CRF 20, medium preset |
| `low` | 1× | CRF 26, fast preset |

## How it works

1. **Prep phase** (not recorded) — navigates to the page, dismisses cookie banners, sanitizes the DOM, and scrolls through the page to hydrate lazy-loaded content.
2. **Record phase** — reloads the page with saved cookies, primes lazy assets, scrolls to the top, waits briefly, then performs a smooth scroll while Playwright captures video.
3. **Transcode** — ffmpeg converts the raw WebM to H.264 MP4 at the target viewport resolution.

## Project structure

```
src/
  api/server.ts              HTTP server and web UI
  cli.ts                     CLI entry point
  pipeline/recordWebsite.ts  Recording orchestration
  browser/                   Page prep (scroll, hydrate, cookies, sanitize)
  transcode/                 ffmpeg encoding and quality presets
public/
  index.html                 Web UI
outputs/                     Recorded videos (gitignored)
```

## Scripts

| Command | Description |
| ------- | ----------- |
| `pnpm dev:api` | Start the web server |
| `pnpm dev` | Start the API and Vite frontend together |
| `pnpm record <config.json>` | Record via CLI |
| `pnpm typecheck` | Run TypeScript checks |
| `pnpm --filter websiterecorder-api test` | Run API tests |

## Security note

The server loads arbitrary URLs in a headless browser. Do not expose it publicly without authentication or network restrictions. Only record sites you have permission to capture.

## License

[MIT](LICENSE) © [ken-rl](https://github.com/ken-rl)
