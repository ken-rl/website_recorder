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
  let dH = even(Math.round(panelHeight * 0.78));
  let dW = even(Math.round(dH * desktopAspect));

  // Give the narrow secondary device enough visual weight to inspect its UI.
  let mH = even(panelHeight);
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

  // Pre-render shadows once: cleaner edges and no per-frame blur cost.
  const shadowOffsetY = Math.max(1, Math.round(height * 0.0015));
  const shadowBlur = Math.max(12, Math.round(height * 0.018));
  const shadowAlpha = 0.15;
  const shadowPad = Math.ceil(shadowBlur * 3);

  // --- Temp files ---
  const desktopLabelPath = path.join(outputDir, ".responsiveness-desktop.txt");
  const mobileLabelPath = path.join(outputDir, ".responsiveness-mobile.txt");
  const desktopMaskPath = path.join(outputDir, ".responsiveness-mask-desktop.png");
  const mobileMaskPath = path.join(outputDir, ".responsiveness-mask-mobile.png");
  const desktopShadowPath = path.join(outputDir, ".responsiveness-shadow-desktop.png");
  const mobileShadowPath = path.join(outputDir, ".responsiveness-shadow-mobile.png");

  await Promise.all([
    fs.writeFile(desktopLabelPath, desktopLabel.replace(/\s+/g, " "), "utf8"),
    fs.writeFile(mobileLabelPath, mobileLabel.replace(/\s+/g, " "), "utf8"),
    createRoundedMask(desktopMaskPath, dW, dH, dCornerRadius, signal),
    createRoundedMask(mobileMaskPath, mW, mH, mCornerRadius, signal),
  ]);
  await Promise.all([
    createShadowFromMask(desktopMaskPath, desktopShadowPath, dW, dH, shadowPad, shadowBlur, shadowAlpha, signal),
    createShadowFromMask(mobileMaskPath, mobileShadowPath, mW, mH, shadowPad, shadowBlur, shadowAlpha, signal),
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

  filterParts.push(
    `[4:v]format=rgba[desktop-shadow]`,
    `[5:v]format=rgba[mobile-shadow]`,
    `[${currentStream}][desktop-shadow]overlay=${desktopX - shadowPad}:${desktopY + shadowOffsetY - shadowPad}:shortest=1[with-ds]`,
    `[with-ds][desktop-in]overlay=${desktopX}:${desktopY}:shortest=1[first]`,
    `[first][mobile-shadow]overlay=${mobileX - shadowPad}:${mobileY + shadowOffsetY - shadowPad}:shortest=1[with-ms]`,
    `[with-ms][mobile-in]overlay=${mobileX}:${mobileY}:shortest=1,setsar=1,fps=${fps},format=yuv420p[video]`,
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
      "-loop", "1",
      "-framerate", String(fps),
      "-i", desktopShadowPath,
      "-loop", "1",
      "-framerate", String(fps),
      "-i", mobileShadowPath,
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
      fs.rm(desktopShadowPath, { force: true }),
      fs.rm(mobileShadowPath, { force: true }),
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
  const supersample = 2;
  const scaledWidth = width * supersample;
  const scaledHeight = height * supersample;
  const scaledRadius = radius * supersample;
  const right = `W-${scaledRadius}`;
  const bottom = `H-${scaledRadius}`;
  const outsideCorner = [
    `lt(X,${scaledRadius})*lt(Y,${scaledRadius})*gt(hypot(X-${scaledRadius},Y-${scaledRadius}),${scaledRadius})`,
    `gt(X,${right})*lt(Y,${scaledRadius})*gt(hypot(X-(${right}),Y-${scaledRadius}),${scaledRadius})`,
    `lt(X,${scaledRadius})*gt(Y,${bottom})*gt(hypot(X-${scaledRadius},Y-(${bottom})),${scaledRadius})`,
    `gt(X,${right})*gt(Y,${bottom})*gt(hypot(X-(${right}),Y-(${bottom})),${scaledRadius})`,
  ].join("+");
  await runFfmpeg([
    "-y",
    "-f", "lavfi",
    "-i", `color=c=white:s=${scaledWidth}x${scaledHeight}:r=1`,
    "-vf", `format=gray,geq=lum='if(gt(${outsideCorner},0),0,255)',scale=${width}:${height}:flags=lanczos,gblur=sigma=0.65:steps=1`,
    "-frames:v", "1",
    "-c:v", "png",
    outputPath,
  ], signal);
}

async function createShadowFromMask(
  maskPath: string,
  outputPath: string,
  width: number,
  height: number,
  pad: number,
  blur: number,
  alpha: number,
  signal?: AbortSignal,
) {
  await runFfmpeg([
    "-y", "-i", maskPath,
    "-f", "lavfi", "-i", `color=c=black:s=${width}x${height}:r=1`,
    "-filter_complex",
    `[1:v]format=rgba[black];[0:v]format=gray[mask];` +
      `[black][mask]alphamerge,pad=${width + pad * 2}:${height + pad * 2}:${pad}:${pad}:color=black@0,` +
      `colorchannelmixer=aa=${alpha},gblur=sigma=${blur}:steps=2[shadow]`,
    "-map", "[shadow]", "-frames:v", "1", "-c:v", "png", outputPath,
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
