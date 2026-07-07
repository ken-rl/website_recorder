import { spawn } from "node:child_process";
import path from "node:path";

export interface StitchOptions {
  width?: number;
  height?: number;
  preset?: "fast" | "slow";
}

export async function stitchFramesToVideo(
  framesDir: string,
  outputPath: string,
  fps: number,
  options?: StitchOptions,
): Promise<void> {
  const framePattern = path.join(framesDir, "frame-%06d.jpg");
  const preset = options?.preset ?? "fast";

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
    preset === "fast" ? "26" : "18",
  ];

  // Add scaling filter only if explicitly provided
  if (options?.width && options?.height) {
    args.push(
      "-vf",
      `scale=${options.width}:${options.height}:flags=bicubic`,
    );
  }

  args.push(outputPath);

  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args);

    let stderr = "";
    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
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
