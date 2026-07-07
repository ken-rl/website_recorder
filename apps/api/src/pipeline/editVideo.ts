import fs from "node:fs/promises";
import path from "node:path";
import { renderEditedVideo } from "../editor/renderEdit.js";
import { resolveEncodeSettings } from "../transcode/quality.js";
import { probeVideoDurationMs } from "../transcode/probe.js";
import type { EditRequest, EditResult } from "../types.js";

import { compileVideoFromFrames } from "../editor/compileVideo.js";
import { transcodeToMp4 } from "../transcode/ffmpeg.js";

const SOURCE_FILENAME = "output.mp4";
const EDITED_FILENAME = "output-edited.mp4";
const PROJECT_FILENAME = "edit-project.json";

export async function editVideo(
  request: EditRequest,
  outputRoot: string,
): Promise<EditResult> {
  const outputDir = path.resolve(outputRoot, request.jobId);
  const sourcePath = path.join(outputDir, SOURCE_FILENAME);
  const editedPath = path.join(outputDir, EDITED_FILENAME);
  const metadataPath = path.join(outputDir, "frames-metadata.json");
  const framesDir = path.join(outputDir, ".frames");

  await fs.access(sourcePath).catch(() => {
    throw new Error(`Recording not found for jobId: ${request.jobId}`);
  });

  let durationMs = 0;
  const hasMetadata = await fs.access(metadataPath).then(() => true).catch(() => false);

  if (hasMetadata) {
    console.log(`Using linear frames metadata to perform instant scroll compile for jobId: ${request.jobId}`);
    const metadataContent = await fs.readFile(metadataPath, "utf-8");
    const metadata = JSON.parse(metadataContent);

    const viewport = metadata.viewport;
    const deviceScaleFactor = metadata.deviceScaleFactor ?? 1;
    const targetWidth = viewport.width * deviceScaleFactor;
    const targetHeight = viewport.height * deviceScaleFactor;

    const targetDurationMs = request.durationMs ?? ((request.trimEndMs ?? 10000) - (request.trimStartMs ?? 0));
    const bezier = request.bezier ?? [0.25, 0.1, 0.25, 1.0];

    const tempRawPath = path.join(outputDir, "raw_edited.mp4");

    await compileVideoFromFrames({
      framesDir,
      metadataPath,
      outputPath: tempRawPath,
      durationMs: targetDurationMs,
      fps: 60,
      bezier,
      pauses: request.pauses ?? [],
      width: targetWidth,
      height: targetHeight,
    });

    const encode = resolveEncodeSettings("high", deviceScaleFactor);
    await transcodeToMp4(
      tempRawPath,
      editedPath,
      60,
      targetWidth,
      targetHeight,
      encode,
    );

    await fs.unlink(tempRawPath).catch(() => undefined);
    durationMs = targetDurationMs;
  } else {
    validateEditRequest(request, await probeVideoDurationMs(sourcePath));
    const encode = resolveEncodeSettings("high", 1);
    const result = await renderEditedVideo(
      sourcePath,
      editedPath,
      request,
      encode,
    );
    durationMs = result.durationMs;
  }

  await fs.writeFile(
    path.join(outputDir, PROJECT_FILENAME),
    JSON.stringify(request, null, 2),
  );

  return {
    jobId: request.jobId,
    sourceVideoUrl: `/outputs/${request.jobId}/${SOURCE_FILENAME}`,
    videoUrl: `/outputs/${request.jobId}/${EDITED_FILENAME}`,
    mp4Path: editedPath,
    durationMs,
  };
}

function validateEditRequest(
  request: EditRequest,
  sourceDurationMs: number | null,
) {
  if (!request.jobId?.trim()) {
    throw new Error("jobId is required");
  }

  if (sourceDurationMs) {
    if (request.trimEndMs === undefined || request.trimEndMs > sourceDurationMs) {
      request.trimEndMs = sourceDurationMs;
    }
  }

  const trimStartMs = request.trimStartMs ?? 0;
  const trimEndMs = request.trimEndMs ?? sourceDurationMs ?? 0;

  if (trimStartMs < 0) {
    throw new Error("trimStartMs must be >= 0");
  }

  if (trimEndMs - trimStartMs < 100) {
    throw new Error("Trim range must be at least 100ms");
  }

  for (const pause of request.pauses ?? []) {
    if (sourceDurationMs && pause.atMs > trimEndMs && pause.atMs - trimEndMs < 200) {
      pause.atMs = trimEndMs;
    }
    if (pause.atMs < trimStartMs || pause.atMs > trimEndMs) {
      throw new Error("Pause markers must fall within the trim range");
    }
    if (pause.holdMs < 100 || pause.holdMs > 30000) {
      throw new Error("Pause duration must be between 100ms and 30s");
    }
  }
}
