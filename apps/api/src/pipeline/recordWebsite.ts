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
import { createMediaClockSync, installMediaClock } from "../browser/mediaClock.js";
import { stitchFramesToVideo } from "../capture/stitchFrames.js";
import { renderRecordingStyle, SOURCE_FILENAME } from "./styleRecording.js";
import type {
  AnimationConfig,
  RecordRequest,
  RecordResult,
  ResolvedScrollStrategy,
  ResolvedMotionPlan,
} from "../types.js";
import { DEFAULT_DIRECTED_START_HOLD_MS } from "../types.js";

const DEFAULT_FRAMERATE = 30;

interface CaptureSessionResult {
  rawVideoPath: string;
  scrollStrategy: ResolvedScrollStrategy;
  isMp4?: boolean;
  mediaDurationMs: number;
  motionPlan: ResolvedMotionPlan;
}

export interface RecordingRuntime {
  signal?: AbortSignal;
  onProgress?: (event: { stage: "preparing" | "capturing" | "encoding" | "styling" | "finalizing"; percent: number; message: string }) => void | Promise<void>;
}

export async function recordWebsite(
  request: RecordRequest,
  outputRoot: string,
  jobId?: string,
  runtime: RecordingRuntime = {},
): Promise<RecordResult> {
  runtime.signal?.throwIfAborted();
  await runtime.onProgress?.({ stage: "preparing", percent: 2, message: "Launching Chromium and preparing the page" });
  validateDirectionMode(request.animationConfig);
  const resolvedJobId = jobId ?? createJobId(request.targetUrl);
  const outputDir = path.resolve(outputRoot, resolvedJobId);
  await fs.mkdir(outputDir, { recursive: true });

  const viewport = request.videoConfig.viewport;
  const profile = resolveRecordingProfile(request);
  const { pixelsPerFrame, preRecordingDelayMs, encode, hydrateFast } = profile;
  const deviceScaleFactor = encode.deviceScaleFactor;
  const outputFramerate = request.videoConfig.framerate ?? DEFAULT_FRAMERATE;
  const animation = request.animationConfig ?? {};
  const pauseTriggers = animation.pauseTriggers ?? [];
  const scrollCurve = resolveScrollCurve(animation.scrollCurve);
  const removeOverlays = animation.removeOverlayElements ?? true;
  const captureMode = animation.captureMode ?? "export";

  // For export mode: each screenshot corresponds to one scroll step.
  // To play the scroll animation at the correct real-time speed, we must
  // stitch the frames at the target output framerate.
  const captureFps = outputFramerate;

  console.log(`Capture mode: ${captureMode}, pixelsPerFrame: ${pixelsPerFrame}, captureFps: ${captureFps}`);


  const startedAt = Date.now();
  const launch = resolveBrowserLaunch(animation);
  const contextOptions = buildContextOptions(viewport, deviceScaleFactor);

  const storageState = await runPrepSession({
    request,
    animation,
    contextOptions,
    removeOverlays,
    hydrateFast,
    signal: runtime.signal,
  });
  runtime.signal?.throwIfAborted();
  await runtime.onProgress?.({ stage: "capturing", percent: 15, message: "Capturing the directed scroll" });

  let captureHeadless = launch.headless;
  let capture: CaptureSessionResult | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (!captureHeadless) {
      console.log("Using headed Chromium for smooth GPU-assisted capture.");
    }

    // Use the resolved headless setting (runs headed when DISPLAY is present to leverage
    // the stable hardware GPU driver, and headless on CI/servers without display).
    const runHeadless = captureHeadless;

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
      headless: runHeadless,
      launchArgs: launchArgsForHeadless(runHeadless),
      deviceScaleFactor,
      framerate: outputFramerate,
      captureFps,
      captureMode,
      runtime,
    });

    const shouldRetryHeaded =
      attempt === 0 &&
      captureHeadless &&
      capture.scrollStrategy === "virtual" &&
      (animation.scrollMode ?? "auto") === "auto" &&
      // Export mode uses frame-by-frame screenshots which work fine headless.
      // Only retry headed for preview mode where Playwright recordVideo needs
      // real GPU rendering for smooth WebGL captures.
      captureMode === "preview";


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

  runtime.signal?.throwIfAborted();
  await runtime.onProgress?.({ stage: "encoding", percent: 82, message: "Encoding the source video" });

  const sourcePath = path.join(outputDir, SOURCE_FILENAME);
  const mp4Path = path.join(outputDir, "output.mp4");
  const targetWidth = viewport.width * deviceScaleFactor;
  const targetHeight = viewport.height * deviceScaleFactor;

  if (capture.isMp4) {
    await fs.rename(capture.rawVideoPath, sourcePath);
  } else {
    await transcodeToMp4(
      capture.rawVideoPath,
      sourcePath,
      outputFramerate,
      targetWidth,
      targetHeight,
      encode,
    );
    await removeFileIfExists(capture.rawVideoPath);
  }

  runtime.signal?.throwIfAborted();
  await runtime.onProgress?.({ stage: "styling", percent: 91, message: "Applying the recording canvas" });
  await renderRecordingStyle({
    sourcePath,
    outputPath: mp4Path,
    backgroundPreset: request.backgroundPreset,
    addShadow: request.addShadow,
    roundedCorners: request.roundedCorners,
  });
  runtime.signal?.throwIfAborted();
  await runtime.onProgress?.({ stage: "finalizing", percent: 97, message: "Finalizing recording metadata" });

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
    rawVideoPath: sourcePath,
    mp4Path,
    durationMs: capture.mediaDurationMs,
    renderTimeMs: Date.now() - startedAt,
    viewport: {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor,
    },
    scrollStrategy: capture.scrollStrategy,
    motionPlan: capture.motionPlan,
  };
}

