import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { EditRequest } from "../types.js";
import { probeVideoDurationMs, probeVideoSize } from "../transcode/probe.js";
import type { EncodeSettings } from "../transcode/quality.js";
import { buildEditSegments } from "./segments.js";

const DEFAULT_FPS = 30;

export async function renderEditedVideo(
  inputPath: string,
  outputPath: string,
  edit: EditRequest,
  encode: EncodeSettings,
): Promise<{ durationMs: number }> {
  const sourceDurationMs = await probeVideoDurationMs(inputPath);
  if (!sourceDurationMs) {
    throw new Error("Could not read source video duration");
  }

  const trimStartMs = Math.max(0, edit.trimStartMs ?? 0);
  const trimEndMs = Math.min(
    sourceDurationMs,
    edit.trimEndMs ?? sourceDurationMs,
  );

  if (trimEndMs - trimStartMs < 100) {
    throw new Error("Trim range must be at least 100ms");
  }

  const size = await probeVideoSize(inputPath);
  const segments = buildEditSegments(trimStartMs, trimEndMs, edit.pauses ?? []);
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "websiterecorder-edit-"),
  );

  try {
    const segmentPaths: string[] = [];

    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      const segmentPath = path.join(tempDir, `segment-${index}.mp4`);

      if (segment.type === "play") {
        await extractPlaySegment(
          inputPath,
          segmentPath,
          segment.startMs,
          segment.endMs - segment.startMs,
          encode,
          size,
        );
      } else {
        await extractFreezeSegment(
          inputPath,
          segmentPath,
          segment.atMs,
          segment.holdMs,
          encode,
          size,
        );
      }

      segmentPaths.push(segmentPath);
    }

    await concatSegments(segmentPaths, outputPath, encode);
    const durationMs = (await probeVideoDurationMs(outputPath)) ?? 0;
    return { durationMs };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function extractPlaySegment(
  inputPath: string,
  outputPath: string,
  startMs: number,
  durationMs: number,
  encode: EncodeSettings,
  size: { width: number; height: number } | null,
) {
  const startSec = (startMs / 1000).toFixed(3);
  const durationSec = (durationMs / 1000).toFixed(3);
  const scale = size ? scaleFilter(size.width, size.height) : null;
  const filters = [scale, `fps=${DEFAULT_FPS}`].filter(Boolean);

  await runFfmpeg([
    "-y",
    "-i",
    inputPath,
    "-ss",
    startSec,
    "-t",
    durationSec,
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    encode.preset,
    "-crf",
    String(encode.crf),
    "-pix_fmt",
    "yuv420p",
    ...(filters.length ? ["-vf", filters.join(",")] : []),
    outputPath,
  ]);
}

async function extractFreezeSegment(
  inputPath: string,
  outputPath: string,
  atMs: number,
  holdMs: number,
  encode: EncodeSettings,
  size: { width: number; height: number } | null,
) {
  const framePath = `${outputPath}.jpg`;
  const atSec = (atMs / 1000).toFixed(3);
  const holdSec = (holdMs / 1000).toFixed(3);
  const scale = size ? scaleFilter(size.width, size.height) : null;
  const filters = [scale, `fps=${DEFAULT_FPS}`].filter(Boolean);

  try {
    await runFfmpeg([
      "-y",
      "-i",
      inputPath,
      "-ss",
      atSec,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      framePath,
    ]);

    const freezeFilters = [
      scale,
      `fps=${DEFAULT_FPS}`,
      "format=yuv420p",
    ].filter(Boolean);

    await runFfmpeg([
      "-y",
      "-loop",
      "1",
      "-framerate",
      String(DEFAULT_FPS),
      "-i",
      framePath,
      "-t",
      holdSec,
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      encode.preset,
      "-crf",
      String(encode.crf),
      "-pix_fmt",
      "yuv420p",
      "-vsync",
      "cfr",
      ...(freezeFilters.length ? ["-vf", freezeFilters.join(",")] : []),
      outputPath,
    ]);
  } finally {
    await fs.unlink(framePath).catch(() => undefined);
  }
}

async function concatSegments(
  segmentPaths: string[],
  outputPath: string,
  encode: EncodeSettings,
) {
  if (segmentPaths.length === 1) {
    await fs.copyFile(segmentPaths[0], outputPath);
    return;
  }

  const listPath = `${outputPath}.txt`;
  const listBody = segmentPaths
    .map((segmentPath) => `file '${segmentPath.replace(/'/g, "'\\''")}'`)
    .join("\n");
  await fs.writeFile(listPath, listBody);

  try {
    await runFfmpeg([
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      encode.preset,
      "-crf",
      String(encode.crf),
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      outputPath,
    ]);
  } finally {
    await fs.unlink(listPath).catch(() => undefined);
  }
}

function scaleFilter(width: number, height: number) {
  const evenWidth = width % 2 === 0 ? width : width - 1;
  const evenHeight = height % 2 === 0 ? height : height - 1;
  return `scale=${evenWidth}:${evenHeight}:flags=lanczos+accurate_rnd+full_chroma_int,setsar=1`;
}

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-2000)}`),
        );
    });
  });
}
