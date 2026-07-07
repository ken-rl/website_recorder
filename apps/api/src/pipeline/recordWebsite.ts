import fs from "node:fs/promises";
import path from "node:path";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
} from "playwright";
import { dismissCookieBanners } from "../browser/cookies.js";
import { detectScrollMode } from "../browser/detectScrollMode.js";
import { gotoReachablePage } from "../browser/goto.js";
import { hydrateLazyContent } from "../browser/hydrate.js";
import { primeLazyAssets } from "../browser/prime.js";
import { resolveScrollCurve } from "../browser/curves.js";
import { runScroll } from "../browser/scroll.js";
import { sanitizeDom } from "../browser/sanitize.js";
import { ensureOnTargetUrl } from "../browser/urlGuard.js";
import {
  launchArgsForHeadless,
  resolveBrowserLaunch,
  shouldWarnHeadlessVirtualCapture,
} from "../config/browserLaunch.js";
import { resolveRecordingProfile } from "../config/recordingProfile.js";
import { removeFileIfExists, transcodeToMp4 } from "../transcode/ffmpeg.js";
import { FrameRecorder } from "../capture/frameRecorder.js";
import { stitchFramesToVideo } from "../capture/stitchFrames.js";
import type {
  AnimationConfig,
  RecordRequest,
  RecordResult,
  ResolvedScrollStrategy,
} from "../types.js";

const DEFAULT_FRAMERATE = 30;

interface CaptureSessionResult {
  rawVideoPath: string;
  scrollStrategy: ResolvedScrollStrategy;
}

export async function recordWebsite(
  request: RecordRequest,
  outputRoot: string,
  jobId?: string,
): Promise<RecordResult> {
  const resolvedJobId = jobId ?? createJobId(request.targetUrl);
  const outputDir = path.resolve(outputRoot, resolvedJobId);
  await fs.mkdir(outputDir, { recursive: true });

  const viewport = request.videoConfig.viewport;
  const profile = resolveRecordingProfile(request);
  const { pixelsPerFrame, preRecordingDelayMs, encode, hydrateFast } = profile;
  const deviceScaleFactor = encode.deviceScaleFactor;
  const framerate = request.videoConfig.framerate ?? DEFAULT_FRAMERATE;
  const animation = request.animationConfig ?? {};
  const pauseTriggers = animation.pauseTriggers ?? [];
  const scrollCurve = resolveScrollCurve(animation.scrollCurve);
  const removeOverlays = animation.removeOverlayElements ?? true;
  const captureMode = animation.captureMode ?? "export";

  console.log(`Capture mode: ${captureMode}`);

  const startedAt = Date.now();
  const launch = resolveBrowserLaunch(animation);
  const contextOptions = buildContextOptions(viewport, deviceScaleFactor);

  const storageState = await runPrepSession({
    request,
    animation,
    contextOptions,
    removeOverlays,
    hydrateFast,
  });

  let captureHeadless = launch.headless;
  let capture: CaptureSessionResult | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (!captureHeadless) {
      console.log("Using headed Chromium for smooth virtual-scroll capture.");
    }

    capture = await runRecordSession({
      request,
      outputDir,
      animation,
      viewport,
      pixelsPerFrame,
      preRecordingDelayMs,
      pauseTriggers,
      scrollCurve,
      removeOverlays,
      storageState,
      headless: captureHeadless,
      launchArgs: launchArgsForHeadless(captureHeadless),
      deviceScaleFactor,
      framerate,
      captureMode,
    });

    const shouldRetryHeaded =
      attempt === 0 &&
      captureHeadless &&
      capture.scrollStrategy === "virtual" &&
      (animation.scrollMode ?? "auto") === "auto";

    if (!shouldRetryHeaded) {
      break;
    }

    console.log(
      "Virtual scroll detected during headless capture; retrying with headed browser.",
    );
    captureHeadless = false;
  }

  if (!capture?.rawVideoPath) {
    throw new Error("Playwright did not produce a recorded video file");
  }

  const mp4Path = path.join(outputDir, "output.mp4");
  const targetWidth = viewport.width * deviceScaleFactor;
  const targetHeight = viewport.height * deviceScaleFactor;

  await transcodeToMp4(
    capture.rawVideoPath,
    mp4Path,
    framerate,
    targetWidth,
    targetHeight,
    encode,
  );
  await removeFileIfExists(capture.rawVideoPath);

  const captureWarning = shouldWarnHeadlessVirtualCapture(
    capture.scrollStrategy,
    captureHeadless,
  );
  if (captureWarning) {
    console.warn(captureWarning);
  }

  return {
    jobId: resolvedJobId,
    outputDir,
    rawVideoPath: capture.rawVideoPath,
    mp4Path,
    durationMs: Date.now() - startedAt,
    viewport: {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor,
    },
    scrollStrategy: capture.scrollStrategy,
  };
}

