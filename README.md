# Deio Scroll

<p align="center">
  <img src="assets/deio-scroll-mark.svg" alt="Deio Scroll logo" width="180" />
</p>

<p align="center">
  <strong>Auto smooth-scroll recordings of live websites.</strong><br />
  Paste a URL. Get a polished scroll demo MP4.
</p>

<p align="center">
  <img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-blue.svg" />
  <img alt="Node.js" src="https://img.shields.io/badge/node-%3E%3D20-brightgreen" />
</p>

Deio Scroll loads a page with Playwright, hydrates lazy content, runs a controlled scroll (eased document scroll or virtual wheel), and exports H.264 MP4. Optional canvas framing — backgrounds, soft bottom shadow, rounded corners — makes clips ready for product pages, launch posts, and demos.

Product identity, palette, and logo usage are documented in [BRAND.md](BRAND.md).

## Features

- **Automatic smooth scroll** — frame-timed scroll with easing, not a hand-held screen record
- **Document + virtual capture** — normal pages and fixed-viewport / WebGL scroll sites
- **Motion control** — curve presets + visual bezier handles, speed slider, hero hold
- **Pause triggers** — hold when a CSS selector first enters the viewport (document scroll)
- **Quality tiers** — Draft, Standard, and Cinematic for iteration through final export
- **Canvas framing** — backgrounds, drop shadow, rounded corners; re-style without re-recording
- **Overlay cleanup** — strips cookie banners, modals, and popups by default
- **Analyze + direct** — inspect a page, review storyboard frames, and time section-level motion before rendering
- **Side-by-side comparisons** — capture two URLs with one shared viewport and synchronized timeline, then export a labeled comparison MP4
- **Durable capture jobs** — real pipeline progress, cancellation, retry, refresh recovery, and a local recording library
- **Web UI, CLI, and HTTP API**

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

`pnpm dev` starts the API with an embedded capture worker plus Vite. Job state
is durable in SQLite. A future hosted deployment can set `EMBEDDED_WORKER=0`
and run `pnpm dev:worker` independently.

The root development command supervises both services and stops both on one
Ctrl-C. The API runs without filesystem watch mode by default, and Vite uses
polling to remain reliable on Linux systems with editors or MCP sessions that
already consume many inotify watchers. Use `pnpm dev:api:watch` only when API
hot reload is needed.

Enter a URL, choose screen size and quality, then **Start capture**. Deio Scroll handles the scroll and encode.

## Usage

### Codex MCP director

Use the recorder as a local MCP server so Codex can inspect a page, choose scroll
pace and curves, add section pauses, and create an MP4:

```bash
codex mcp add deio-scroll -- pnpm --dir "$(pwd)" --filter deio-scroll-mcp start
```

Restart Codex after adding the server. See [the MCP package guide](apps/mcp/README.md)
for an example prompt and behavior details.

### Web UI

```bash
pnpm dev          # API with embedded worker + Vite
# or
pnpm dev:api      # API with embedded worker (serves built/public UI on :3847)
pnpm dev:api:watch # API with source-file hot reload
pnpm dev:worker   # external worker; use with EMBEDDED_WORKER=0
pnpm dev:web      # Vite frontend only
```

**Capture workflow**

1. Paste a website URL, pick a viewport, and choose **Analyze page**.
2. Review the storyboard and detected sections, then adjust movement and hold timing.
3. Choose **Draft**, **Standard**, or **Cinematic** and start the capture.
4. Follow real capture/encode progress; cancel safely or leave and return later.
5. Preview, download, or restyle the result. Reopen it later from **Library**.

Use **Quick capture** to skip analysis and use the global motion controls.

Left nav: Capture (collapsible brand sidebar).

**Comparison workflow**

1. Open **Compare** and paste the two landing-page URLs.
2. Name each side, then choose the shared viewport, quality, and timeline.
3. Select **Create comparison**. Deio captures each page sequentially for stable
   local performance, aligns both recordings, and holds the shorter ending frame.
4. Preview or download the combined MP4. Comparisons remain available in
   **Library** and can be retried or duplicated like regular captures.

### CLI

