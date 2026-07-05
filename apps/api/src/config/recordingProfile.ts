import type { RecordRequest } from "../types.js";
import {
  resolveEncodeSettings,
  type EncodeSettings,
} from "../transcode/quality.js";

export interface RecordingProfile {
  pixelsPerFrame: number;
  preRecordingDelayMs: number;
  encode: EncodeSettings;
  hydrateFast: boolean;
}

const FAST_ENCODE: EncodeSettings = {
  crf: 22,
  preset: "fast",
  deviceScaleFactor: 1,
};

export function resolveRecordingProfile(
  request: RecordRequest,
): RecordingProfile {
  const animation = request.animationConfig ?? {};
  const fastMode = animation.fastMode ?? false;

  if (fastMode) {
    return {
      pixelsPerFrame: animation.pixelsPerFrame ?? 12,
      preRecordingDelayMs: animation.preRecordingDelayMs ?? 500,
      encode: FAST_ENCODE,
      hydrateFast: true,
    };
  }

  return {
    pixelsPerFrame: animation.pixelsPerFrame ?? 4,
    preRecordingDelayMs: animation.preRecordingDelayMs ?? 2000,
    encode: resolveEncodeSettings(
      request.videoConfig.qualityPreset,
      request.videoConfig.viewport.deviceScaleFactor,
    ),
    hydrateFast: false,
  };
}
