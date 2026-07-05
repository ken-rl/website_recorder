import { spawn } from "node:child_process";
import fs from "node:fs/promises";
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
  const inputSize = await probeVideoSize(inputPath);

  const filters: string[] = [];
  if (
    inputSize &&
    (inputSize.width !== evenWidth || inputSize.height !== evenHeight)
  ) {
    filters.push(
      `scale=${evenWidth}:${evenHeight}:flags=lanczos+accurate_rnd+full_chroma_int`,
    );
  }
  filters.push(`fps=${framerate}`);

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

async function probeVideoSize(
  inputPath: string,
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const child = spawn("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "csv=p=0:s=x",
      inputPath,
    ]);

    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.on("error", () => resolve(null));
    child.on("close", (code) => {
      if (code !== 0) return resolve(null);
      const [width, height] = stdout.trim().split("x").map(Number);
      if (!width || !height) return resolve(null);
      resolve({ width, height });
    });
  });
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
