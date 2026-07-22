#!/usr/bin/env node
import "dotenv/config";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { RecordingJobManager } from "./jobs/manager.js";
import type { RecordRequest, ScrollCurvePreset } from "./types.js";

const packageRequire = createRequire(import.meta.url);
const VERSION = (packageRequire("../package.json") as { version: string }).version;
const DEFAULT_PORT = 3847;
const CURVES = new Set<ScrollCurvePreset>([
  "linear",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "ease-in-cubic",
  "ease-out-cubic",
  "ease-in-out-cubic",
]);

type CliOptions = {
  command: "serve" | "record" | "setup" | "help" | "version";
  target?: string;
  curve: ScrollCurvePreset;
  speed: number;
  quality: "high" | "medium" | "low";
  viewport: { width: number; height: number };
  outputDir: string;
  port: number;
  host: string;
  open: boolean;
  configPath?: string;
  localCommand?: string;
  localUrl?: string;
};

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.command === "help") return printHelp();
  if (options.command === "version") return console.log(VERSION);
  if (options.command === "setup") return setup();
  if (options.command === "serve") {
    if (process.argv.length === 2 && await isRunnableLocalProject(process.cwd())) {
      return recordLocalProject(options);
    }
    return serve(options);
  }
  if (options.target === ".") return recordLocalProject(options);
  return record(options);
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    command: "serve",
    curve: "linear",
    speed: 0.5,
    quality: "medium",
    viewport: { width: 1440, height: 900 },
    outputDir: path.resolve("deio-output"),
    port: DEFAULT_PORT,
    host: "127.0.0.1",
    open: true,
  };

  const first = args[0];
  if (first === "--help" || first === "-h" || first === "help") {
    options.command = "help";
    return options;
  }
  if (first === "--version" || first === "-v" || first === "version") {
    options.command = "version";
    return options;
  }
  if (first === "setup") {
    options.command = "setup";
    return options;
  }

  let index = 0;
  if (first === "serve") {
    options.command = "serve";
    index++;
  } else if (first === "record") {
    options.command = "record";
    index++;
  } else if (first && !first.startsWith("-")) {
    options.command = "record";
    options.target = first;
    index++;
  }

  while (index < args.length) {
    const arg = args[index++];
    if (arg === "--no-open") options.open = false;
    else if (arg === "--open") options.open = true;
    else if (arg === "--curve") options.curve = parseCurve(requiredValue(args, index++, arg));
    else if (arg === "--speed") options.speed = positiveNumber(requiredValue(args, index++, arg), "speed");
    else if (arg === "--slow") options.speed = 0.5;
    else if (arg === "--normal") options.speed = 1;
    else if (arg === "--fast") options.speed = 2;
    else if (arg === "--quality") options.quality = parseQuality(requiredValue(args, index++, arg));
    else if (arg === "--viewport") options.viewport = parseViewport(requiredValue(args, index++, arg));
    else if (arg === "--output") options.outputDir = path.resolve(requiredValue(args, index++, arg));
    else if (arg === "--port") options.port = integer(requiredValue(args, index++, arg), "port", 1, 65_535);
    else if (arg === "--host") options.host = requiredValue(args, index++, arg);
    else if (arg === "--command") options.localCommand = requiredValue(args, index++, arg);
    else if (arg === "--local-url") options.localUrl = normalizeUrl(requiredValue(args, index++, arg));
    else if (arg === "--help" || arg === "-h") options.command = "help";
    else if (!arg.startsWith("-") && options.command === "record" && !options.target) options.target = arg;
    // Friendly shorthand: `deio <url> linear speed-1`.
    else if (CURVES.has(arg as ScrollCurvePreset)) options.curve = parseCurve(arg);
    else if (/^speed-/i.test(arg)) options.speed = positiveNumber(arg.slice(6), "speed");
    else throw new Error(`Unknown option: ${arg}. Run deio --help for usage.`);
  }

  if (options.command === "record" && options.target?.toLowerCase().endsWith(".json")) {
    options.configPath = options.target;
    options.target = undefined;
  }
  if (options.command === "record" && !options.target && !options.configPath) {
    throw new Error("Missing website URL. Run deio --help for usage.");
  }
  return options;
}