async function runPrepSession(options: {
  request: RecordRequest;
  animation: AnimationConfig;
  contextOptions: BrowserContextOptions;
  removeOverlays: boolean;
  hydrateFast: boolean;
}) {
  const { request, animation, contextOptions, removeOverlays, hydrateFast } =
    options;

  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({
      headless: true,
      args: launchArgsForHeadless(true),
    });

    const prepContext = await browser.newContext(contextOptions);
    const prepPage = await prepContext.newPage();
    await prepPage.addInitScript("window.__name = (target) => target");

    await gotoReachablePage(prepPage, request.targetUrl);
    await prepPage.evaluate("window.__name = (target) => target");
    await dismissCookieBanners(prepPage);
    await sanitizeDom(prepPage, removeOverlays);

    const expectedScrollMode = await detectScrollMode(
      prepPage,
      animation.scrollMode,
    );
    const hydrateUsesWheel =
      expectedScrollMode === "virtual" || animation.scrollMode === "virtual";

    try {
      await hydrateLazyContent(prepPage, contextOptions.viewport!.height!, {
        fast: hydrateFast,
        useWheel: hydrateUsesWheel,
      });
    } catch (error) {
      console.warn(
        "Lazy-content hydration failed; continuing with current page state.",
        error,
      );
    }

    await ensureOnTargetUrl(prepPage, request.targetUrl);
    await prepPage.evaluate(() =>
      window.scrollTo({ top: 0, left: 0, behavior: "instant" }),
    );
    await prepPage.waitForTimeout(300);

    const storageState = await prepContext.storageState();
    await prepContext.close();
    return storageState;
  } finally {
    await browser?.close();
  }
}

async function runRecordSession(options: {
  request: RecordRequest;
  outputDir: string;
  animation: AnimationConfig;
  viewport: RecordRequest["videoConfig"]["viewport"];
  pixelsPerFrame: number;
  preRecordingDelayMs: number;
  pauseTriggers: AnimationConfig["pauseTriggers"];
  scrollCurve: ReturnType<typeof resolveScrollCurve>;
  removeOverlays: boolean;
  storageState: Awaited<ReturnType<BrowserContext["storageState"]>>;
  headless: boolean;
  launchArgs: string[];
  deviceScaleFactor: number;
  framerate: number;
  captureMode: "preview" | "export";
}): Promise<CaptureSessionResult> {
  const {
    request,
    outputDir,
    animation,
    viewport,
    pixelsPerFrame,
    preRecordingDelayMs,
    pauseTriggers,
    scrollCurve,
    removeOverlays,
    storageState,
    headless,
    launchArgs,
    deviceScaleFactor,
    framerate,
    captureMode,
  } = options;

  let browser: Browser | null = null;
  let rawVideoPath = "";
  let scrollStrategy: ResolvedScrollStrategy = "document";

  if (captureMode === "preview") {
    // Fast mode: Use Playwright's recordVideo
    return recordWithPlaywrightVideo({
      request,
      outputDir,
      animation,
      viewport,
      pixelsPerFrame,
      preRecordingDelayMs,
      pauseTriggers,
      scrollCurve,
      removeOverlays,
      storageState,
      headless,
      launchArgs,
      deviceScaleFactor,
      framerate,
    });
  }

  // Export mode: Screenshot-based frame capture for high quality
  const framesDir = path.join(outputDir, ".frames");
  const scaledViewport = {
    width: viewport.width * deviceScaleFactor,
    height: viewport.height * deviceScaleFactor,
  };
  const recordContextOptions = buildContextOptions(scaledViewport, 1);

  try {
    await fs.mkdir(framesDir, { recursive: true });

    const recordLaunchArgs = launchArgs.filter(
      (arg) => !arg.startsWith("--force-device-scale-factor"),
    );
    browser = await chromium.launch({ headless, args: recordLaunchArgs });

    const frameRecorder = new FrameRecorder({
      outputDir: framesDir,
      fps: framerate,
      scaleFactor: deviceScaleFactor,
      qualityJpeg: 95,
      parallelWorkers: 3,
    });

    const recordContext = await browser.newContext({
      ...recordContextOptions,
      storageState,
    });
    const page = await recordContext.newPage();
    await page.addInitScript("window.__name = (target) => target");

    try {
      await gotoReachablePage(page, request.targetUrl);
      await ensureOnTargetUrl(page, request.targetUrl);
      await page.evaluate("window.__name = (target) => target");
      await dismissCookieBanners(page);
      await sanitizeDom(page, removeOverlays);
      await primeLazyAssets(page);

      await page.evaluate(() =>
        window.scrollTo({ top: 0, left: 0, behavior: "instant" }),
      );
      await ensureOnTargetUrl(page, request.targetUrl);
      await page.waitForTimeout(preRecordingDelayMs);
      scrollStrategy = await runScroll(page, {
        pixelsPerFrame,
        pauseTriggers: pauseTriggers ?? [],
        bezier: scrollCurve,
        scrollMode: animation.scrollMode,
        animationConfig: animation,
        viewportWidth: scaledViewport.width,
        viewportHeight: scaledViewport.height,
        fastMode: animation.fastMode ?? false,
        frameRecorder,
      });
      console.log(`Scroll strategy: ${scrollStrategy}`);
      await page.waitForTimeout(500);
    } finally {
      await page.close();
      await recordContext.close();

      // Stitch frames into video (already captured at scaled resolution)
      const tempRawVideoPath = path.join(outputDir, "raw_frames.mp4");
      await stitchFramesToVideo(framesDir, tempRawVideoPath, framerate, {
        preset: "fast",
      });
      rawVideoPath = tempRawVideoPath;
    }
  } finally {
    await browser?.close();
    // Clean up frames directory
    await fs.rm(framesDir, { recursive: true, force: true });
  }

  return { rawVideoPath, scrollStrategy };
}

