import { spawn } from "node:child_process";

export async function probeVideoDurationMs(
  inputPath: string,
): Promise<number | null> {
  return new Promise((resolve) => {
    const child = spawn("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      inputPath,
    ]);

    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.on("error", () => resolve(null));
    child.on("close", (code) => {
      if (code !== 0) return resolve(null);
      const seconds = Number(stdout.trim());
      if (!Number.isFinite(seconds) || seconds <= 0) return resolve(null);
      resolve(Math.round(seconds * 1000));
    });
  });
}

export async function probeVideoSize(
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

export async function probeVideoFps(inputPath: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=r_frame_rate",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      inputPath,
    ]);

    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.on("error", () => resolve(60));
    child.on("close", (code) => {
      if (code !== 0) return resolve(60);
      const parts = stdout.trim().split("/");
      if (parts.length === 2) {
        const num = Number(parts[0]);
        const den = Number(parts[1]);
        if (num && den) return resolve(Math.round(num / den));
      }
      const val = Number(stdout.trim());
      if (Number.isFinite(val) && val > 0) return resolve(Math.round(val));
      resolve(60);
    });
  });
}
