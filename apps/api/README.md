# deio

Create polished smooth-scroll recordings of live websites, from a local web app or the command line.

```bash
npx deio-scroll
```

Record directly with the default slow, linear motion:

```bash
npx deio-scroll example.com
npx deio-scroll https://example.com --curve ease-in-out --fast
npx deio-scroll https://example.com --quality high --viewport 1920x1080
```

Run `npx deio-scroll` inside a web project with a `dev` or `start` script to
start it, detect internal routes, and choose pages from an interactive terminal
checklist. Each selected route becomes a separate MP4. Use explicit routes or
also produce a combined video with:

```bash
npx deio-scroll . --pages /,/features,/pricing
npx deio-scroll . --all-pages --combine
```

Routes are website paths, not source files such as `example.tsx`. Use
`npx deio-scroll serve` to explicitly open the Deio web app instead.

Deio requires Node.js 20+ and ffmpeg. Chromium is installed automatically on the first recording. Run `npx deio-scroll setup` only if you want to prepare it in advance and check ffmpeg.

Run `npx deio-scroll --help` for all commands and options.

Source and full documentation: https://github.com/ken-rl/website_recorder
