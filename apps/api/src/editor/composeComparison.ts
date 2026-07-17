import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

interface ComposeComparisonOptions {
  primaryPath: string;
  secondaryPath: string;
  outputPath: string;
  width: number;
  height: number;
  fps: number;
  durationMs: number;
  primaryLabel: string;
  secondaryLabel: string;
  signal?: AbortSignal;
}

/**
 * Fits two full, identically captured viewports into a single canvas. The
 * sources are scaled only during composition, so neither site crosses a
 * responsive breakpoint simply because it is shown beside another.
 */
export async function composeComparison(options: ComposeComparisonOptions) {
  const {
    primaryPath,
    secondaryPath,
    outputPath,
    fps,
    durationMs,
    primaryLabel,
    secondaryLabel,
    signal,
  } = options;
  const width = even(options.width);
  const height = even(options.height);
  const panelWidth = even(Math.floor(width / 2));
  const labelHeight = Math.max(42, Math.round(height * 0.065));
  const fontSize = Math.max(18, Math.round(height * 0.025));
  const durationSeconds = Math.max(0.1, durationMs / 1_000).toFixed(3);
  const outputDir = path.dirname(outputPath);
  await fs.mkdir(outputDir, { recursive: true });

  const primaryLabelPath = path.join(outputDir, ".comparison-primary.txt");
  const secondaryLabelPath = path.join(outputDir, ".comparison-secondary.txt");
  await Promise.all([
    fs.writeFile(primaryLabelPath, primaryLabel.replace(/\s+/g, " "), "utf8"),
    fs.writeFile(secondaryLabelPath, secondaryLabel.replace(/\s+/g, " "), "utf8"),
  ]);

  const primaryText = escapeFilterPath(primaryLabelPath);
  const secondaryText = escapeFilterPath(secondaryLabelPath);
  const panel = (input: string, output: string) =>
    `[${input}]setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=${durationSeconds},` +
    `trim=duration=${durationSeconds},scale=${panelWidth}:${height}:force_original_aspect_ratio=decrease:` +
    `flags=lanczos,pad=${panelWidth}:${height}:(ow-iw)/2:(oh-ih)/2:color=0x0d0f0c,` +
    `drawbox=x=0:y=0:w=iw:h=${labelHeight}:color=0x0d0f0c@0.88:t=fill,` +
    `drawtext=textfile='${output === "left" ? primaryText : secondaryText}':` +
    `expansion=none:fontcolor=0xf4f1e8:fontsize=${fontSize}:x=${Math.round(labelHeight * 0.42)}:` +
    `y=(${labelHeight}-text_h)/2[${output}]`;
  const filter = [
    panel("0:v", "left"),
    panel("1:v", "right"),
    `[left][right]hstack=inputs=2,drawbox=x=${panelWidth - 1}:y=0:w=2:h=ih:` +
      `color=0xf4f1e8@0.22:t=fill,setsar=1,fps=${fps}[video]`,
  ].join(";");

  try {
    await runFfmpeg([
      "-y",
      "-i", primaryPath,
      "-i", secondaryPath,
      "-filter_complex", filter,
      "-map", "[video]",
      "-an",
      "-c:v", "libx264",
      "-preset", "superfast",
      "-crf", "18",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      outputPath,
    ], signal);
  } finally {
    await Promise.all([
      fs.rm(primaryLabelPath, { force: true }),
      fs.rm(secondaryLabelPath, { force: true }),
    ]);
  }
}

function even(value: number) {
  return value % 2 === 0 ? value : value - 1;
}

function escapeFilterPath(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll(":", "\\:").replaceAll("'", "\\'");
}

function runFfmpeg(args: string[], signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal?.throwIfAborted();
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    const abort = () => child.kill("SIGTERM");
    signal?.addEventListener("abort", abort, { once: true });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      signal?.removeEventListener("abort", abort);
      if (signal?.aborted) return reject(signal.reason ?? new Error("Comparison cancelled"));
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg comparison exited with code ${code}: ${stderr.slice(-2_000)}`));
    });
  });
}
