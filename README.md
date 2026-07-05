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
pnpm start
```

Open [http://localhost:3847](http://localhost:3847), enter a URL, and hit **Record**.

## Usage

### Web UI

```bash
pnpm start
```

Visit [http://localhost:3847](http://localhost:3847). Enter a URL, choose viewport size and quality, then record. The finished video plays inline with a download link.

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
| `animationConfig.preRecordingDelayMs` | Pause at the top before scrolling (default: 2000) |
| `animationConfig.removeOverlayElements` | Strip cookie banners, modals, and popups (default: true) |
| `animationConfig.pauseTriggers` | Pause when a selector enters the viewport |

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
| `pnpm start` | Start the web server |
| `pnpm record <config.json>` | Record via CLI |
| `pnpm typecheck` | Run TypeScript checks |

## Security note

The server loads arbitrary URLs in a headless browser. Do not expose it publicly without authentication or network restrictions. Only record sites you have permission to capture.

## License

[MIT](LICENSE) © [ken-rl](https://github.com/ken-rl)
