import path from "node:path";
import { readdir, stat } from "node:fs/promises";
import { recordWebsite } from "../../api/src/pipeline/recordWebsite.js";
import type {
  BackgroundPreset,
  RecordRequest,
  ScrollCurvePreset,
  ScrollMode,
  MotionDirection,
} from "../../api/src/types.js";

export type RecordingQuality = "draft" | "standard" | "cinematic";
export type RecordingPace = "slow" | "normal" | "fast";

export interface CreateRecordingInput {
  targetUrl: string;
  quality?: RecordingQuality;
  pace?: RecordingPace;
  viewport?: { width: number; height: number };
  curve?: ScrollCurvePreset;
  customBezier?: [number, number, number, number];
  heroHoldMs?: number;
  durationMs?: number;
  scrollMode?: ScrollMode;
  pauses?: Array<{ selector: string; durationMs: number }>;
  backgroundPreset?: BackgroundPreset;
  addShadow?: boolean;
  roundedCorners?: boolean;
  direction?: MotionDirection;
}

const QUALITY_DEFAULTS: Record<
  RecordingQuality,
  { framerate: number; scale: number; captureMode: "preview" | "export"; fastMode: boolean; delayMs: number }
> = {
  draft: { framerate: 30, scale: 1, captureMode: "export", fastMode: true, delayMs: 500 },
  standard: { framerate: 60, scale: 1, captureMode: "export", fastMode: false, delayMs: 1_500 },
  cinematic: { framerate: 60, scale: 2, captureMode: "export", fastMode: false, delayMs: 2_500 },
};

const PIXELS_PER_FRAME: Record<RecordingPace, number> = {
  slow: 8,
  normal: 14,
  fast: 22,
};

export function assertHttpUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("targetUrl must be an absolute HTTP(S) URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only HTTP(S) URLs are supported");
  }
  return url;
}

export function buildRecordRequest(input: CreateRecordingInput): RecordRequest {
  assertHttpUrl(input.targetUrl);
  const quality = input.quality ?? "standard";
  const defaults = QUALITY_DEFAULTS[quality];
  const curve = input.curve ?? "ease-in-out";
  if (curve === "custom" && !input.customBezier) {
    throw new Error("customBezier is required when curve is custom");
  }
  if (input.direction) {
    const legacyDirectionFields = [
      input.pace,
      input.curve,
      input.customBezier,
      input.heroHoldMs,
      input.durationMs,
      input.pauses,
    ];
    if (legacyDirectionFields.some((value) => value !== undefined)) {
      throw new Error(
        "direction cannot be combined with pace, curve, customBezier, heroHoldMs, durationMs, or pauses",
      );
    }
  }

  const viewport = input.viewport ?? { width: 1920, height: 1080 };
  if (viewport.width < 320 || viewport.height < 240) {
    throw new Error("viewport must be at least 320×240");
  }

  return {
    targetUrl: input.targetUrl,
    exportFormat: "mp4",
    videoConfig: {
      framerate: defaults.framerate,
      viewport: { ...viewport, deviceScaleFactor: defaults.scale },
    },
    animationConfig: {
      captureMode: defaults.captureMode,
      fastMode: defaults.fastMode,
      preRecordingDelayMs: defaults.delayMs,
      scrollMode: input.scrollMode ?? "auto",
      removeOverlayElements: true,
      ...(input.direction
        ? { direction: input.direction }
        : {
            pixelsPerFrame: PIXELS_PER_FRAME[input.pace ?? "normal"],
            heroHoldMs: input.heroHoldMs,
            durationMs: input.durationMs,
            pauseTriggers: input.pauses,
            scrollCurve:
              curve === "custom"
                ? { preset: "custom" as const, bezier: input.customBezier }
                : { preset: curve },
          }),
    },
    backgroundPreset: input.backgroundPreset,
    addShadow: input.addShadow,
    roundedCorners: input.roundedCorners,
  };
}

export function outputRoot(): string {
  return path.resolve(process.env.OUTPUT_DIR ?? "./outputs");
}

export async function createRecording(input: CreateRecordingInput) {
  const request = buildRecordRequest(input);
  return recordWebsite(request, outputRoot());
}

export async function getRecording(jobId: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(jobId)) throw new Error("Invalid jobId");
  const mp4Path = path.join(outputRoot(), jobId, "output.mp4");
  const details = await stat(mp4Path).catch(() => null);
  if (!details?.isFile()) throw new Error("Recording not found");
  return { jobId, mp4Path, sizeBytes: details.size, createdAt: details.birthtime.toISOString() };
}

export async function listRecordings() {
  const root = outputRoot();
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const recordings = await Promise.all(
    entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
      try {
        return await getRecording(entry.name);
      } catch {
        return null;
      }
    }),
  );
  return recordings
    .filter((recording): recording is NonNullable<typeof recording> => Boolean(recording))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