async function serve(options: CliOptions) {
  const localUrl = `http://${displayHost(options.host)}:${options.port}`;
  if (await isRunningDeio(localUrl)) {
    console.log(`Deio is already running at ${localUrl}`);
    if (options.open) openBrowser(localUrl);
    return;
  }

  process.env.PORT = String(options.port);
  process.env.HOST = options.host;
  process.env.OUTPUT_DIR = options.outputDir;
  console.log(`Starting Deio at ${localUrl}`);
  if (options.open) {
    void waitUntilReady(localUrl).then(() => openBrowser(localUrl));
  }
  await import("./api/server.js");
}

async function recordLocalProject(options: CliOptions) {
  const projectDir = process.cwd();
  if (!await isRunnableLocalProject(projectDir) && !options.localCommand) {
    throw new Error("No runnable local project found. Add a package.json dev/start script or pass --command.");
  }

  const command = options.localCommand ?? await inferLocalCommand(projectDir);
  console.log(`Starting local project: ${command}`);
  const child = spawn(command, {
    cwd: projectDir,
    env: { ...process.env, BROWSER: "none" },
    shell: true,
    detached: process.platform !== "win32",
    stdio: ["inherit", "pipe", "pipe"],
  });

  let discoveredUrl = options.localUrl;
  const inspectOutput = (chunk: Buffer, stderr: boolean) => {
    (stderr ? process.stderr : process.stdout).write(chunk);
    const plain = chunk.toString().replace(/\x1b\[[0-9;]*m/g, "");
    const matches = plain.matchAll(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?/gi);
    for (const match of matches) discoveredUrl = match[0].replace("0.0.0.0", "127.0.0.1");
  };
  child.stdout?.on("data", (chunk: Buffer) => inspectOutput(chunk, false));
  child.stderr?.on("data", (chunk: Buffer) => inspectOutput(chunk, true));

  const stopProject = () => stopProcessTree(child.pid);
  process.once("exit", stopProject);
  try {
    const target = await waitForLocalProject(child, () => discoveredUrl);
    console.log(`Local project ready at ${target}`);
    options.command = "record";
    options.target = target;
    return await record(options);
  } finally {
    process.off("exit", stopProject);
    stopProject();
  }
}

async function isRunnableLocalProject(directory: string) {
  try {
    const pkg = JSON.parse(await fsPromises.readFile(path.join(directory, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    return Boolean(pkg.scripts?.dev || pkg.scripts?.start);
  } catch {
    return false;
  }
}

async function inferLocalCommand(directory: string) {
  const pkg = JSON.parse(await fsPromises.readFile(path.join(directory, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };
  const script = pkg.scripts?.dev ? "dev" : "start";
  if (fs.existsSync(path.join(directory, "pnpm-lock.yaml"))) return `pnpm run ${script}`;
  if (fs.existsSync(path.join(directory, "yarn.lock"))) return `yarn ${script}`;
  if (fs.existsSync(path.join(directory, "bun.lock")) || fs.existsSync(path.join(directory, "bun.lockb"))) return `bun run ${script}`;
  return `npm run ${script}`;
}

async function waitForLocalProject(
  child: ReturnType<typeof spawn>,
  discovered: () => string | undefined,
) {
  const commonUrls = [
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:4173",
    "http://127.0.0.1:8080",
    "http://127.0.0.1:8000",
  ];
  const startedAt = Date.now();
  while (Date.now() - startedAt < 90_000) {
    if (child.exitCode !== null) throw new Error(`Local project exited with code ${child.exitCode}.`);
    const candidates = [...new Set([discovered(), ...commonUrls].filter((url): url is string => Boolean(url)))];
    for (const url of candidates) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(500) });
        if (response.status < 500) return url;
      } catch {
        // The development server is still starting.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for the local project. Pass its URL with --local-url or start command with --command.");
}

function stopProcessTree(pid: number | undefined) {
  if (!pid) return;
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(pid), "/t", "/f"], { stdio: "ignore" });
    } else {
      process.kill(-pid, "SIGTERM");
    }
  } catch {
    // It may have already stopped.
  }
}

async function record(options: CliOptions) {
  await assertRuntimeReady();
  const request = options.configPath
    ? JSON.parse(await fsPromises.readFile(path.resolve(options.configPath), "utf8")) as RecordRequest
    : buildRequest(options);

  await fsPromises.mkdir(options.outputDir, { recursive: true });
  const manager = new RecordingJobManager(options.outputDir);
  await manager.initialize();
  const shutdown = () => void manager.shutdown().finally(() => process.exit(130));
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  try {
    console.log(`Recording ${request.targetUrl}`);
    console.log(`curve: ${request.animationConfig?.scrollCurve?.preset ?? "ease-in-out"} · speed: ${options.speed}x · quality: ${request.videoConfig.qualityPreset ?? "medium"}`);
    const queued = await manager.create(request);
    console.log(`job: ${queued.jobId}`);
    const job = await manager.waitForCompletion(queued.jobId);
    if (job.status !== "completed" || !job.result) {
      throw new Error(job.error?.message ?? `Recording ${job.status}`);
    }
    console.log("Recording complete");
    console.log(path.join(options.outputDir, job.jobId, "output.mp4"));
  } finally {
    await manager.shutdown();
  }
}

function buildRequest(options: CliOptions): RecordRequest {
  return {
    targetUrl: normalizeUrl(options.target!),
    exportFormat: "mp4",
    videoConfig: {
      framerate: options.quality === "low" ? 30 : 60,
      qualityPreset: options.quality,
      viewport: {
        ...options.viewport,
        deviceScaleFactor: options.quality === "high" ? 2 : 1,
      },
    },
    animationConfig: {
      pixelsPerFrame: 16 * options.speed,
      preRecordingDelayMs: options.quality === "low" ? 500 : 2_000,
      removeOverlayElements: true,
      heroHoldMs: 1_500,
      scrollCurve: { preset: options.curve },
      scrollMode: "auto",
      fastMode: options.quality === "low",
      captureMode: options.quality === "low" ? "preview" : "export",
    },
    backgroundPreset: "none",
    addShadow: false,
    roundedCorners: false,
  };
}

async function setup() {
  console.log("Installing Playwright Chromium…");
  const packageJson = packageRequire.resolve("playwright/package.json");
  const cli = path.join(path.dirname(packageJson), "cli.js");
  // Invoke through a tiny wrapper so Playwright does not mistake Deio's npx
  // installation for an unsupported global `npx playwright` invocation.
  const wrapper = "const cli=process.argv[1]; process.argv.splice(1,1,'playwright'); require(cli)";
  const result = spawnSync(process.execPath, ["-e", wrapper, cli, "install", "chromium"], { stdio: "inherit" });
  if (result.status !== 0) throw new Error("Chromium installation failed.");

  if (hasFfmpeg()) {
    console.log("ffmpeg: found");
  } else {
    console.warn("ffmpeg was not found on PATH. Install it with your system package manager:");
    console.warn("  Ubuntu/Debian: sudo apt install ffmpeg");
    console.warn("  macOS:         brew install ffmpeg");
    console.warn("  Windows:       winget install Gyan.FFmpeg");
  }
  console.log("Deio setup complete.");
}

async function assertRuntimeReady() {
  if (!hasFfmpeg()) throw new Error("ffmpeg was not found on PATH. Install ffmpeg, then run `npx deio-scroll setup`.");
  const { chromium } = await import("playwright");
  if (!fs.existsSync(chromium.executablePath())) {
    throw new Error("Playwright Chromium is not installed. Run `npx deio-scroll setup` first.");
  }
}

function hasFfmpeg() {
  return spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
}

function openBrowser(url: string) {
  let command: string;
  let args: string[];
  if (process.platform === "darwin") [command, args] = ["open", [url]];
  else if (process.platform === "win32") [command, args] = ["cmd", ["/c", "start", "", url]];
  else [command, args] = ["xdg-open", [url]];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.on("error", () => console.log(`Open ${url} in your browser.`));
  child.unref();
}

async function waitUntilReady(url: string) {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await isRunningDeio(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  console.log(`Open ${url} in your browser.`);
}

async function isRunningDeio(url: string) {
  try {
    const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(400) });
    const body = await response.json() as { ok?: boolean };
    return response.ok && body.ok === true;
  } catch {
    return false;
  }
}

