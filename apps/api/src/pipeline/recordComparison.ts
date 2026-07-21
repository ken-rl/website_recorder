import fs from "node:fs/promises";
import path from "node:path";
import { composeComparison } from "../editor/composeComparison.js";
import type { RecordRequest, RecordResult } from "../types.js";
import { recordWebsite, type RecordingRuntime } from "./recordWebsite.js";

export async function recordComparison(
  request: RecordRequest,
  outputRoot: string,
  jobId: string,
  runtime: RecordingRuntime = {},
): Promise<RecordResult> {
  if (!request.comparison) throw new Error("Comparison settings are required");
  const startedAt = Date.now();
  const outputDir = path.resolve(outputRoot, jobId);
  await fs.mkdir(outputDir, { recursive: true });

  const baseRequest: RecordRequest = {
    ...request,
    comparison: undefined,
    backgroundPreset: "none",
    addShadow: false,
    roundedCorners: false,
  };
  const mapProgress = (
    side: "A" | "B",
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
    baseRequest,
    outputDir,
    "side-a",
    { signal: runtime.signal, onProgress: mapProgress("A", 2, 43) },
  );

  runtime.signal?.throwIfAborted();
  const isDocumentA = primary.scrollStrategy === "document" && primary.motionPlan?.mode === "document";
  const maxScrollA = primary.motionPlan?.beats?.[primary.motionPlan.beats.length - 1]?.position ?? 0;
  const durationA = request.animationConfig?.durationMs ?? primary.durationMs;
  const secondaryRequest = {
    ...baseRequest,
    targetUrl: request.comparison.targetUrl,
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
    { signal: runtime.signal, onProgress: mapProgress("B", 46, 43) },
  );

  runtime.signal?.throwIfAborted();
  await runtime.onProgress?.({
    stage: "encoding",
    percent: 91,
    message: "Synchronizing both captures",
  });

  const viewportW = request.videoConfig.viewport.width;
  const viewportH = request.videoConfig.viewport.height;
  const scaleFactor = request.videoConfig.viewport.deviceScaleFactor ?? 1;

  const even = (v: number) => (v % 2 === 0 ? v : v - 1);
  const optimizedWidth = even(Math.round(viewportW * scaleFactor));
  const optimizedHeight = even(Math.round(viewportH * scaleFactor));

  const durationMs = Math.max(primary.durationMs, secondary.durationMs);
  const sourcePath = path.join(outputDir, "source.mp4");
  const outputPath = path.join(outputDir, "output.mp4");
  await composeComparison({
    primaryPath: primary.rawVideoPath,
    secondaryPath: secondary.rawVideoPath,
    outputPath: sourcePath,
    width: optimizedWidth,
    height: optimizedHeight,
    fps: request.videoConfig.framerate ?? 30,
    durationMs,
    primaryLabel: request.comparison.primaryLabel,
    secondaryLabel: request.comparison.secondaryLabel,
    primaryLogo: request.comparison.primaryLogo,
    secondaryLogo: request.comparison.secondaryLogo,
    primaryLogoDataUrl: request.comparison.primaryLogoDataUrl,
    secondaryLogoDataUrl: request.comparison.secondaryLogoDataUrl,
    signal: runtime.signal,
  });
  await fs.copyFile(sourcePath, outputPath);

  await runtime.onProgress?.({
    stage: "finalizing",
    percent: 97,
    message: "Finalizing comparison",
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
