import fs from "node:fs/promises";
import path from "node:path";
import { composeResponsiveness } from "../editor/composeResponsiveness.js";
import type { RecordRequest, RecordResult } from "../types.js";
import { recordWebsite, type RecordingRuntime } from "./recordWebsite.js";

export async function recordResponsiveness(
  request: RecordRequest,
  outputRoot: string,
  jobId: string,
  runtime: RecordingRuntime = {},
): Promise<RecordResult> {
  if (!request.responsiveness) throw new Error("Responsiveness settings are required");
  const startedAt = Date.now();
  const outputDir = path.resolve(outputRoot, jobId);
  await fs.mkdir(outputDir, { recursive: true });

  const desktopLabel = request.responsiveness.desktopLabel || "Desktop View";
  const mobileLabel = request.responsiveness.mobileLabel || "Mobile View";

  // Desktop configuration (uses primary videoConfig)
  const desktopWidth = request.videoConfig.viewport.width;
  const desktopHeight = request.videoConfig.viewport.height;

  // Mobile configuration (overrides viewport to standard mobile: e.g. 390x844)
  const mobileWidth = request.responsiveness.mobileWidth || 390;
  const mobileHeight = request.responsiveness.mobileHeight || 844;
  const mobileScaleFactor = 2; // standard high-res mobile scale

  const desktopRequest: RecordRequest = {
    ...request,
    responsiveness: undefined,
    backgroundPreset: "none",
    addShadow: false,
    roundedCorners: false,
  };

  const mobileRequest: RecordRequest = {
    ...request,
    responsiveness: undefined,
    videoConfig: {
      ...request.videoConfig,
      viewport: {
        width: mobileWidth,
        height: mobileHeight,
        deviceScaleFactor: mobileScaleFactor,
      },
    },
    backgroundPreset: "none",
    addShadow: false,
    roundedCorners: false,
  };

  const mapProgress = (
    side: "Desktop" | "Mobile",
    start: number,
    span: number,
  ): RecordingRuntime["onProgress"] => async (event) => {
    await runtime.onProgress?.({
      ...event,
      percent: start + (event.percent / 100) * span,
      message: `${side} · ${event.message}`,
    });
  };

  runtime.signal?.throwIfAborted();
  const primary = await recordWebsite(
    desktopRequest,
    outputDir,
    "side-a",
    { signal: runtime.signal, onProgress: mapProgress("Desktop", 2, 43) },
  );

  runtime.signal?.throwIfAborted();
  const isDocumentA = primary.scrollStrategy === "document" && primary.motionPlan?.mode === "document";
  const maxScrollA = primary.motionPlan?.beats?.[primary.motionPlan.beats.length - 1]?.position ?? 0;
  const durationA = primary.durationMs;
  const secondaryRequest = {
    ...mobileRequest,
  };
  if (isDocumentA && maxScrollA >= 200 && durationA > 0) {
    secondaryRequest.animationConfig = {
      ...secondaryRequest.animationConfig,
      scrollSync: {
        refMaxScroll: maxScrollA,
        refDurationMs: durationA,
      },
    };
  }

  const secondary = await recordWebsite(
    secondaryRequest,
    outputDir,
    "side-b",
    { signal: runtime.signal, onProgress: mapProgress("Mobile", 46, 43) },
  );

  runtime.signal?.throwIfAborted();
  await runtime.onProgress?.({
    stage: "encoding",
    percent: 91,
    message: "Synchronizing both captures",
  });

  const desktopW = desktopRequest.videoConfig.viewport.width;
  const desktopH = desktopRequest.videoConfig.viewport.height;
  const desktopScale = desktopRequest.videoConfig.viewport.deviceScaleFactor ?? 1;

  const even = (v: number) => (v % 2 === 0 ? v : v - 1);
  const optimizedWidth = even(Math.round(desktopW * desktopScale));
  const optimizedHeight = even(Math.round(desktopH * desktopScale));

  const durationMs = Math.max(primary.durationMs, secondary.durationMs);
  const sourcePath = path.join(outputDir, "source.mp4");
  const outputPath = path.join(outputDir, "output.mp4");

  await composeResponsiveness({
    desktopPath: primary.rawVideoPath,
    mobilePath: secondary.rawVideoPath,
    outputPath: sourcePath,
    width: optimizedWidth,
    height: optimizedHeight,
    fps: request.videoConfig.framerate ?? 30,
    durationMs,
    desktopLabel,
    mobileLabel,
    desktopWidth: desktopW,
    desktopHeight: desktopH,
    mobileWidth,
    mobileHeight,
    signal: runtime.signal,
  });
  await fs.copyFile(sourcePath, outputPath);

  await runtime.onProgress?.({
    stage: "finalizing",
    percent: 97,
    message: "Finalizing responsiveness capture",
  });

  return {
    jobId,
    outputDir,
    rawVideoPath: sourcePath,
    mp4Path: outputPath,
    durationMs,
    renderTimeMs: Date.now() - startedAt,
    viewport: {
      ...request.videoConfig.viewport,
      width: optimizedWidth,
      height: optimizedHeight,
    },
    scrollStrategy:
      primary.scrollStrategy === "virtual" || secondary.scrollStrategy === "virtual"
        ? "virtual"
        : "document",
  };
}
