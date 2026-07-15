export interface ViewportConfig {
  width: number;
  height: number;
  deviceScaleFactor?: number;
}

export interface PauseTrigger {
  selector: string;
  durationMs: number;
}

export type MotionTarget =
  | {
      type: "selector";
      selector: string;
      align?: "top" | "center" | "bottom";
      offsetPx?: number;
    }
  | { type: "progress"; value: number }
  | { type: "page-end" };

export interface MotionBeat {
  target: MotionTarget;
  transitionMs: number;
  curve?: ScrollCurve;
  holdMs?: number;
}

export interface MotionDirection {
  startHoldMs?: number;
  beats: MotionBeat[];
}

export const DEFAULT_DIRECTED_START_HOLD_MS = 1_500;

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
  /** Capture the top of the page before scrolling, allowing dynamic hero content to settle. */
  heroHoldMs?: number;
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
  /** Ordered, section-level direction. Takes precedence over legacy global motion settings. */
  direction?: MotionDirection;
}

export interface RecordRequest {
  targetUrl: string;
  exportFormat?: "mp4";
  videoConfig: VideoConfig;
  animationConfig?: AnimationConfig;
  /** Image placed behind a contained recording in the completed capture. */
  backgroundPreset?: BackgroundPreset;
  /** Add a soft drop shadow to the contained recording. */
  addShadow?: boolean;
  /** Round the contained recording's corners. */
  roundedCorners?: boolean;
}

export interface StyleRequest {
  jobId: string;
  backgroundPreset?: BackgroundPreset;
  addShadow?: boolean;
  roundedCorners?: boolean;
}

export interface StyleResult {
  jobId: string;
  videoUrl: string;
  mp4Path: string;
}

export type ResolvedScrollStrategy = "document" | "virtual";

export interface RecordResult {
  jobId: string;
  outputDir: string;
  rawVideoPath: string;
  mp4Path: string;
  durationMs: number;
  renderTimeMs: number;
  viewport: ViewportConfig;
  scrollStrategy: ResolvedScrollStrategy;
  motionPlan?: ResolvedMotionPlan;
}

export interface ResolvedMotionBeat {
  target: MotionTarget;
  position: number;
  transitionMs: number;
  holdMs: number;
  curve: ScrollCurve;
  framing?: ResolvedBeatFraming;
}

export interface ResolvedBeatFraming {
  selector: string;
  align: "top" | "center" | "bottom";
  targetY: number;
  safeTopPx: number;
  safeBottomPx: number;
  verified: boolean;
}

export interface ResolvedMotionPlan {
  mode: ResolvedScrollStrategy;
  startHoldMs: number;
  durationMs: number;
  beats: ResolvedMotionBeat[];
  adjustments: MotionPlanAdjustment[];
}

export interface MotionPlanAdjustment {
  beatIndex: number;
  code:
    | "promoted-progress-target"
    | "merged-nearby-beat"
    | "replaced-boundary-curve"
    | "stretched-transition"
    | "corrected-pause-framing";
  message: string;
  requested?: number | string | MotionTarget;
  resolved?: number | string | MotionTarget;
}

export type BackgroundPreset =
  | "none"
  | "gray_noise_gradient"
  | "paper_blue"
  | "red_blocks_gradient";

export interface WebsiteSection {
  label: string;
  selector: string;
  kind: "heading" | "landmark";
  y: number;
  progress: number;
  height: number;
  targetY: number;
  distanceFromPrevious: number;
  recommendedTransitionMs: number;
  recommendedTarget: Extract<MotionTarget, { type: "selector" }>;
}

export interface StoryboardFrame {
  imageIndex: number;
  target: Extract<MotionTarget, { type: "progress" }>;
  y?: number;
}

export interface WebsiteInspection {
  url: string;
  title: string;
  pageHeight: number;
  viewport: { width: number; height: number };
  scrollMode: ResolvedScrollStrategy;
  safeViewport: { topInsetPx: number; bottomInsetPx: number };
  sections: WebsiteSection[];
  storyboard: StoryboardFrame[];
  screenshots: string[];
  warnings: string[];
}

export type RecordingJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";

export type RecordingJobStage =
  | "queued"
  | "preparing"
  | "capturing"
  | "encoding"
  | "styling"
  | "finalizing"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";

export interface RecordingJobProgress {
  stage: RecordingJobStage;
  percent: number;
  message: string;
}

export interface RecordingJobResult {
  videoUrl: string;
  sourceVideoUrl?: string;
  thumbnailUrl?: string;
  durationMs: number;
  renderTimeMs: number;
  sizeBytes: number;
  viewport: ViewportConfig;
  scrollStrategy: ResolvedScrollStrategy;
  motionPlan?: ResolvedMotionPlan;
  canRestyle: boolean;
}

export interface RecordingJobManifest {
  schemaVersion: 1;
  jobId: string;
  targetUrl: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
  status: RecordingJobStatus;
  progress: RecordingJobProgress;
  request?: RecordRequest;
  result?: RecordingJobResult;
  error?: { stage: RecordingJobStage; message: string };
  attempt: number;
  parentJobId?: string;
  legacy?: boolean;
}
