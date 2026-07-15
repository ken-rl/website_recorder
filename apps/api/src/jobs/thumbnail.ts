import { spawn } from "node:child_process";

export async function createVideoThumbnail(
  inputPath: string,
  outputPath: string,
  signal?: AbortSignal,
) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", [
      "-y",
      "-ss",
      "0",
      "-i",
      inputPath,
      "-frames:v",
      "1",
      "-vf",
      "scale=640:-2",
      "-q:v",
      "3",
      outputPath,
    ], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    const abort = () => child.kill("SIGTERM");
    signal?.addEventListener("abort", abort, { once: true });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      signal?.removeEventListener("abort", abort);
      if (signal?.aborted) reject(signal.reason ?? new Error("Cancelled"));
      else if (code === 0) resolve();
      else reject(new Error(`Thumbnail generation failed: ${stderr.slice(-1000)}`));
    });
  });
}
