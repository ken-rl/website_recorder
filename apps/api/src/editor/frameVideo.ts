import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BackgroundPreset } from "../types.js";
import { probeVideoFps, probeVideoSize } from "../transcode/probe.js";
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

  const filters = [
    `[1:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1[bg]`,
    `[0:v]scale=${contentWidth}:${contentHeight}:flags=lanczos,setsar=1,format=rgba${roundedCornerFilter(cornerRadius)}[card]`,
  ];

  if (addShadow) {
    filters.push(
      `[card]split[card-output][card-shadow]`,
      `[card-shadow]colorchannelmixer=rr=0:gg=0:bb=0:aa=0.16,gblur=sigma=22:steps=2[shadow]`,
      `[bg][shadow]overlay=${x}:${y + Math.max(3, Math.round(height * 0.006))}[canvas]`,
      `[canvas][card-output]overlay=${x}:${y}:shortest=1,fps=${fps},format=yuv420p[output]`,
    );
  } else {
    filters.push(`[bg][card]overlay=${x}:${y}:shortest=1,fps=${fps},format=yuv420p[output]`);
  }

  await runFfmpeg([
    "-y",
    "-i",
    inputPath,
    "-loop",
    "1",
    "-i",
    backgroundPath,
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
    "-shortest",
    "-movflags",
    "+faststart",
    outputPath,
  ]);
}

function roundedCornerFilter(radius: number) {
  if (radius === 0) return "";

  const right = `W-${radius}`;
  const bottom = `H-${radius}`;
  const outsideCorner = [
    `lt(X,${radius})*lt(Y,${radius})*gt(hypot(X-${radius},Y-${radius}),${radius})`,
    `gt(X,${right})*lt(Y,${radius})*gt(hypot(X-(${right}),Y-${radius}),${radius})`,
    `lt(X,${radius})*gt(Y,${bottom})*gt(hypot(X-${radius},Y-(${bottom})),${radius})`,
    `gt(X,${right})*gt(Y,${bottom})*gt(hypot(X-(${right}),Y-(${bottom})),${radius})`,
  ].join("+");

  return `,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(gt(${outsideCorner},0),0,255)',gblur=sigma=0.35:steps=1`;
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
