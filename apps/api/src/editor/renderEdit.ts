import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { EditRequest } from "../types.js";
import { probeVideoDurationMs, probeVideoSize, probeVideoFps } from "../transcode/probe.js";
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
  const fps = (await probeVideoFps(inputPath)) || 60;

  const segments = buildEditSegments(
    trimStartMs,
    trimEndMs,
    edit.pauses ?? [],
    edit.zooms ?? [],
  );
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
          segment.zoom,
          encode,
          size,
          segment.speedType,
          fps,
        );
      } else {
        await extractFreezeSegment(
          inputPath,
          segmentPath,
          segment.atMs,
          segment.holdMs,
          segment.zoom,
          encode,
          size,
          fps,
        );
      }

      segmentPaths.push(segmentPath);
    }

    await concatSegments(segmentPaths, outputPath, encode, fps);
    const durationMs = (await probeVideoDurationMs(outputPath)) ?? 0;
    return { durationMs };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function buildZoomFilter(
  zoom: {
    startScale: number;
    endScale: number;
    startX: number;
    endX: number;
    startY: number;
    endY: number;
  },
  durationMs: number,
  fps: number,
  size: { width: number; height: number } | null,
): string {
  const { startScale, endScale, startX, startY } = zoom;

  const isConstant = Math.abs(startScale - endScale) < 0.001;

  if (isConstant) {
    if (Math.abs(startScale - 1.0) < 0.001) {
      return "";
    }
    return `crop=w='iw/${startScale.toFixed(3)}':h='ih/${startScale.toFixed(3)}':x='(iw-ow)*${startX.toFixed(3)}':y='(ih-oh)*${startY.toFixed(3)}'`;
  }

  const durationSec = durationMs / 1000;
  const diffScale = (endScale - startScale).toFixed(3);
  const totalFrames = Math.max(1, Math.round(durationSec * fps));

  const sizeStr = size ? `:s=${size.width}x${size.height}` : "";
  const zExpr = `(${startScale.toFixed(3)}+(${diffScale})*min(on,${totalFrames})/${totalFrames})`;
  const xExpr = `trunc((${startX.toFixed(3)}*iw)-(iw/zoom)/2)`;
  const yExpr = `trunc((${startY.toFixed(3)}*ih)-(ih/zoom)/2)`;

  return `zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':d=1:fps=${fps}${sizeStr}`;
}

function buildFreezeZoomFilter(zoom: {
  scale: number;
  x: number;
  y: number;
}): string {
  const { scale, x, y } = zoom;
  if (Math.abs(scale - 1.0) < 0.001) {
    return "";
  }
  return `crop=w='iw/${scale.toFixed(3)}':h='ih/${scale.toFixed(3)}':x='(iw-ow)*${x.toFixed(3)}':y='(ih-oh)*${y.toFixed(3)}'`;
}

async function extractPlaySegment(
  inputPath: string,
  outputPath: string,
  startMs: number,
  durationMs: number,
  zoom: {
    startScale: number;
    endScale: number;
    startX: number;
    endX: number;
    startY: number;
    endY: number;
  },
  encode: EncodeSettings,
  size: { width: number; height: number } | null,
  speedType: "normal" | "decelerate" | "accelerate" = "normal",
  fps: number = DEFAULT_FPS,
) {
  const startSec = (startMs / 1000).toFixed(3);
  const outputDurationMs = (speedType === "decelerate" || speedType === "accelerate")
    ? durationMs * 1.5
    : durationMs;
  const outputDurationSec = (outputDurationMs / 1000).toFixed(3);
  const filters: string[] = [];

  if (size) {
    filters.push(scaleFilter(size.width, size.height));
  }

  const durationSecVal = durationMs / 1000;
  if (speedType === "decelerate") {
    filters.push(`setpts='PTS*(1.0+0.5*(T/${durationSecVal.toFixed(3)}))'`);
  } else if (speedType === "accelerate") {
    filters.push(`setpts='PTS*(2.0-0.5*(T/${durationSecVal.toFixed(3)}))'`);
  }

  const zoomFilter = buildZoomFilter(zoom, durationMs, fps, size);
  if (zoomFilter) {
    filters.push(zoomFilter);
  }

  filters.push(`fps=${fps}`);

  await runFfmpeg([
    "-y",
    "-ss",
    startSec,
    "-i",
    inputPath,
    "-t",
    outputDurationSec,
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
  zoom: { scale: number; x: number; y: number },
  encode: EncodeSettings,
  size: { width: number; height: number } | null,
  fps: number = DEFAULT_FPS,
) {
  const framePath = `${outputPath}.jpg`;
  const atSec = (atMs / 1000).toFixed(3);
  const holdSec = (holdMs / 1000).toFixed(3);
  const zoomFilter = buildFreezeZoomFilter(zoom);
  const scale = size ? scaleFilter(size.width, size.height) : null;
  const filters = [zoomFilter, scale, `fps=${fps}`].filter(Boolean);

  try {
    await runFfmpeg([
      "-y",
      "-ss",
      atSec,
      "-i",
      inputPath,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      framePath,
    ]);

    const freezeFilters = [
      zoomFilter,
      scale,
      `fps=${fps}`,
      "format=yuv420p",
    ].filter(Boolean);

    await runFfmpeg([
      "-y",
      "-loop",
      "1",
      "-framerate",
      String(fps),
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
  fps: number = DEFAULT_FPS,
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
