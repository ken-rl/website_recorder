import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { dismissCookieBanners } from "../browser/cookies.js";
import { gotoReachablePage } from "../browser/goto.js";
import { hydrateLazyContent } from "../browser/hydrate.js";
import { primeLazyAssets } from "../browser/prime.js";
import { resolveScrollCurve } from "../browser/curves.js";
import { runSmoothScroll } from "../browser/scroll.js";
import { sanitizeDom } from "../browser/sanitize.js";
import { removeFileIfExists, transcodeToMp4 } from "../transcode/ffmpeg.js";
import { resolveEncodeSettings } from "../transcode/quality.js";
import type { RecordRequest, RecordResult } from "../types.js";

const DEFAULT_PIXELS_PER_FRAME = 4;
const DEFAULT_PRE_RECORDING_DELAY_MS = 2000;
const DEFAULT_FRAMERATE = 30;

export async function recordWebsite(
  request: RecordRequest,
  outputRoot: string,
  jobId?: string,
): Promise<RecordResult> {
  const resolvedJobId = jobId ?? createJobId(request.targetUrl);
  const outputDir = path.resolve(outputRoot, resolvedJobId);
  await fs.mkdir(outputDir, { recursive: true });

  const viewport = request.videoConfig.viewport;
  const encode = resolveEncodeSettings(
    request.videoConfig.qualityPreset,
    viewport.deviceScaleFactor,
  );
  const deviceScaleFactor = encode.deviceScaleFactor;
  const framerate = request.videoConfig.framerate ?? DEFAULT_FRAMERATE;
  const animation = request.animationConfig ?? {};
  const pixelsPerFrame = animation.pixelsPerFrame ?? DEFAULT_PIXELS_PER_FRAME;
  const preRecordingDelayMs =
    animation.preRecordingDelayMs ?? DEFAULT_PRE_RECORDING_DELAY_MS;
  const pauseTriggers = animation.pauseTriggers ?? [];
  const scrollCurve = resolveScrollCurve(animation.scrollCurve);
  const removeOverlays = animation.removeOverlayElements ?? true;

  const startedAt = Date.now();
  const browser = await chromium.launch({ headless: true });
  const contextOptions = {
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor,
  };

  let rawVideoPath = "";

  try {
    const prepContext = await browser.newContext(contextOptions);
    const prepPage = await prepContext.newPage();
    await prepPage.addInitScript("window.__name = (target) => target");

    await gotoReachablePage(prepPage, request.targetUrl);
    await prepPage.evaluate("window.__name = (target) => target");
    await dismissCookieBanners(prepPage);
    await sanitizeDom(prepPage, removeOverlays);

    try {
      await hydrateLazyContent(prepPage, viewport.height);
    } catch (error) {
      console.warn(
        "Lazy-content hydration failed; continuing with current page state.",
        error,
      );
    }

    const storageState = await prepContext.storageState();
    const preparedUrl = prepPage.url();
    await prepContext.close();

    const recordContext = await browser.newContext({
      ...contextOptions,
      storageState,
      recordVideo: {
        dir: outputDir,
        size: { width: viewport.width, height: viewport.height },
      },
    });
    const page = await recordContext.newPage();
    await page.addInitScript("window.__name = (target) => target");

    try {
      await gotoReachablePage(page, preparedUrl);
      await page.evaluate("window.__name = (target) => target");
      await dismissCookieBanners(page);
      await sanitizeDom(page, removeOverlays);
      await primeLazyAssets(page);

      await page.evaluate(() =>
        window.scrollTo({ top: 0, left: 0, behavior: "instant" }),
      );
      await page.waitForTimeout(preRecordingDelayMs);
      await runSmoothScroll(page, pixelsPerFrame, pauseTriggers, scrollCurve);
      await page.waitForTimeout(500);
    } finally {
      const video = page.video();
      await page.close();
      await recordContext.close();
      rawVideoPath = video ? await video.path() : "";
    }
  } finally {
    await browser.close();
  }

  if (!rawVideoPath) {
    throw new Error("Playwright did not produce a recorded video file");
  }

  const mp4Path = path.join(outputDir, "output.mp4");
  await transcodeToMp4(
    rawVideoPath,
    mp4Path,
    framerate,
    viewport.width,
    viewport.height,
    encode,
  );
  await removeFileIfExists(rawVideoPath);

  return {
    jobId: resolvedJobId,
    outputDir,
    rawVideoPath,
    mp4Path,
    durationMs: Date.now() - startedAt,
    viewport: {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor,
    },
  };
}

function createJobId(targetUrl: string) {
  const host = new URL(targetUrl).hostname.replace(/^www\./, "");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${host}-${stamp}`;
}
