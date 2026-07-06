import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const COLOR_DIFF_THRESHOLD = 30;
const MIN_ACTIVE_RATIO = 0.02;
const MAX_MARGIN_RATIO = 0.12;

export interface VideoMargins {
  right: number;
  bottom: number;
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

function columnActive(
  buffer: Buffer,
  width: number,
  height: number,
  x: number,
  bg: [number, number, number],
) {
  const step = 4;
  const samples = Math.ceil(height / step);
  let active = 0;

  for (let y = 0; y < height; y += step) {
    const offset = (y * width + x) * 3;
    const diff =
      Math.abs(buffer[offset] - bg[0]) +
      Math.abs(buffer[offset + 1] - bg[1]) +
      Math.abs(buffer[offset + 2] - bg[2]);
    if (diff > COLOR_DIFF_THRESHOLD) {
      active += 1;
    }
  }

  return active / samples >= MIN_ACTIVE_RATIO;
}

function rowActive(
  buffer: Buffer,
  width: number,
  height: number,
  y: number,
  bg: [number, number, number],
) {
  const step = 4;
  const samples = Math.ceil(width / step);
  let active = 0;

  for (let x = 0; x < width; x += step) {
    const offset = (y * width + x) * 3;
    const diff =
      Math.abs(buffer[offset] - bg[0]) +
      Math.abs(buffer[offset + 1] - bg[1]) +
      Math.abs(buffer[offset + 2] - bg[2]);
    if (diff > COLOR_DIFF_THRESHOLD) {
      active += 1;
    }
  }

  return active / samples >= MIN_ACTIVE_RATIO;
}

export async function detectVideoMargins(
  videoPath: string,
  sampleTimeSec = 0.5,
): Promise<VideoMargins> {
  const size = await probeVideoSize(videoPath);
  if (!size) {
    return { right: 0, bottom: 0 };
  }

  const { width, height } = size;
  const rawPath = path.join(
    os.tmpdir(),
    `websiterecorder-margin-${process.pid}-${Date.now()}.raw`,
  );

  try {
    await runFfmpeg([
      "-y",
      "-ss",
      String(sampleTimeSec),
      "-i",
      videoPath,
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      rawPath,
    ]);

    const buffer = await fs.readFile(rawPath);
    const expected = width * height * 3;
    if (buffer.length < expected) {
      return { right: 0, bottom: 0 };
    }

    const bgOffset = ((height - 1) * width + (width - 1)) * 3;
    const bg: [number, number, number] = [
      buffer[bgOffset],
      buffer[bgOffset + 1],
      buffer[bgOffset + 2],
    ];

    let contentMaxX = 0;
    for (let x = 0; x < width; x += 1) {
      if (columnActive(buffer, width, height, x, bg)) {
        contentMaxX = x;
      }
    }

    let contentMaxY = 0;
    for (let y = 0; y < height; y += 1) {
      if (rowActive(buffer, width, height, y, bg)) {
        contentMaxY = y;
      }
    }

    const right = Math.max(0, width - 1 - contentMaxX);
    const bottom = Math.max(0, height - 1 - contentMaxY);

    if (
      right > width * MAX_MARGIN_RATIO ||
      bottom > height * MAX_MARGIN_RATIO
    ) {
      return { right: 0, bottom: 0 };
    }

    if (right < 3 && bottom < 3) {
      return { right: 0, bottom: 0 };
    }

    return { right, bottom };
  } catch {
    return { right: 0, bottom: 0 };
  } finally {
    await fs.unlink(rawPath).catch(() => undefined);
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
