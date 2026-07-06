import fs from "node:fs/promises";
import path from "node:path";
import { renderEditedVideo } from "../editor/renderEdit.js";
import { resolveEncodeSettings } from "../transcode/quality.js";
import { probeVideoDurationMs } from "../transcode/probe.js";
import type { EditRequest, EditResult } from "../types.js";

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

  await fs.access(sourcePath).catch(() => {
    throw new Error(`Recording not found for jobId: ${request.jobId}`);
  });

  validateEditRequest(request, await probeVideoDurationMs(sourcePath));

  const encode = resolveEncodeSettings("high", 1);
  const { durationMs } = await renderEditedVideo(
    sourcePath,
    editedPath,
    request,
    encode,
  );

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

  const trimStartMs = request.trimStartMs ?? 0;
  const trimEndMs = request.trimEndMs ?? sourceDurationMs ?? 0;

  if (trimStartMs < 0) {
    throw new Error("trimStartMs must be >= 0");
  }

  if (sourceDurationMs && trimEndMs > sourceDurationMs) {
    throw new Error("trimEndMs exceeds source video duration");
  }

  if (trimEndMs - trimStartMs < 100) {
    throw new Error("Trim range must be at least 100ms");
  }

  for (const pause of request.pauses ?? []) {
    if (pause.atMs < trimStartMs || pause.atMs > trimEndMs) {
      throw new Error("Pause markers must fall within the trim range");
    }
    if (pause.holdMs < 100 || pause.holdMs > 30000) {
      throw new Error("Pause duration must be between 100ms and 30s");
    }
  }
}