async function recordWithPlaywrightVideo(options: {
  request: RecordRequest;
  outputDir: string;
  animation: AnimationConfig;
  viewport: RecordRequest["videoConfig"]["viewport"];
  pixelsPerFrame: number;
  preRecordingDelayMs: number;
  pauseTriggers: AnimationConfig["pauseTriggers"];
  scrollCurve: ReturnType<typeof resolveScrollCurve>;
  removeOverlays: boolean;
  storageState: Awaited<ReturnType<BrowserContext["storageState"]>>;
  headless: boolean;
  launchArgs: string[];
  deviceScaleFactor: number;
  framerate: number;
}): Promise<CaptureSessionResult> {
  const {
    request,
    outputDir,
    animation,
    viewport,
    pixelsPerFrame,
    preRecordingDelayMs,
    pauseTriggers,
    scrollCurve,
    removeOverlays,
    storageState,
    headless,
    launchArgs,
    deviceScaleFactor,
    framerate,
  } = options;

  let browser: Browser | null = null;
  let rawVideoPath = "";
  let scrollStrategy: ResolvedScrollStrategy = "document";
  const recordContextOptions = buildContextOptions(viewport, 1);

  try {
    browser = await chromium.launch({ headless, args: launchArgs });

    const recordContext = await browser.newContext({
      ...recordContextOptions,
      storageState,
      recordVideo: {
        dir: outputDir,
        size: {
          width: viewport.width,
          height: viewport.height,
        },
      },
    });
    const page = await recordContext.newPage();
    await page.addInitScript("window.__name = (target) => target");

    try {
      await gotoReachablePage(page, request.targetUrl);
      await ensureOnTargetUrl(page, request.targetUrl);
      await page.evaluate("window.__name = (target) => target");
      await dismissCookieBanners(page);
      await sanitizeDom(page, removeOverlays);
      await primeLazyAssets(page);

      await page.evaluate(() =>
        window.scrollTo({ top: 0, left: 0, behavior: "instant" }),
      );
      await ensureOnTargetUrl(page, request.targetUrl);
      await page.waitForTimeout(preRecordingDelayMs);
      scrollStrategy = await runScroll(page, {
        pixelsPerFrame,
        pauseTriggers: pauseTriggers ?? [],
        bezier: scrollCurve,
        scrollMode: animation.scrollMode,
        animationConfig: animation,
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
        fastMode: animation.fastMode ?? false,
      });
      console.log(`Scroll strategy: ${scrollStrategy}`);
      await page.waitForTimeout(500);
    } finally {
      const video = page.video();
      await page.close();
      await recordContext.close();
      rawVideoPath = video ? await video.path() : "";
    }
  } finally {
    await browser?.close();
  }

  return { rawVideoPath, scrollStrategy };
}

function buildContextOptions(
  viewport: RecordRequest["videoConfig"]["viewport"],
  deviceScaleFactor: number,
): BrowserContextOptions {
  const isMobileViewport =
    viewport.width < viewport.height && viewport.width <= 500;

  return {
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor,
    isMobile: isMobileViewport,
    hasTouch: isMobileViewport,
    userAgent: isMobileViewport
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1"
      : undefined,
  };
}

function createJobId(targetUrl: string) {
  const host = new URL(targetUrl).hostname.replace(/^www\./, "");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${host}-${stamp}`;
}
