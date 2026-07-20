import { z } from "zod";
import type { RecordRequest, StyleRequest } from "./types.js";

const httpUrl = z.string().url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "http:" || protocol === "https:";
}, "Only HTTP(S) URLs are supported");

const viewportSchema = z.object({
  width: z.number().int().min(320).max(3840),
  height: z.number().int().min(240).max(2160),
  deviceScaleFactor: z.number().min(0.5).max(2).optional(),
});

const scrollCurveSchema = z.object({
  preset: z.enum([
    "linear", "ease-in", "ease-out", "ease-in-out", "ease-in-cubic",
    "ease-out-cubic", "ease-in-out-cubic", "custom",
  ]).optional(),
  bezier: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
}).superRefine((curve, context) => {
  if (curve.preset === "custom" && !curve.bezier) {
    context.addIssue({ code: "custom", message: "A custom curve requires bezier control points" });
  }
});

const motionTargetSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("selector"),
    selector: z.string().min(1).max(2_000),
    align: z.enum(["top", "center", "bottom"]).optional(),
    offsetPx: z.number().int().min(-4_000).max(4_000).optional(),
    fallbackProgress: z.number().min(0).max(1).optional(),
  }),
  z.object({ type: z.literal("progress"), value: z.number().min(0).max(1) }),
  z.object({ type: z.literal("page-end") }),
]);

const interactionSchema = z.object({
  action: z.enum(["hover", "focus", "click"]),
  candidateId: z.string().min(1).max(80).optional(),
  label: z.string().min(1).max(120).optional(),
  role: z.string().min(1).max(40).optional(),
  zoomScale: z.number().min(1).max(1.8).optional(),
  showCursor: z.boolean().optional(),
});

const animationSchema = z.object({
  pixelsPerFrame: z.number().min(0.25).max(200).optional(),
  preRecordingDelayMs: z.number().int().min(0).max(30_000).optional(),
  removeOverlayElements: z.boolean().optional(),
  pauseTriggers: z.array(z.object({
    selector: z.string().min(1).max(2_000),
    durationMs: z.number().int().min(0).max(15_000),
  })).max(12).optional(),
  scrollCurve: scrollCurveSchema.optional(),
  durationMs: z.number().int().min(1_000).max(300_000).optional(),
  heroHoldMs: z.number().int().min(0).max(15_000).optional(),
  scrollMode: z.enum(["auto", "document", "virtual"]).optional(),
  virtualScrollCycles: z.number().min(0.25).max(100).optional(),
  virtualScrollDurationMs: z.number().int().min(1_000).max(300_000).optional(),
  fastMode: z.boolean().optional(),
  captureMode: z.enum(["preview", "export"]).optional(),
  direction: z.object({
    startHoldMs: z.number().int().min(0).max(15_000).optional(),
    beats: z.array(z.object({
      target: motionTargetSchema,
      transitionMs: z.number().int().min(250).max(60_000),
      curve: scrollCurveSchema.optional(),
      holdMs: z.number().int().min(0).max(15_000).optional(),
      interaction: interactionSchema.optional(),
    })).min(1).max(12),
  }).optional(),
}).optional();

export const recordRequestSchema = z.object({
  targetUrl: httpUrl,
  exportFormat: z.literal("mp4").optional(),
  videoConfig: z.object({
    framerate: z.number().int().min(1).max(120).optional(),
    qualityPreset: z.enum(["high", "medium", "low"]).optional(),
    viewport: viewportSchema,
  }),
  animationConfig: animationSchema,
  backgroundPreset: z.enum([
    "none", "gray_noise_gradient", "paper_blue", "red_blocks_gradient",
  ]).optional(),
  addShadow: z.boolean().optional(),
  roundedCorners: z.boolean().optional(),
  comparison: z.object({
    targetUrl: httpUrl,
    primaryLabel: z.string().trim().min(1).max(48),
    secondaryLabel: z.string().trim().min(1).max(48),
    primaryLogo: z.string().trim().max(8).optional(),
    secondaryLogo: z.string().trim().max(8).optional(),
    primaryLogoDataUrl: z.string()
      .refine((v) => /^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(v), "primaryLogoDataUrl must be a base64 image data URI (PNG, JPEG, WebP, or SVG)")
      .refine((v) => v.length <= 700_000, "primaryLogoDataUrl must be smaller than 512 KB")
      .optional(),
    secondaryLogoDataUrl: z.string()
      .refine((v) => /^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(v), "secondaryLogoDataUrl must be a base64 image data URI (PNG, JPEG, WebP, or SVG)")
      .refine((v) => v.length <= 700_000, "secondaryLogoDataUrl must be smaller than 512 KB")
      .optional(),
    layout: z.literal("side-by-side").optional(),
  }).optional(),
}).superRefine((request, context) => {
  const direction = request.animationConfig?.direction;
  if (!direction) return;
  const duration = (direction.startHoldMs ?? 1_500) + direction.beats.reduce(
    (total, beat) => total + beat.transitionMs + (beat.holdMs ?? 0),
    0,
  );
  if (duration > 300_000) {
    context.addIssue({ code: "custom", message: "The directed timeline cannot exceed 300000ms" });
  }
});

export const inspectRequestSchema = z.object({
  targetUrl: httpUrl,
  viewport: viewportSchema.pick({ width: true, height: true }).optional(),
});

export const styleRequestSchema = z.object({
  jobId: z.string().regex(/^[a-zA-Z0-9._-]+$/),
  backgroundPreset: z.enum([
    "none", "gray_noise_gradient", "paper_blue", "red_blocks_gradient",
  ]).optional(),
  addShadow: z.boolean().optional(),
  roundedCorners: z.boolean().optional(),
});

export function parseRecordRequest(value: unknown): RecordRequest {
  return recordRequestSchema.parse(value) as RecordRequest;
}

export function parseInspectRequest(value: unknown) {
  return inspectRequestSchema.parse(value);
}

export function parseStyleRequest(value: unknown): StyleRequest {
  return styleRequestSchema.parse(value) as StyleRequest;
}
