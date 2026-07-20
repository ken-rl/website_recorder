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
  primaryLogo?: string;
  secondaryLogo?: string;
  /** Base64 data URI (PNG/JPEG/WebP/SVG) — when present, rendered as an image badge instead of text. */
  primaryLogoDataUrl?: string;
  /** Base64 data URI (PNG/JPEG/WebP/SVG) — when present, rendered as an image badge instead of text. */
  secondaryLogoDataUrl?: string;
  signal?: AbortSignal;
}

/**
 * Presents two captures as equal cards on one editorial canvas. Both websites
 * are still recorded at the selected full viewport; composition happens only
 * after capture, so the comparison never changes either responsive breakpoint.
 *
 * When primaryLogoDataUrl / secondaryLogoDataUrl are provided, the image is
 * decoded and placed as a scaled overlay in the header bar instead of the
 * coloured text badge. The text label beside it is always shown.
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
    primaryLogo,
    secondaryLogo,
    primaryLogoDataUrl,
    secondaryLogoDataUrl,
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

  // Subtle drop shadow: a blurred, semi-transparent copy of each panel is placed
  // slightly below the panel itself — mirroring the CSS box-shadow on the UI preview.
  const shadowOffsetY = Math.max(4, Math.round(height * 0.005));
  const shadowBlur = Math.max(8, Math.round(height * 0.012));
  const shadowAlpha = 0.22; // opacity of the blurred shadow layer

  // --- Logo text fallbacks ---
  const primaryLogoText = (primaryLogo || "A").trim() || "A";
  const secondaryLogoText = (secondaryLogo || "B").trim() || "B";
  const cleanPrimaryLogo = primaryLogoText.replaceAll("'", "\\'");
  const cleanSecondaryLogo = secondaryLogoText.replaceAll("'", "\\'");

  const primaryBadgeW = primaryLogoText.length > 1
    ? Math.max(sideBadgeSize, Math.round(sideBadgeSize * (0.4 + 0.6 * primaryLogoText.length)))
    : sideBadgeSize;
  const secondaryBadgeW = secondaryLogoText.length > 1
    ? Math.max(sideBadgeSize, Math.round(sideBadgeSize * (0.4 + 0.6 * secondaryLogoText.length)))
    : sideBadgeSize;

  // --- Temp files ---
  const primaryLabelPath = path.join(outputDir, ".comparison-primary.txt");
  const secondaryLabelPath = path.join(outputDir, ".comparison-secondary.txt");
  const maskPath = path.join(outputDir, ".comparison-mask.png");

  // Logo images: write raw bytes with the correct extension, then convert to PNG via ffmpeg.
  // This handles PNG, JPEG, WebP, and SVG (if librsvg is available) uniformly since ffmpeg
  // can reliably probe any of these formats when the extension matches, and the PNG output
  // is guaranteed to work with -loop 1 in the main composition.
  const primaryLogoRaw = primaryLogoDataUrl
    ? path.join(outputDir, `.comparison-logo-primary-raw${mimeToExt(primaryLogoDataUrl)}`)
    : undefined;
  const primaryLogoPath = primaryLogoDataUrl
    ? path.join(outputDir, ".comparison-logo-primary.png")
    : undefined;
  const secondaryLogoRaw = secondaryLogoDataUrl
    ? path.join(outputDir, `.comparison-logo-secondary-raw${mimeToExt(secondaryLogoDataUrl)}`)
    : undefined;
  const secondaryLogoPath = secondaryLogoDataUrl
    ? path.join(outputDir, ".comparison-logo-secondary.png")
    : undefined;

  await Promise.all([
    fs.writeFile(primaryLabelPath, primaryLabel.replace(/\s+/g, " "), "utf8"),
    fs.writeFile(secondaryLabelPath, secondaryLabel.replace(/\s+/g, " "), "utf8"),
    primaryLogoRaw && primaryLogoDataUrl
      ? fs.writeFile(primaryLogoRaw, dataUrlToBuffer(primaryLogoDataUrl))
      : Promise.resolve(),
    secondaryLogoRaw && secondaryLogoDataUrl
      ? fs.writeFile(secondaryLogoRaw, dataUrlToBuffer(secondaryLogoDataUrl))
      : Promise.resolve(),
  ]);

  // Convert raw logo images to PNG so ffmpeg can reliably decode them as still frames.
  await Promise.all([
    primaryLogoRaw && primaryLogoPath
      ? convertImageToPng(primaryLogoRaw, primaryLogoPath, signal)
      : Promise.resolve(),
    secondaryLogoRaw && secondaryLogoPath
      ? convertImageToPng(secondaryLogoRaw, secondaryLogoPath, signal)
      : Promise.resolve(),
  ]);

  await createRoundedMask(maskPath, panelWidth, panelHeight, cornerRadius, signal);

  // --- Build ffmpeg inputs & filter ---
  const primaryText = escapeFilterPath(primaryLabelPath);
  const secondaryText = escapeFilterPath(secondaryLabelPath);
  // Scale each panel video to fit within the panel (letterboxed, no crop) and centre it.
  // The canvas background color is used as padding so there's no black bars.
  const panelBg = "0xf1f4ed";
  const panel = (input: string, mask: string, output: string) =>
    `[${input}]setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=${durationSeconds},` +
    `trim=duration=${durationSeconds},scale=${panelWidth}:${panelHeight}:force_original_aspect_ratio=decrease:` +
    `flags=lanczos,pad=${panelWidth}:${panelHeight}:(ow-iw)/2:(oh-ih)/2:color=${panelBg},` +
    `setsar=1,format=rgba[${output}-base];` +
    `[${output}-base][${mask}]alphamerge[${output}]`;

  const labelY = Math.max(8, Math.round((panelTop - fontSize) / 2));
  // Logo image is scaled to a square that fits within sideBadgeSize, preserving aspect ratio.
  const logoImgSize = sideBadgeSize;

  // Build static input list: 0=primary video, 1=secondary video, 2=mask, then optional logos.
  const extraInputs: string[] = [];
  let nextInput = 3; // 0,1,2 are already used

  let primaryLogoInputIdx: number | undefined;
  if (primaryLogoPath) {
    extraInputs.push("-loop", "1", "-framerate", String(fps), "-i", primaryLogoPath);
    primaryLogoInputIdx = nextInput++;
  }

  let secondaryLogoInputIdx: number | undefined;
  if (secondaryLogoPath) {
    extraInputs.push("-loop", "1", "-framerate", String(fps), "-i", secondaryLogoPath);
    secondaryLogoInputIdx = nextInput++;
  }

  // Build filter_complex segments
  const filterParts: string[] = [
    "[2:v]format=gray,split=2[mask-a][mask-b]",
    panel("0:v", "mask-a", "left"),
    panel("1:v", "mask-b", "right"),
    `color=c=0xf1f4ed:s=${width}x${height}:r=${fps}:d=${durationSeconds}[canvas]`,
  ];

  // Build header filter: only draw the coloured badge box when no image logo is provided.
  // When an image logo is used, the image is overlaid directly on the canvas background
  // (no coloured rectangle behind it) so logos appear without any background colour.
  const headerParts: string[] = [];

  const gap = Math.round(width * 0.012);

  // Primary Side Centering
  const primaryTextW = estimateTextWidth(primaryLabel, fontSize);
  const primaryLogoW = primaryLogoPath ? logoImgSize : primaryBadgeW;
  const primaryTotalW = primaryLogoW + gap + primaryTextW;
  const primaryCenter = outerMargin + Math.round(panelWidth / 2);
  const primaryLogoX = primaryCenter - Math.round(primaryTotalW / 2);
  const primaryLabelX = primaryLogoX + primaryLogoW + gap;

  if (!primaryLogoPath) {
    headerParts.push(
      `drawbox=x=${primaryLogoX}:y=${labelY}:w=${primaryBadgeW}:h=${sideBadgeSize}:color=0x3158c9:t=fill`,
      `drawtext=text='${cleanPrimaryLogo}':expansion=none:fontcolor=white:` +
        `fontsize=${Math.round(sideBadgeSize * 0.52)}:x=${primaryLogoX}+(${primaryBadgeW}-text_w)/2:` +
        `y=${labelY}+(${sideBadgeSize}-text_h)/2`,
    );
  }
  headerParts.push(
    `drawtext=textfile='${primaryText}':expansion=none:fontcolor=0x171914:fontsize=${fontSize}:` +
      `x=${primaryLabelX}:y=${labelY}+(${sideBadgeSize}-text_h)/2`,
  );

  // Secondary Side Centering
  const secondaryTextW = estimateTextWidth(secondaryLabel, fontSize);
  const secondaryLogoW = secondaryLogoPath ? logoImgSize : secondaryBadgeW;
  const secondaryTotalW = secondaryLogoW + gap + secondaryTextW;
  const secondaryCenter = secondaryX + Math.round(panelWidth / 2);
  const secondaryLogoX = secondaryCenter - Math.round(secondaryTotalW / 2);
  const secondaryLabelX = secondaryLogoX + secondaryLogoW + gap;

  if (!secondaryLogoPath) {
    headerParts.push(
      `drawbox=x=${secondaryLogoX}:y=${labelY}:w=${secondaryBadgeW}:h=${sideBadgeSize}:color=0x087e72:t=fill`,
      `drawtext=text='${cleanSecondaryLogo}':expansion=none:fontcolor=white:` +
        `fontsize=${Math.round(sideBadgeSize * 0.52)}:` +
        `x=${secondaryLogoX}+(${secondaryBadgeW}-text_w)/2:y=${labelY}+(${sideBadgeSize}-text_h)/2`,
    );
  }
  headerParts.push(
    `drawtext=textfile='${secondaryText}':expansion=none:fontcolor=0x171914:fontsize=${fontSize}:` +
      `x=${secondaryLabelX}:y=${labelY}+(${sideBadgeSize}-text_h)/2`,
  );

  const headerFilter = `[canvas]${headerParts.join(",")}[headed]`;
  filterParts.push(headerFilter);

  // Overlay logo images on top of the header if provided, chaining the stream
  let currentStream = "headed";

  if (primaryLogoInputIdx !== undefined) {
    const logoOut = "headed-p";
    // Scale logo to fit within the badge square, maintain aspect ratio, pad to square with transparent bg.
    filterParts.push(
      `[${primaryLogoInputIdx}:v]scale=${logoImgSize}:${logoImgSize}:force_original_aspect_ratio=decrease,` +
        `pad=${logoImgSize}:${logoImgSize}:(ow-iw)/2:(oh-ih)/2:color=0x00000000,format=rgba,setsar=1[logo-p]`,
      `[${currentStream}][logo-p]overlay=${primaryLogoX}:${labelY}:shortest=1[${logoOut}]`,
    );
    currentStream = logoOut;
  }

  if (secondaryLogoInputIdx !== undefined) {
    const logoOut = "headed-s";
    filterParts.push(
      `[${secondaryLogoInputIdx}:v]scale=${logoImgSize}:${logoImgSize}:force_original_aspect_ratio=decrease,` +
        `pad=${logoImgSize}:${logoImgSize}:(ow-iw)/2:(oh-ih)/2:color=0x00000000,format=rgba,setsar=1[logo-s]`,
      `[${currentStream}][logo-s]overlay=${secondaryLogoX}:${labelY}:shortest=1[${logoOut}]`,
    );
    currentStream = logoOut;
  }

  // Split each panel into (original, shadow-source), blur the shadow copy, then
  // overlay: shadow (offset) → original — giving a subtle soft drop shadow.
  filterParts.push(
    `[left]split=2[left-orig][left-sh-in]`,
    `[left-sh-in]gblur=sigma=${shadowBlur},colorchannelmixer=aa=${shadowAlpha}[left-sh]`,
    `[right]split=2[right-orig][right-sh-in]`,
    `[right-sh-in]gblur=sigma=${shadowBlur},colorchannelmixer=aa=${shadowAlpha}[right-sh]`,
    `[${currentStream}][left-sh]overlay=${outerMargin}:${panelTop + shadowOffsetY}:shortest=1[with-ls]`,
    `[with-ls][left-orig]overlay=${outerMargin}:${panelTop}:shortest=1[first]`,
    `[first][right-sh]overlay=${secondaryX}:${panelTop + shadowOffsetY}:shortest=1[with-rs]`,
    `[with-rs][right-orig]overlay=${secondaryX}:${panelTop}:shortest=1,setsar=1,fps=${fps},format=yuv420p[video]`,
  );

  const filter = filterParts.join(";");

  try {
    await runFfmpeg([
      "-y",
      "-i", primaryPath,
      "-i", secondaryPath,
      "-loop", "1",
      "-framerate", String(fps),
      "-i", maskPath,
      ...extraInputs,
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
      primaryLogoPath ? fs.rm(primaryLogoPath, { force: true }) : Promise.resolve(),
      secondaryLogoPath ? fs.rm(secondaryLogoPath, { force: true }) : Promise.resolve(),
      primaryLogoRaw ? fs.rm(primaryLogoRaw, { force: true }) : Promise.resolve(),
      secondaryLogoRaw ? fs.rm(secondaryLogoRaw, { force: true }) : Promise.resolve(),
    ]);
  }
}

/** Decode a data URI string into a raw Buffer. */
function dataUrlToBuffer(dataUrl: string): Buffer {
  const commaIdx = dataUrl.indexOf(",");
  if (commaIdx === -1) throw new Error("Invalid data URI: missing comma separator");
  const base64 = dataUrl.slice(commaIdx + 1);
  return Buffer.from(base64, "base64");
}

/** Map a data URI MIME type to a file extension ffmpeg understands. */
function mimeToExt(dataUrl: string): string {
  if (dataUrl.startsWith("data:image/png")) return ".png";
  if (dataUrl.startsWith("data:image/jpeg")) return ".jpg";
  if (dataUrl.startsWith("data:image/webp")) return ".webp";
  if (dataUrl.startsWith("data:image/svg+xml")) return ".svg";
  return ".png"; // safe default
}

/**
 * Transcodes any still image (PNG/JPEG/WebP/SVG) into a normalized PNG that
 * ffmpeg can reliably decode as a looped video input.
 */
async function convertImageToPng(inputPath: string, outputPath: string, signal?: AbortSignal) {
  await runFfmpeg([
    "-y",
    "-i", inputPath,
    "-vf", "format=rgba",
    "-frames:v", "1",
    "-c:v", "png",
    outputPath,
  ], signal);
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

