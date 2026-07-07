import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { stitchFramesToVideo } from "../capture/stitchFrames.js";
import type { BezierControlPoints } from "../browser/curves.js";

function applyBezierCurve(
  linearProgress: number,
  bezier: BezierControlPoints,
): number {
  const [x1, y1, x2, y2] = bezier;
  if (linearProgress <= 0) return 0;
  if (linearProgress >= 1) return 1;

  const sampleX = (t: number) => {
    const inv = 1 - t;
    return 3 * inv * inv * t * x1 + 3 * inv * t * t * x2 + t * t * t;
  };
  const sampleY = (t: number) => {
    const inv = 1 - t;
    return 3 * inv * inv * t * y1 + 3 * inv * t * t * x2 + t * t * t;
  };
  const sampleDx = (t: number) =>
    3 * (1 - t) * (1 - t) * x1 +
    6 * (1 - t) * t * (x2 - x1) +
    3 * t * t * (1 - x2);

  let start = 0;
  let end = 1;
  let param = linearProgress;
  for (let i = 0; i < 8; i++) {
    param = (start + end) / 2;
    if (sampleX(param) < linearProgress) start = param;
    else end = param;
  }
  param = (start + end) / 2;
  const dx = sampleDx(param);
  if (Math.abs(dx) > 1e-6) param -= (sampleX(param) - linearProgress) / dx;
  return sampleY(Math.min(1, Math.max(0, param)));
}

export interface CompileVideoOptions {
  framesDir: string;
  metadataPath: string;
  outputPath: string;
  durationMs: number;
  fps: number;
  bezier: BezierControlPoints;
  pauses?: Array<{ atMs: number; holdMs: number }>;
  width?: number;
  height?: number;
}

export async function compileVideoFromFrames(options: CompileVideoOptions): Promise<void> {
  const {
    framesDir,
    metadataPath,
    outputPath,
    durationMs,
    fps,
    bezier,
    pauses = [],
    width,
    height,
  } = options;

  const metadataContent = await fs.readFile(metadataPath, "utf-8");
  const metadata = JSON.parse(metadataContent);

  const maxScroll = metadata.maxScroll;
  const sourceFrames = metadata.frames; // Array of { file, y, progress }
  const scrollStrategy = metadata.scrollStrategy;

  const totalOutputFrames = Math.max(1, Math.round((durationMs / 1000) * fps));
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "websiterecorder-stitch-"));

  try {
    const outputFrameFiles: string[] = [];
    const sortedPauses = [...pauses].sort((a, b) => a.atMs - b.atMs);

    for (let f = 0; f < totalOutputFrames; f++) {
      const t = (f / fps) * 1000;

      let scrollTime = t;
      let isHolding = false;
      let accumulatedPauseMs = 0;

      for (const pause of sortedPauses) {
        const pauseStart = pause.atMs + accumulatedPauseMs;
        const pauseEnd = pauseStart + pause.holdMs;

        if (t >= pauseStart && t < pauseEnd) {
          scrollTime = pause.atMs;
          isHolding = true;
          break;
        } else if (t >= pauseEnd) {
          accumulatedPauseMs += pause.holdMs;
        }
      }

      if (!isHolding) {
        scrollTime = t - accumulatedPauseMs;
      }

      const scrollDurationMs = Math.max(100, durationMs - accumulatedPauseMs);
      const linearProgress = Math.min(1, Math.max(0, scrollTime / scrollDurationMs));
      const easedProgress = applyBezierCurve(linearProgress, bezier);

      let selectedFrame = sourceFrames[0];
      if (scrollStrategy === "document") {
        const targetY = maxScroll * easedProgress;
        let minDiff = Infinity;
        for (const frame of sourceFrames) {
          const diff = Math.abs(frame.y - targetY);
          if (diff < minDiff) {
            minDiff = diff;
            selectedFrame = frame;
          }
        }
      } else {
        // virtual
        let minDiff = Infinity;
        for (const frame of sourceFrames) {
          const diff = Math.abs(frame.progress - easedProgress);
          if (diff < minDiff) {
            minDiff = diff;
            selectedFrame = frame;
          }
        }
      }

      outputFrameFiles.push(selectedFrame.file);
    }

    // Link/copy files to temp directory
    for (let i = 0; i < outputFrameFiles.length; i++) {
      const srcPath = path.join(framesDir, outputFrameFiles[i]);
      const destPath = path.join(tempDir, `frame-${String(i).padStart(6, "0")}.jpg`);
      await fs.link(srcPath, destPath).catch(() => fs.copyFile(srcPath, destPath));
    }

    // Stitch
    await stitchFramesToVideo(tempDir, outputPath, fps, {
      width,
      height,
      preset: "fast",
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
