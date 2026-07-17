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
 * Presents two captures as equal cards on one editorial canvas. Both websites
 * are still recorded at the selected full viewport; composition happens only
 * after capture, so the comparison never changes either responsive breakpoint.
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
  const outerMargin = even(Math.round(width * 0.05));
  const panelGap = even(Math.round(width * 0.022));
  const panelTop = even(Math.round(height * 0.145));
  const bottomMargin = even(Math.round(height * 0.045));
  const panelWidth = even(Math.floor((width - outerMargin * 2 - panelGap) / 2));
  const panelHeight = even(height - panelTop - bottomMargin);
  const secondaryX = outerMargin + panelWidth + panelGap;
  const fontSize = Math.max(20, Math.round(height * 0.047));
  const sideBadgeSize = Math.max(22, Math.round(height * 0.045));
  const cornerRadius = Math.max(12, Math.round(Math.min(panelWidth, panelHeight) * 0.035));
  const durationSeconds = Math.max(0.1, durationMs / 1_000).toFixed(3);
  const outputDir = path.dirname(outputPath);
  await fs.mkdir(outputDir, { recursive: true });

  const primaryLabelPath = path.join(outputDir, ".comparison-primary.txt");
  const secondaryLabelPath = path.join(outputDir, ".comparison-secondary.txt");
  const maskPath = path.join(outputDir, ".comparison-mask.png");
  await Promise.all([
    fs.writeFile(primaryLabelPath, primaryLabel.replace(/\s+/g, " "), "utf8"),
    fs.writeFile(secondaryLabelPath, secondaryLabel.replace(/\s+/g, " "), "utf8"),
  ]);
  await createRoundedMask(maskPath, panelWidth, panelHeight, cornerRadius, signal);

  const primaryText = escapeFilterPath(primaryLabelPath);
  const secondaryText = escapeFilterPath(secondaryLabelPath);
  const panel = (input: string, mask: string, output: string) =>
    `[${input}]setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=${durationSeconds},` +
    `trim=duration=${durationSeconds},scale=${panelWidth}:${panelHeight}:force_original_aspect_ratio=increase:` +
    `flags=lanczos,crop=${panelWidth}:${panelHeight},setsar=1,format=rgba[${output}-base];` +
    `[${output}-base][${mask}]alphamerge[${output}]`;
  const labelY = Math.max(8, Math.round((panelTop - fontSize) / 2));
  const filter = [
    "[2:v]format=gray,split=2[mask-a][mask-b]",
    panel("0:v", "mask-a", "left"),
    panel("1:v", "mask-b", "right"),
    `color=c=0xf1f4ed:s=${width}x${height}:r=${fps}:d=${durationSeconds}[canvas]`,
    `[canvas]drawbox=x=${outerMargin}:y=${labelY}:w=${sideBadgeSize}:h=${sideBadgeSize}:` +
      `color=0x3158c9:t=fill,drawtext=text='A':expansion=none:fontcolor=white:` +
      `fontsize=${Math.round(sideBadgeSize * 0.52)}:x=${outerMargin}+(${sideBadgeSize}-text_w)/2:` +
      `y=${labelY}+(${sideBadgeSize}-text_h)/2,drawtext=textfile='${primaryText}':expansion=none:` +
      `fontcolor=0x171914:fontsize=${fontSize}:x=${outerMargin + sideBadgeSize + Math.round(width * 0.012)}:` +
      `y=${labelY}+(${sideBadgeSize}-text_h)/2,` +
      `drawbox=x=${secondaryX}:y=${labelY}:w=${sideBadgeSize}:h=${sideBadgeSize}:color=0x087e72:t=fill,` +
      `drawtext=text='B':expansion=none:fontcolor=white:fontsize=${Math.round(sideBadgeSize * 0.52)}:` +
      `x=${secondaryX}+(${sideBadgeSize}-text_w)/2:y=${labelY}+(${sideBadgeSize}-text_h)/2,` +
      `drawtext=textfile='${secondaryText}':expansion=none:fontcolor=0x171914:fontsize=${fontSize}:` +
      `x=${secondaryX + sideBadgeSize + Math.round(width * 0.012)}:y=${labelY}+(${sideBadgeSize}-text_h)/2[headed]`,
    `[headed][left]overlay=${outerMargin}:${panelTop}:shortest=1[first]`,
    `[first][right]overlay=${secondaryX}:${panelTop}:shortest=1,setsar=1,fps=${fps},format=yuv420p[video]`,
  ].join(";");

  try {
    await runFfmpeg([
      "-y",
      "-i", primaryPath,
      "-i", secondaryPath,
      "-loop", "1",
      "-framerate", String(fps),
      "-i", maskPath,
      "-filter_complex", filter,
      "-map", "[video]",
      "-an",
      "-c:v", "libx264",
      "-preset", "superfast",
      "-crf", "18",
      "-pix_fmt", "yuv420p",
      "-t", durationSeconds,
      "-movflags", "+faststart",
      outputPath,
    ], signal);
  } finally {
    await Promise.all([
      fs.rm(primaryLabelPath, { force: true }),
      fs.rm(secondaryLabelPath, { force: true }),
      fs.rm(maskPath, { force: true }),
    ]);
  }
}

async function createRoundedMask(
  outputPath: string,
  width: number,
  height: number,
  radius: number,
  signal?: AbortSignal,
) {
  const right = `W-${radius}`;
  const bottom = `H-${radius}`;
  const outsideCorner = [
    `lt(X,${radius})*lt(Y,${radius})*gt(hypot(X-${radius},Y-${radius}),${radius})`,
    `gt(X,${right})*lt(Y,${radius})*gt(hypot(X-(${right}),Y-${radius}),${radius})`,
    `lt(X,${radius})*gt(Y,${bottom})*gt(hypot(X-${radius},Y-(${bottom})),${radius})`,
    `gt(X,${right})*gt(Y,${bottom})*gt(hypot(X-(${right}),Y-(${bottom})),${radius})`,
  ].join("+");
  await runFfmpeg([
    "-y",
    "-f", "lavfi",
    "-i", `color=c=white:s=${width}x${height}:r=1`,
    "-vf", `format=gray,geq=lum='if(gt(${outsideCorner},0),0,255)'`,
    "-frames:v", "1",
    "-c:v", "png",
    outputPath,
  ], signal);
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
