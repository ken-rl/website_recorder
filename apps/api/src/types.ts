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
  /** Target scroll duration in milliseconds. Applies to both document and virtual scroll. */
  durationMs?: number;
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
  /** Capture mode: 'preview' (fast, video) or 'export' (high-quality, screenshots) */
  captureMode?: "preview" | "export";
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

export interface EditorPause {
  /** Position in the source video timeline (milliseconds). */
  atMs: number;
  /** How long to hold the frame (milliseconds). */
  holdMs: number;
}

export interface EditorZoom {
  /** Position in the source video timeline (milliseconds). */
  atMs: number;
  /** Transition duration (milliseconds). */
  durationMs: number;
  /** Zoom level (e.g. 1.5). */
  scale: number;
  /** Target center X coordinate percentage (0 to 1). */
  x: number;
  /** Target center Y coordinate percentage (0 to 1). */
  y: number;
}

export interface EditRequest {
  jobId: string;
  trimStartMs?: number;
  trimEndMs?: number;
  pauses?: EditorPause[];
  zooms?: EditorZoom[];
  bezier?: [number, number, number, number];
  durationMs?: number;
}

export interface EditResult {
  jobId: string;
  sourceVideoUrl: string;
  videoUrl: string;
  mp4Path: string;
  durationMs: number;
}