function validateDirectionMode(animation?: AnimationConfig) {
  if (!animation?.direction) return;
  const legacyFields = [
    animation.durationMs,
    animation.heroHoldMs,
    animation.pauseTriggers,
    animation.scrollCurve,
  ];
  if (legacyFields.some((value) => value !== undefined)) {
    throw new Error(
      "animationConfig.direction cannot be combined with durationMs, heroHoldMs, pauseTriggers, or scrollCurve",
    );
  }
  if (animation.direction.beats.length < 1 || animation.direction.beats.length > 12) {
    throw new Error("animationConfig.direction must contain between 1 and 12 beats");
  }
  const totalDurationMs =
    (animation.direction.startHoldMs ?? DEFAULT_DIRECTED_START_HOLD_MS) +
    animation.direction.beats.reduce(
      (total, beat) => total + beat.transitionMs + (beat.holdMs ?? 0),
      0,
    );
  if (totalDurationMs > 300_000) {
    throw new Error("The directed recording timeline cannot exceed 300000ms");
  }
}

async function runPrepSession(options: {
  request: RecordRequest;
  animation: AnimationConfig;
  contextOptions: BrowserContextOptions;
  removeOverlays: boolean;
  hydrateFast: boolean;
  signal?: AbortSignal;
}) {
  const { request, animation, contextOptions, removeOverlays, hydrateFast, signal } =
    options;

  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({
      headless: true,
      args: launchArgsForHeadless(true),
    });
    const abort = () => void browser?.close().catch(() => undefined);
    signal?.addEventListener("abort", abort, { once: true });

    const prepContext = await browser.newContext(contextOptions);
    const prepPage = await prepContext.newPage();

    await gotoReachablePage(prepPage, request.targetUrl);
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
    signal?.removeEventListener("abort", abort);
    signal?.throwIfAborted();
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
  captureFps: number;
  captureMode: "preview" | "export";
  runtime: RecordingRuntime;
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
    captureFps,
    captureMode,
    runtime,
  } = options;

  const profile = resolveRecordingProfile(request);
  const { encode } = profile;

  let browser: Browser | null = null;
  let rawVideoPath = "";
  let scrollStrategy: ResolvedScrollStrategy = "document";
  let motionPlan: ResolvedMotionPlan | null = null;
  let mediaDurationMs = 0;

  // For standard and cinematic tiers, we return to the offline screenshot capture mode.
  // We optimize it by writing all frames to a RAM disk (/dev/shm) when available.
  const usePlaywrightVideo = false;

  if (usePlaywrightVideo) {
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
  // Use the logical viewport + deviceScaleFactor (not a physically scaled viewport at scale 1).
  // Playwright's page.screenshot() honours deviceScaleFactor and returns physical-resolution images.
  let framesDir = path.join(outputDir, ".frames");
  let isRamDisk = false;
  try {
    await fs.access("/dev/shm", fs.constants.W_OK);
    const jobId = path.basename(outputDir);
    framesDir = path.join("/dev/shm", `websiterecorder-${jobId}`);
    isRamDisk = true;
  } catch {
    // Fallback to SSD
  }

  const recordContextOptions = buildContextOptions(viewport, deviceScaleFactor);

  try {
    await fs.mkdir(framesDir, { recursive: true });

    const recordLaunchArgs = launchArgs.filter(
      (arg) => !arg.startsWith("--force-device-scale-factor"),
    );
    browser = await chromium.launch({ headless, args: recordLaunchArgs });
    const abort = () => void browser?.close().catch(() => undefined);
    runtime.signal?.addEventListener("abort", abort, { once: true });

    const frameRecorder = new FrameRecorder({
      outputDir: framesDir,
      fps: captureFps,
      scaleFactor: deviceScaleFactor,
      qualityJpeg: 95,
      // Sequential captures only: parallel workers can race scroll position vs paint.
      parallelWorkers: 1,
    });

    const recordContext = await browser.newContext({
      ...recordContextOptions,
      storageState,
    });
    const page = await recordContext.newPage();
    await installMediaClock(page);
    let captureCompleted = false;

    try {
      await gotoReachablePage(page, request.targetUrl);
      await ensureOnTargetUrl(page, request.targetUrl);
      await dismissCookieBanners(page);
      await sanitizeDom(page, removeOverlays);
      await primeLazyAssets(page);

      frameRecorder.setBeforeCapture(await createMediaClockSync(page, captureFps));

      await page.evaluate(() =>
        window.scrollTo({ top: 0, left: 0, behavior: "instant" }),
      );
      await ensureOnTargetUrl(page, request.targetUrl);
      await page.waitForTimeout(preRecordingDelayMs);

      const scrollResult = await runScroll(page, {
        pixelsPerFrame,
        pauseTriggers: pauseTriggers ?? [],
        bezier: scrollCurve,
        scrollMode: animation.scrollMode,
        animationConfig: animation,
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
        fastMode: animation.fastMode ?? false,
        frameRecorder,
        signal: runtime.signal,
        onProgress: (completed, total) => runtime.onProgress?.({
          stage: "capturing",
          percent: 15 + (completed / Math.max(1, total)) * 55,
          message: `Capturing frame ${completed} of ${total}`,
        }),
      });
      scrollStrategy = scrollResult.scrollStrategy;
      motionPlan = scrollResult.motionPlan;
      mediaDurationMs = scrollResult.motionPlan.durationMs;
      console.log(`Scroll strategy: ${scrollStrategy}`);

      if (scrollResult.frames) {
        const metadataPath = path.join(outputDir, "frames-metadata.json");
        await fs.writeFile(
          metadataPath,
          JSON.stringify(
            {
              scrollStrategy: scrollResult.scrollStrategy,
              maxScroll: scrollResult.maxScroll,
              frames: scrollResult.frames,
              deviceScaleFactor,
              viewport,
              motionPlan: scrollResult.motionPlan,
            },
            null,
            2,
          ),
        );
      }
      await page.waitForTimeout(500);
      captureCompleted = true;
    } finally {
      await page.close().catch(() => undefined);
      await recordContext.close().catch(() => undefined);

      // Do not let FFmpeg's "no files found" error mask the real browser or
      // capture failure. Encoding only belongs to a completed capture.
      if (captureCompleted) {
        const capturedFrames = frameRecorder.getFrameCount();
        if (capturedFrames < 1) {
          throw new Error("Capture completed without producing any frames");
        }
        await fs.access(path.join(framesDir, "frame-000000.jpg"));

        const tempRawVideoPath = path.join(outputDir, "raw_frames.mp4");
        runtime.signal?.throwIfAborted();
        await runtime.onProgress?.({ stage: "encoding", percent: 72, message: `Stitching ${capturedFrames} captured frames` });
        await stitchFramesToVideo(framesDir, tempRawVideoPath, captureFps, {
          width: viewport.width * deviceScaleFactor,
          height: viewport.height * deviceScaleFactor,
          preset: encode.preset,
          crf: encode.crf,
          signal: runtime.signal,
        });
        rawVideoPath = tempRawVideoPath;
      }
    }
  } finally {
    await browser?.close();
    // Clean up frames directory if it was in RAM disk or if captureMode is preview.
    // Completed recordings retain only their MP4 artifacts.
    if (isRamDisk || (captureMode as string) === "preview") {
      await fs.rm(framesDir, { recursive: true, force: true }).catch(() => undefined);
    }
    runtime.signal?.throwIfAborted();
  }

  if (!motionPlan) throw new Error("Recording did not produce a motion plan");
  return { rawVideoPath, scrollStrategy, isMp4: true, mediaDurationMs, motionPlan };
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
  let motionPlan: ResolvedMotionPlan | null = null;

  const recordLaunchArgs = [
    ...launchArgs.filter((arg) => !arg.startsWith("--force-device-scale-factor")),
    "--force-device-scale-factor=1",
  ];
  const recordContextOptions = buildContextOptions(viewport, 1);

  try {
    browser = await chromium.launch({ headless, args: recordLaunchArgs });

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

    try {
      await gotoReachablePage(page, request.targetUrl);
      await ensureOnTargetUrl(page, request.targetUrl);
      await dismissCookieBanners(page);
      await sanitizeDom(page, removeOverlays);
      await primeLazyAssets(page);

      await page.evaluate(() =>
        window.scrollTo({ top: 0, left: 0, behavior: "instant" }),
      );
      await ensureOnTargetUrl(page, request.targetUrl);
      await page.waitForTimeout(preRecordingDelayMs);
      const scrollResult = await runScroll(page, {
        pixelsPerFrame,
        pauseTriggers: pauseTriggers ?? [],
        bezier: scrollCurve,
        scrollMode: animation.scrollMode,
        animationConfig: animation,
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
        fastMode: animation.fastMode ?? false,
      });
      scrollStrategy = scrollResult.scrollStrategy;
      motionPlan = scrollResult.motionPlan;
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

  if (!motionPlan) throw new Error("Recording did not produce a motion plan");
  return {
    rawVideoPath,
    scrollStrategy,
    mediaDurationMs: motionPlan.durationMs,
    motionPlan,
  };
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
