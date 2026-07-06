export interface ViewportConfig {
  width: number;
  height: number;
  deviceScaleFactor?: number;
}

export interface PauseTrigger {
  selector: string;
  durationMs: number;
}

export interface VideoConfig {
  framerate?: number;
  qualityPreset?: "high" | "medium" | "low";
  viewport: ViewportConfig;
}

export type ScrollCurvePreset =
  | "linear"
  | "ease-in"
  | "ease-out"
  | "ease-in-out"
  | "ease-in-cubic"
  | "ease-out-cubic"
  | "ease-in-out-cubic"
  | "custom";

export interface ScrollCurve {
  preset?: ScrollCurvePreset;
  /** CSS cubic-bezier control points [x1, y1, x2, y2]. Required when preset is "custom". */
  bezier?: [number, number, number, number];
}

export type ScrollMode = "auto" | "document" | "virtual";

export interface AnimationConfig {
  pixelsPerFrame?: number;
  preRecordingDelayMs?: number;
  removeOverlayElements?: boolean;
  pauseTriggers?: PauseTrigger[];
  scrollCurve?: ScrollCurve;
  /**
   * How to drive scrolling. `auto` picks document scrolling or virtual wheel
   * scrolling based on page layout (fixed viewport / infinite scroll sites).
   */
  scrollMode?: ScrollMode;
  /** Virtual-scroll only: viewport-heights worth of wheel input to replay. */
  virtualScrollCycles?: number;
  /** Virtual-scroll only: total capture duration in milliseconds. */
  virtualScrollDurationMs?: number;
  /** Skip deep hydration, scroll faster, and use quick encoding. */
  fastMode?: boolean;
}

export interface RecordRequest {
  targetUrl: string;
  exportFormat?: "mp4";
  videoConfig: VideoConfig;
  animationConfig?: AnimationConfig;
}

export type ResolvedScrollStrategy = "document" | "virtual";

export interface RecordResult {
  jobId: string;
  outputDir: string;
  rawVideoPath: string;
  mp4Path: string;
  durationMs: number;
  viewport: ViewportConfig;
  scrollStrategy: ResolvedScrollStrategy;
}
