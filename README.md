# Deio Scroll

<p align="center">
  <img src="assets/deio-scroll-mark.svg" alt="Deio Scroll logo" width="160" />
</p>

<p align="center">
  Turn a live website into a smooth, polished MP4.
</p>

<p align="center">
  <a href="#cli">CLI</a> ·
  <a href="#web-app">Web app</a> ·
  <a href="apps/mcp/README.md">MCP (work in progress)</a>
</p>

Deio Scroll opens a website in Chromium, prepares lazy-loaded content, scrolls through the page with controlled motion, and exports an H.264 video. It works with regular documents as well as many virtual-scroll and WebGL sites.

## Quick start

You need Node.js 20 or newer and [FFmpeg](https://ffmpeg.org/) on your `PATH`.

```bash
npx deio-scroll
```

Chromium is installed automatically when you create your first recording.

To record a URL directly:

```bash
npx deio-scroll example.com
```

The finished MP4 is saved locally.

## CLI

Pass a URL and optionally choose the motion, quality, or viewport:

```bash
npx deio-scroll example.com
npx deio-scroll example.com --curve ease-in-out --fast
npx deio-scroll example.com --quality high --viewport 1920x1080
```

Deio Scroll can also start and record a local web project:

```bash
cd your-project
npx deio-scroll .
```

For a multi-page project:

```bash
npx deio-scroll . --pages /,/features,/pricing
npx deio-scroll . --all-pages --combine
```

Run `npx deio-scroll --help` for all available options.

## Web app

Open the local web interface:

```bash
npx deio-scroll serve
```

The web app lets you:

- Analyze a page before recording
- Adjust scroll speed, easing, pauses, and quality
- Create side-by-side website comparisons
- Record responsive desktop and mobile views
- Preview, restyle, download, retry, and manage recordings

Everything runs locally, and recordings remain on your machine.

## MCP (work in progress)

The experimental MCP server lets an AI agent inspect a website and direct a recording with section holds, cursor movement, zooms, and guarded interactions.

It works, but its interface and behavior are still being refined. Expect breaking changes.

See the [MCP guide](apps/mcp/README.md) for setup and usage.

## Development

```bash
git clone https://github.com/ken-rl/website_recorder.git
cd website_recorder
pnpm install
npx playwright install chromium
pnpm dev
```

The local API runs at [http://localhost:3847](http://localhost:3847). The Vite development URL is printed in the terminal.

Useful commands:

```bash
pnpm dev
pnpm typecheck
pnpm --filter deio-scroll test
pnpm --filter deio-scroll-mcp test
```

## Requirements

- Node.js 20 or newer
- pnpm for repository development
- FFmpeg on your `PATH`
- Playwright Chromium

## License

[MIT](LICENSE)
