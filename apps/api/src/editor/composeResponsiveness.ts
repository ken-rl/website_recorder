import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

interface ComposeResponsivenessOptions {
  desktopPath: string;
  mobilePath: string;
  outputPath: string;
  width: number;
  height: number;
  fps: number;
  durationMs: number;
  desktopLabel: string;
  mobileLabel: string;
  desktopWidth: number;
  desktopHeight: number;
  mobileWidth: number;
  mobileHeight: number;
  signal?: AbortSignal;
}

export async function composeResponsiveness(options: ComposeResponsivenessOptions) {
  const {
    desktopPath,
    mobilePath,
    outputPath,
    fps,
    durationMs,
    desktopLabel,
    mobileLabel,
    desktopWidth,
    desktopHeight,
    mobileWidth,
    mobileHeight,
    signal,
  } = options;

  const width = even(options.width);
  const height = even(options.height);
  const outerMargin = even(Math.round(width * 0.05));
  const panelGap = even(Math.round(width * 0.035));
  const panelTop = even(Math.round(height * 0.12));
  const bottomMargin = even(Math.round(height * 0.05));
  const panelHeight = even(height - panelTop - bottomMargin);
  const panelWidthAvailable = width - outerMargin * 2 - panelGap;

  // Aspect ratios from capture dimensions
  const desktopAspect = desktopWidth / desktopHeight;
  const mobileAspect = mobileWidth / mobileHeight;

  // Solve layout sizing
  let dH = even(Math.round(panelHeight * 0.82));
  let dW = even(Math.round(dH * desktopAspect));

  let mH = even(Math.round(panelHeight * 0.92));
  let mW = even(Math.round(mH * mobileAspect));

  const totalPanelW = dW + mW;
  if (totalPanelW > panelWidthAvailable) {
    const scale = panelWidthAvailable / totalPanelW;
    dH = even(Math.round(dH * scale));
    dW = even(Math.round(dW * scale));
    mH = even(Math.round(mH * scale));
    mW = even(Math.round(mW * scale));
  }

  // Centering coordinates
  const leftoverWidth = panelWidthAvailable - (dW + mW);
  const desktopX = outerMargin + Math.round(leftoverWidth / 2);
  const mobileX = desktopX + dW + panelGap;

  const desktopY = panelTop + Math.round((panelHeight - dH) / 2);
  const mobileY = panelTop + Math.round((panelHeight - mH) / 2);

  const fontSize = Math.max(18, Math.round(height * 0.038));
  const labelY = Math.max(8, Math.round((panelTop - fontSize) / 2));

  const dCornerRadius = Math.max(10, Math.round(Math.min(dW, dH) * 0.03));
  const mCornerRadius = Math.max(10, Math.round(Math.min(mW, mH) * 0.03));

  const durationSeconds = Math.max(0.1, durationMs / 1_000).toFixed(3);
  const outputDir = path.dirname(outputPath);
  await fs.mkdir(outputDir, { recursive: true });

  // Subtle drop shadow settings
  const shadowOffsetY = Math.max(4, Math.round(height * 0.005));
  const shadowBlur = Math.max(8, Math.round(height * 0.012));
  const shadowAlpha = 0.22;

  // --- Temp files ---
  const desktopLabelPath = path.join(outputDir, ".responsiveness-desktop.txt");
  const mobileLabelPath = path.join(outputDir, ".responsiveness-mobile.txt");
  const desktopMaskPath = path.join(outputDir, ".responsiveness-mask-desktop.png");
  const mobileMaskPath = path.join(outputDir, ".responsiveness-mask-mobile.png");

  await Promise.all([
    fs.writeFile(desktopLabelPath, desktopLabel.replace(/\s+/g, " "), "utf8"),
    fs.writeFile(mobileLabelPath, mobileLabel.replace(/\s+/g, " "), "utf8"),
    createRoundedMask(desktopMaskPath, dW, dH, dCornerRadius, signal),
    createRoundedMask(mobileMaskPath, mW, mH, mCornerRadius, signal),
  ]);

  // --- Build ffmpeg inputs & filter ---
  const desktopText = escapeFilterPath(desktopLabelPath);
  const mobileText = escapeFilterPath(mobileLabelPath);

  const panelBg = "0xf1f4ed";
  const panel = (input: string, mask: string, w: number, h: number, output: string) =>
    `[${input}]setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=${durationSeconds},` +
    `trim=duration=${durationSeconds},scale=${w}:${h}:force_original_aspect_ratio=decrease:` +
    `flags=lanczos,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=${panelBg},` +
    `setsar=1,format=rgba[${output}-base];` +
    `[${output}-base][${mask}]alphamerge[${output}]`;

  // Build filter_complex segments
  const filterParts: string[] = [
    `[2:v]format=gray[mask-d]`,
    `[3:v]format=gray[mask-m]`,
    panel("0:v", "mask-d", dW, dH, "desktop-in"),
    panel("1:v", "mask-m", mW, mH, "mobile-in"),
    `color=c=0xf1f4ed:s=${width}x${height}:r=${fps}:d=${durationSeconds}[canvas]`,
  ];

  // Render text labels centered over the desktop and mobile panels
  const headerParts: string[] = [];

  const primaryTextW = estimateTextWidth(desktopLabel, fontSize);
  const primaryLabelX = Math.round(desktopX + (dW - primaryTextW) / 2);
  headerParts.push(
    `drawtext=textfile='${desktopText}':expansion=none:fontcolor=0x171914:fontsize=${fontSize}:` +
      `x=${primaryLabelX}:y=${labelY}`,
  );

  const secondaryTextW = estimateTextWidth(mobileLabel, fontSize);
  const secondaryLabelX = Math.round(mobileX + (mW - secondaryTextW) / 2);
  headerParts.push(
    `drawtext=textfile='${mobileText}':expansion=none:fontcolor=0x171914:fontsize=${fontSize}:` +
      `x=${secondaryLabelX}:y=${labelY}`,
  );

  const headerFilter = `[canvas]${headerParts.join(",")}[headed]`;
  filterParts.push(headerFilter);

  let currentStream = "headed";

  // Split each panel into (original, shadow-source), blur the shadow copy, then
  // overlay: shadow (offset) → original — giving a subtle soft drop shadow.
  filterParts.push(
    `[desktop-in]split=2[desktop-orig][desktop-sh-in]`,
    `[desktop-sh-in]gblur=sigma=${shadowBlur},colorchannelmixer=aa=${shadowAlpha}[desktop-sh]`,
    `[mobile-in]split=2[mobile-orig][mobile-sh-in]`,
    `[mobile-sh-in]gblur=sigma=${shadowBlur},colorchannelmixer=aa=${shadowAlpha}[mobile-sh]`,
    `[${currentStream}][desktop-sh]overlay=${desktopX}:${desktopY + shadowOffsetY}:shortest=1[with-ds]`,
    `[with-ds][desktop-orig]overlay=${desktopX}:${desktopY}:shortest=1[first]`,
    `[first][mobile-sh]overlay=${mobileX}:${mobileY + shadowOffsetY}:shortest=1[with-ms]`,
    `[with-ms][mobile-orig]overlay=${mobileX}:${mobileY}:shortest=1,setsar=1,fps=${fps},format=yuv420p[video]`,
  );

  const filter = filterParts.join(";");

  try {
    await runFfmpeg([
      "-y",
      "-i", desktopPath,
      "-i", mobilePath,
      "-loop", "1",
      "-framerate", String(fps),
      "-i", desktopMaskPath,
      "-loop", "1",
      "-framerate", String(fps),
      "-i", mobileMaskPath,
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
      fs.rm(desktopLabelPath, { force: true }),
      fs.rm(mobileLabelPath, { force: true }),
      fs.rm(desktopMaskPath, { force: true }),
      fs.rm(mobileMaskPath, { force: true }),
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
      if (signal?.aborted) return reject(signal.reason ?? new Error("Recording cancelled"));
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg responsiveness exited with code ${code}: ${stderr.slice(-2_000)}`));
    });
  });
}

function estimateTextWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const char of text) {
    if (/[A-Z]/.test(char)) {
      width += 0.65;
    } else if (/[mw]/.test(char)) {
      width += 0.75;
    } else if (/[iltfjr]/.test(char)) {
      width += 0.25;
    } else if (/[a-z]/.test(char)) {
      width += 0.50;
    } else if (/[0-9]/.test(char)) {
      width += 0.55;
    } else if (char === " ") {
      width += 0.28;
    } else {
      width += 0.40;
    }
  }
  return Math.round(width * fontSize);
}
