import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import type { BackgroundPreset } from "../types.js";
import { probeVideoDurationMs, probeVideoFps, probeVideoSize } from "../transcode/probe.js";
import type { EncodeSettings } from "../transcode/quality.js";

const PRESET_FILES: Record<Exclude<BackgroundPreset, "none">, string> = {
  gray_noise_gradient: "gray_noise_gradient.png",
  paper_blue: "paper_blue.png",
  red_blocks_gradient: "red_blocks_gradient.png",
};

const CONTENT_SCALE = 0.84;

export async function frameVideoOnBackground(options: {
  inputPath: string;
  outputPath: string;
  preset: Exclude<BackgroundPreset, "none">;
  addShadow: boolean;
  roundedCorners?: boolean;
  encode: EncodeSettings;
}): Promise<void> {
  const { inputPath, outputPath, preset, addShadow, roundedCorners = false, encode } = options;
  const size = await probeVideoSize(inputPath);
  if (!size) throw new Error("Could not read video dimensions for background export");
  const fps = (await probeVideoFps(inputPath)) ?? 30;
  const durationMs = await probeVideoDurationMs(inputPath);

  const width = even(size.width);
  const height = even(size.height);
  const contentWidth = even(Math.round(width * CONTENT_SCALE));
  const contentHeight = even(Math.round(height * CONTENT_SCALE));
  const x = Math.floor((width - contentWidth) / 2);
  const y = Math.floor((height - contentHeight) / 2);
  const cornerRadius = roundedCorners
    ? Math.max(6, Math.round(Math.min(contentWidth, contentHeight) * 0.014))
    : 0;
  const backgroundPath = await resolvePresetPath(PRESET_FILES[preset]);

  // Corners and shadows do not change from frame to frame. Building them once
  // avoids running geq/gblur thousands of times on long recordings.
  const staticLayers = await createStaticLayers({
    outputPath,
    width,
    height,
    contentWidth,
    contentHeight,
    x,
    y,
    cornerRadius,
    addShadow,
  });

  try {
    const filters = [
      `[1:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1[bg]`,
      `[0:v]scale=${contentWidth}:${contentHeight}:flags=lanczos,setsar=1,format=rgba[card-base]`,
    ];
    const inputs = ["-y", "-i", inputPath, "-loop", "1", "-framerate", String(fps), "-i", backgroundPath];
    let inputIndex = 2;

    if (staticLayers.maskPath) {
      inputs.push("-loop", "1", "-framerate", String(fps), "-i", staticLayers.maskPath);
      filters.push(`[${inputIndex}:v]format=gray[mask]`, `[card-base][mask]alphamerge[card]`);
      inputIndex += 1;
    } else {
      filters.push("[card-base]copy[card]");
    }

    if (staticLayers.shadowPath) {
      inputs.push("-loop", "1", "-framerate", String(fps), "-i", staticLayers.shadowPath);
      filters.push(
        `[${inputIndex}:v]format=rgba[shadow]`,
        "[bg][shadow]overlay=0:0[canvas]",
        `[canvas][card]overlay=${x}:${y}:shortest=1,fps=${fps},format=yuv420p[output]`,
      );
    } else {
      filters.push(`[bg][card]overlay=${x}:${y}:shortest=1,fps=${fps},format=yuv420p[output]`);
    }

    await runFfmpeg([
      ...inputs,
      "-filter_complex",
      filters.join(";"),
      "-map",
      "[output]",
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      encode.preset,
      "-crf",
      String(encode.crf),
      "-pix_fmt",
      "yuv420p",
      ...(durationMs ? ["-t", (durationMs / 1000).toFixed(3)] : []),
      "-shortest",
      "-movflags",
      "+faststart",
      outputPath,
    ]);
  } finally {
    await Promise.all(staticLayers.files.map((file) => fs.unlink(file).catch(() => undefined)));
  }
}

async function createStaticLayers(options: {
  outputPath: string;
  width: number;
  height: number;
  contentWidth: number;
  contentHeight: number;
  x: number;
  y: number;
  cornerRadius: number;
  addShadow: boolean;
}) {
  const { outputPath, width, height, contentWidth, contentHeight, x, y, cornerRadius, addShadow } = options;
  if (!cornerRadius && !addShadow) return { files: [], maskPath: undefined, shadowPath: undefined };

  const id = randomUUID();
  const dir = path.dirname(outputPath);
  const maskPath = path.join(dir, `.style-mask-${id}.png`);
  const shadowPath = addShadow ? path.join(dir, `.style-shadow-${id}.png`) : undefined;
  const maskFilter = cornerRadius ? roundedMaskFilter(cornerRadius) : "format=gray";

  await runFfmpeg([
    "-y", "-f", "lavfi", "-i", `color=c=white:s=${contentWidth}x${contentHeight}:r=1`,
    "-vf", maskFilter,
    "-frames:v", "1", "-c:v", "png", maskPath,
  ]);

  if (shadowPath) {
    const shadowY = y + Math.max(3, Math.round(height * 0.006));
    const shadowBlur = Math.max(12, Math.round(Math.min(width, height) * 0.016));
    await runFfmpeg([
      "-y", "-i", maskPath,
      "-f", "lavfi", "-i", `color=c=black:s=${contentWidth}x${contentHeight}:r=1`,
      "-filter_complex",
      `[0:v]format=gray[mask];[1:v]format=rgba[black];[black][mask]alphamerge,pad=${width}:${height}:${x}:${shadowY}:color=black@0,format=rgba,colorchannelmixer=aa=0.16,gblur=sigma=${shadowBlur}:steps=2[output]`,
      "-map", "[output]", "-frames:v", "1", "-c:v", "png", shadowPath,
    ]);
  }

  return {
    files: shadowPath ? [maskPath, shadowPath] : [maskPath],
    maskPath: cornerRadius ? maskPath : undefined,
    shadowPath,
  };
}

function roundedMaskFilter(radius: number) {

  const right = `W-${radius}`;
  const bottom = `H-${radius}`;
  const outsideCorner = [
    `lt(X,${radius})*lt(Y,${radius})*gt(hypot(X-${radius},Y-${radius}),${radius})`,
    `gt(X,${right})*lt(Y,${radius})*gt(hypot(X-(${right}),Y-${radius}),${radius})`,
    `lt(X,${radius})*gt(Y,${bottom})*gt(hypot(X-${radius},Y-(${bottom})),${radius})`,
    `gt(X,${right})*gt(Y,${bottom})*gt(hypot(X-(${right}),Y-(${bottom})),${radius})`,
  ].join("+");

  return `format=gray,geq=lum='if(gt(${outsideCorner},0),0,255)'`;
}

async function resolvePresetPath(filename: string) {
  const apiPublicDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../public/background_presets",
  );
  const builtPath = path.join(apiPublicDir, filename);
  if (await exists(builtPath)) return builtPath;

  // During Vite development, its public directory is the authoritative source.
  const webPublicPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../web/public/background_presets",
    filename,
  );
  if (await exists(webPublicPath)) return webPublicPath;

  throw new Error(`Background preset is unavailable: ${filename}`);
}

function even(value: number) {
  return value % 2 === 0 ? value : value - 1;
}

async function exists(filePath: string) {
  return fs.access(filePath).then(() => true).catch(() => false);
}

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Background render failed with code ${code}: ${stderr.slice(-2000)}`));
    });
  });
}
