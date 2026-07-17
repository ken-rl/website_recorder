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
  const secondary = await recordWebsite(
    { ...baseRequest, targetUrl: request.comparison.targetUrl },
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

  const durationMs = Math.max(primary.durationMs, secondary.durationMs);
  const sourcePath = path.join(outputDir, "source.mp4");
  const outputPath = path.join(outputDir, "output.mp4");
  await composeComparison({
    primaryPath: primary.rawVideoPath,
    secondaryPath: secondary.rawVideoPath,
    outputPath: sourcePath,
    width: request.videoConfig.viewport.width * (request.videoConfig.viewport.deviceScaleFactor ?? 1),
    height: request.videoConfig.viewport.height * (request.videoConfig.viewport.deviceScaleFactor ?? 1),
    fps: request.videoConfig.framerate ?? 30,
    durationMs,
    primaryLabel: request.comparison.primaryLabel,
    secondaryLabel: request.comparison.secondaryLabel,
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
      width: request.videoConfig.viewport.width,
      height: request.videoConfig.viewport.height,
    },
    scrollStrategy:
      primary.scrollStrategy === "virtual" || secondary.scrollStrategy === "virtual"
        ? "virtual"
        : "document",
  };
}
