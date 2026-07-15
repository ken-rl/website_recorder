import { spawn } from "node:child_process";
import path from "node:path";

export interface StitchOptions {
  width?: number;
  height?: number;
  preset?: string;
  crf?: number;
  signal?: AbortSignal;
}

export async function stitchFramesToVideo(
  framesDir: string,
  outputPath: string,
  fps: number,
  options?: StitchOptions,
): Promise<void> {
  const framePattern = path.join(framesDir, "frame-%06d.jpg");
  const preset = options?.preset ?? "fast";
  const crf = options?.crf ?? (preset === "fast" ? 26 : 18);

  const args = [
    "-y",
    "-framerate",
    String(fps),
    "-i",
    framePattern,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    preset,
    "-crf",
    String(crf),
  ];

  // Add scaling/padding filters to ensure width and height are divisible by 2 for libx264
  const vfFilters: string[] = [];
  if (options?.width && options?.height) {
    const evenW = options.width % 2 === 0 ? options.width : options.width - 1;
    const evenH = options.height % 2 === 0 ? options.height : options.height - 1;
    vfFilters.push(`scale=${evenW}:${evenH}:flags=bicubic`);
  } else {
    vfFilters.push("scale=trunc(iw/2)*2:trunc(ih/2)*2");
  }

  if (vfFilters.length > 0) {
    args.push("-vf", vfFilters.join(","));
  }

  args.push(outputPath);

  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args);
    const abort = () => proc.kill("SIGTERM");
    options?.signal?.addEventListener("abort", abort, { once: true });

    let stderr = "";
    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      options?.signal?.removeEventListener("abort", abort);
      if (options?.signal?.aborted) {
        reject(options.signal.reason ?? new Error("Cancelled"));
      } else if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(`FFmpeg stitch failed with code ${code}: ${stderr}`),
        );
      }
    });

    proc.on("error", (error) => {
      reject(error);
    });
  });
}
