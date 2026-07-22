# deio

Create polished smooth-scroll recordings of live websites, from a local web app or the command line.

```bash
npx deio-scroll setup
npx deio-scroll
```

Record directly with the default slow, linear motion:

```bash
npx deio-scroll example.com
npx deio-scroll https://example.com --curve ease-in-out --fast
npx deio-scroll https://example.com --quality high --viewport 1920x1080
```

Run `npx deio-scroll` inside a web project with a `dev` or `start` script to
start and record it automatically. Use `npx deio-scroll serve` to explicitly
open the Deio web app instead.

Deio requires Node.js 20+ and ffmpeg. `npx deio-scroll setup` installs Playwright Chromium and checks whether ffmpeg is available.

Run `npx deio-scroll --help` for all commands and options.

Source and full documentation: https://github.com/ken-rl/website_recorder