function normalizeUrl(value: string) {
  const local = /^(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?(?:\/|$)/i.test(value);
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `${local ? "http" : "https"}://${value}`;
  try {
    return new URL(candidate).toString();
  } catch {
    throw new Error(`Invalid website URL: ${value}`);
  }
}

function parseCurve(value: string) {
  if (!CURVES.has(value as ScrollCurvePreset)) {
    throw new Error(`Invalid curve: ${value}. Choose ${[...CURVES].join(", ")}.`);
  }
  return value as ScrollCurvePreset;
}

function parseQuality(value: string) {
  if (value !== "high" && value !== "medium" && value !== "low") {
    throw new Error("Quality must be high, medium, or low.");
  }
  return value;
}

function parseViewport(value: string) {
  const match = value.match(/^(\d+)x(\d+)$/i);
  if (!match) throw new Error("Viewport must look like 1440x900.");
  return {
    width: integer(match[1], "viewport width", 320, 7680),
    height: integer(match[2], "viewport height", 240, 4320),
  };
}

function positiveNumber(value: string, name: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${name} must be greater than zero.`);
  return number;
}

function integer(value: string, name: string, min: number, max: number) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}.`);
  }
  return number;
}

function requiredValue(args: string[], index: number, option: string) {
  const value = args[index];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a value.`);
  return value;
}

function displayHost(host: string) {
  return host === "0.0.0.0" ? "127.0.0.1" : host;
}

function printHelp() {
  console.log(`Deio — smooth-scroll website recordings

Usage:
  deio                                      Record the current web project, or open the app
  deio serve [options]                      Open the local web app
  deio <website> [options]                  Record a website
  deio . [options]                          Start and record the current web project
  deio record <website|config.json> [options]
  deio setup                                Install Chromium and check ffmpeg

Recording options:
  --curve <preset>       Scroll curve (default: linear)
  --speed <multiplier>   Scroll speed multiplier (default: 0.5)
  --slow                 Use 0.5x speed
  --normal               Use 1x speed
  --fast                 Use 2x speed
  --quality <preset>     low, medium, or high (default: medium)
  --viewport <WxH>       Browser viewport (default: 1440x900)
  --output <directory>   Output root (default: ./deio-output)
  --command <command>    Local project's start command
  --local-url <url>      Local project's URL when it cannot be detected

Server options:
  --port <number>        Local port (default: 3847)
  --host <address>       Bind address (default: 127.0.0.1)
  --no-open              Do not open a browser

Examples:
  npx deio-scroll
  npx deio-scroll example.com
  npx deio-scroll example.com --curve ease-in-out --fast
  npx deio-scroll . --command "npm run preview"
  npx deio-scroll record https://example.com --quality high --viewport 1920x1080

The shorthand \`deio example.com linear speed-1\` is also accepted.`);
}

main().catch((error) => {
  console.error(`deio: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