```bash
pnpm --filter deio-scroll-api record apps/api/config.example.json
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

### Asynchronous jobs

The web UI uses durable asynchronous jobs. `POST /api/jobs` accepts the same
body as `POST /record` and immediately returns a job id, status URL, and SSE URL.

```http
POST /api/jobs
GET /api/jobs
GET /api/jobs/<jobId>
GET /api/jobs/<jobId>/events
POST /api/jobs/<jobId>/cancel
POST /api/jobs/<jobId>/retry
DELETE /api/jobs/<jobId>
```

Inspect a page before building directed motion with `POST /api/inspect`:

```json
{
  "targetUrl": "https://example.com",
  "viewport": { "width": 1440, "height": 900 }
}
```

Job state, leases, artifact metadata, and usage events are stored in
`outputs/scrollizard.sqlite3` (the legacy filename is retained so existing local
libraries migrate without intervention). `outputs/<jobId>/job.json` remains a compatibility
snapshot. Existing job manifests and MP4-only output folders are imported
automatically into SQLite.

For local use, the API embeds a worker that claims jobs immediately. With
`EMBEDDED_WORKER=0`, the API becomes enqueue-only and a separately runnable
worker claims each job with a renewable SQLite lease, reports progress, and
safely requeues interrupted work after a stale lease expires. CLI and MCP
commands also keep an embedded worker for single-command use.

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

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `PORT` | `3847` | HTTP server port |
| `HOST` | `127.0.0.1` | Bind address; set `0.0.0.0` only on a trusted network |
| `OUTPUT_DIR` | `./outputs` | Directory for recordings |
| `EMBEDDED_WORKER` | `1` | Keep local startup self-contained; set `0` when running an external worker |
| `RECORD_HEADED` | auto | `1` force headed Chromium; `0` force headless |
| `WORKER_ID` | generated | Stable label for a capture worker |
| `ALLOW_LOCALHOST_TARGETS` | `1` | Allow localhost capture during local development; set `0` when hosted |
| `ALLOW_PRIVATE_TARGETS` | `0` | Allow RFC1918/private targets; keep disabled for hosted use |
| `MAX_JOB_RUNTIME_MS` | `900000` | Hard capture-worker runtime limit |
| `MAX_OUTPUT_BYTES` | `1073741824` | Maximum completed MP4 size |
| `SOURCE_RETENTION_DAYS` | disabled | Delete restylable source MP4s older than this many days |
| `OUTPUT_RETENTION_DAYS` | disabled | Delete completed jobs and artifacts older than this many days |

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

Some sites lock the document to one viewport (WebGL, scroll-scrubbing, infinite loops). With `scrollMode: "auto"`, Deio Scroll detects this and switches to **virtual scroll** (wheel input over time). Force with `"virtual"` or `"document"`.

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

1. **Enqueue** — validate the request and persist it to SQLite.
2. **Lease** — a capture worker atomically claims the next queued job.
3. **Prep** — enforce the network policy, wait out temporary scroll-intro locks, dismiss banners, sanitize overlays, and hydrate lazy assets.
4. **Capture** — scroll the page (or inject wheel events) while recording frames / video.
5. **Encode** — stitch / transcode to H.264 MP4 and register local artifacts and usage.
6. **Optional style** — composite onto a background with shadow and corner radius (`POST /style`).

## Project structure

```
apps/
  api/                 Playwright capture pipeline, HTTP API, CLI
    src/
      api/server.ts
      worker.ts        leased capture worker
      artifacts/       local storage adapter (S3-ready boundary)
      browser/         scroll, hydration, network policy, virtual scroll
      capture/         frame recorder
      jobs/            SQLite repository, leases, recovery, retention
      pipeline/        record + style orchestration
      transcode/       ffmpeg
    public/            built web assets + deio-scroll-mark.svg
  web/                 React + Vite UI
    src/
      App.tsx
      components/      motion, canvas, pause triggers, preview player
    public/deio-scroll-mark.svg
assets/
  deio-scroll-mark.svg README / brand mark
outputs/               recorded videos (gitignored)
```

## Scripts

| Command | Description |
| ------- | ----------- |
| `pnpm dev` | API with embedded worker + Vite frontend |
| `pnpm dev:api` | API with embedded worker (port 3847) |
| `pnpm dev:api:watch` | API with source-file hot reload |
| `pnpm dev:worker` | External worker for `EMBEDDED_WORKER=0` mode |
| `pnpm dev:web` | Vite frontend only |
| `pnpm --filter deio-scroll-api record <config.json>` | CLI record |
| `pnpm typecheck` | Typecheck all packages |
| `pnpm --filter deio-scroll-api test` | API tests |

## Security note

The browser boundary blocks cloud metadata, private/link-local destinations, unsafe
redirects, and private subresource requests. Localhost remains enabled for local
development; set `ALLOW_LOCALHOST_TARGETS=0` before hosting. Authentication,
authorization, rate limits, and per-workspace quotas are still required before
binding the service publicly. Only record sites you have permission to capture.

## License

[MIT](LICENSE) © [ken-rl](https://github.com/ken-rl)
