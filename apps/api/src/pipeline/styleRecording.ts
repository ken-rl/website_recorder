import fs from "node:fs/promises";
import path from "node:path";
import { frameVideoOnBackground } from "../editor/frameVideo.js";
import { resolveEncodeSettings } from "../transcode/quality.js";
import type { StyleRequest, StyleResult } from "../types.js";

export const SOURCE_FILENAME = "source.mp4";
export const OUTPUT_FILENAME = "output.mp4";

export async function restyleRecording(
  request: StyleRequest,
  outputRoot: string,
): Promise<StyleResult> {
  if (!request.jobId?.trim()) throw new Error("jobId is required");

  const outputDir = path.resolve(outputRoot, request.jobId);
  if (!outputDir.startsWith(path.resolve(outputRoot) + path.sep)) {
    throw new Error("Invalid jobId");
  }

  const sourcePath = path.join(outputDir, SOURCE_FILENAME);
  await fs.access(sourcePath).catch(() => {
    throw new Error("Original recording is unavailable for restyling");
  });

  const outputPath = path.join(outputDir, OUTPUT_FILENAME);
  await renderRecordingStyle({
    sourcePath,
    outputPath,
    backgroundPreset: request.backgroundPreset,
    addShadow: request.addShadow,
    roundedCorners: request.roundedCorners,
  });

  return {
    jobId: request.jobId,
    videoUrl: `/outputs/${request.jobId}/${OUTPUT_FILENAME}`,
    mp4Path: outputPath,
  };
}

export async function renderRecordingStyle(options: {
  sourcePath: string;
  outputPath: string;
  backgroundPreset?: StyleRequest["backgroundPreset"];
  addShadow?: boolean;
  roundedCorners?: boolean;
}) {
  const { sourcePath, outputPath, backgroundPreset, addShadow, roundedCorners } = options;
  const tempOutputPath = outputPath.endsWith(".mp4")
    ? `${outputPath.slice(0, -4)}.next.mp4`
    : `${outputPath}.next.mp4`;
  await fs.unlink(tempOutputPath).catch(() => undefined);

  if (backgroundPreset && backgroundPreset !== "none") {
    await frameVideoOnBackground({
      inputPath: sourcePath,
      outputPath: tempOutputPath,
      preset: backgroundPreset,
      addShadow: addShadow ?? true,
      roundedCorners: roundedCorners ?? false,
      encode: resolveEncodeSettings("high", 1),
    });
  } else {
    await fs.link(sourcePath, tempOutputPath).catch(() =>
      fs.copyFile(sourcePath, tempOutputPath),
    );
  }

  await fs.rename(tempOutputPath, outputPath);
}
