import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { detectVideoMargins } from "../capture/detectMargins.js";
import type { EncodeSettings } from "./quality.js";

export async function transcodeToMp4(
  inputPath: string,
  outputPath: string,
  framerate: number,
  width: number,
  height: number,
  encode: EncodeSettings,
) {
  await assertFfmpegAvailable();

  const evenWidth = width % 2 === 0 ? width : width - 1;
  const evenHeight = height % 2 === 0 ? height : height - 1;
  const margins = await detectVideoMargins(inputPath);

  const filters: string[] = [];
  if (margins.right > 0 || margins.bottom > 0) {
    console.log(
      `Trimming recorder margins: right=${margins.right}px bottom=${margins.bottom}px`,
    );
    filters.push(`crop=iw-${margins.right}:ih-${margins.bottom}:0:0`);
  }
  filters.push(
    `scale=${evenWidth}:${evenHeight}:flags=lanczos+accurate_rnd+full_chroma_int`,
    "setsar=1",
    `fps=${framerate}`,
  );

  const args = [
    "-y",
    "-i",
    inputPath,
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
    "-vf",
    filters.join(","),
    outputPath,
  ];

  await runFfmpeg(args);
}

async function assertFfmpegAvailable() {
  try {
    await runFfmpeg(["-version"]);
  } catch {
    throw new Error("ffmpeg is required but was not found on PATH");
  }
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

export async function removeFileIfExists(filePath: string) {
  await fs.unlink(filePath).catch(() => undefined);
}
