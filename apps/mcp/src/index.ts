#!/usr/bin/env node
import "dotenv/config";
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { inspectWebsite } from "./inspect.js";
import { createRecording, getRecording, listRecordings } from "./recording.js";

const viewportSchema = z.object({ width: z.number().int().min(320).max(3840), height: z.number().int().min(240).max(2160) });
const pauseSchema = z.object({ selector: z.string().min(1), durationMs: z.number().int().min(0).max(15_000) });
const curvePresetSchema = z.enum(["linear", "ease-in", "ease-out", "ease-in-out", "ease-in-cubic", "ease-out-cubic", "ease-in-out-cubic", "custom"]);
const scrollCurveSchema = z.object({
  preset: curvePresetSchema.optional(),
  bezier: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
});
const motionTargetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("selector"), selector: z.string().min(1), align: z.enum(["top", "center", "bottom"]).optional(), offsetPx: z.number().int().min(-4000).max(4000).optional() }),
  z.object({ type: z.literal("progress"), value: z.number().min(0).max(1) }),
  z.object({ type: z.literal("page-end") }),
]);
const directionSchema = z.object({
  startHoldMs: z.number().int().min(0).max(15_000).optional(),
  beats: z.array(z.object({
    target: motionTargetSchema,
    transitionMs: z.number().int().min(250).max(60_000),
    curve: scrollCurveSchema.optional(),
    holdMs: z.number().int().min(0).max(15_000).optional(),
  })).min(1).max(12),
});

const server = new McpServer(
  { name: "deio-scroll", version: "0.4.0" },
  {
    instructions:
      "Inspect before directing. Directed recordings hold the hero for 1500ms by default; only override startHoldMs when the user requests a different opening. On document pages, copy each section's recommendedTarget for every held beat so headings are safely framed; progress targets are only for non-held fly-through waypoints. Use recommendedTransitionMs as a floor, hold only sections the user emphasizes, and default to at most two section holds unless the user explicitly requests more. Use ease-in-out curves around holds, vary timing by distance, and do not add page-end when the prior target is already near the bottom. On virtual pages, use storyboard progress targets. Start with draft quality unless the user requests a final render. Report any motionPlan.adjustments and unverified beat framing returned by Deio Scroll.",
  },
);

function toolError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown Deio Scroll error";
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: JSON.stringify({ ok: false, error: message }, null, 2) }],
  };
}

server.registerTool(
  "inspect_website",
  {
    title: "Inspect website for recording direction",
    description: "Returns scroll mode, safe viewport insets, a targeted storyboard, and semantic sections with safe recommendedTarget selectors, composition position, distance, and recommended transition timing.",
    inputSchema: { targetUrl: z.string().url(), viewport: viewportSchema.optional() },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ targetUrl, viewport }) => {
    try {
      const inspection = await inspectWebsite({ targetUrl, viewport });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ ...inspection, screenshots: undefined }, null, 2) },
          ...inspection.screenshots.map((data) => ({ type: "image" as const, data, mimeType: "image/jpeg" as const })),
        ],
      };
    } catch (error) {
      return toolError(error);
    }
  },
);

server.registerTool(
  "create_recording",
  {
    title: "Create AI-directed website recording",
    description: "Captures a local MP4 and auto-corrects weak direction for composition, hold-boundary easing, maximum velocity, and redundant nearby beats. Prefer inspected selector beats on document pages.",
    inputSchema: {
      targetUrl: z.string().url(),
      quality: z.enum(["draft", "standard", "cinematic"]).optional(),
      pace: z.enum(["slow", "normal", "fast"]).optional(),
      viewport: viewportSchema.optional(),
      curve: curvePresetSchema.optional(),
      customBezier: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
      heroHoldMs: z.number().int().min(0).max(15_000).optional(),
      durationMs: z.number().int().min(1_000).max(300_000).optional(),
      scrollMode: z.enum(["auto", "document", "virtual"]).optional(),
      pauses: z.array(pauseSchema).max(12).optional(),
      backgroundPreset: z.enum(["none", "gray_noise_gradient", "paper_blue", "red_blocks_gradient"]).optional(),
      addShadow: z.boolean().optional(),
      roundedCorners: z.boolean().optional(),
      direction: directionSchema.optional(),
    },
    annotations: { readOnlyHint: false, openWorldHint: true, idempotentHint: false },
  },
  async (input) => {
    try {
      console.error(`Starting recording for ${input.targetUrl}`);
      const result = await createRecording(input);
      const artifact = pathToFileURL(result.mp4Path).href;
      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ ok: true, ...result, artifact }, null, 2) },
          { type: "resource_link" as const, uri: artifact, name: `${result.jobId}.mp4`, mimeType: "video/mp4" },
        ],
      };
    } catch (error) {
      return toolError(error);
    }
  },
);

server.registerTool(
  "get_recording",
  {
    title: "Get local recording artifact",
    description: "Returns a previously completed MP4 recording and its local file link.",
    inputSchema: { jobId: z.string().min(1) },
    annotations: { readOnlyHint: true },
  },
  async ({ jobId }) => {
    try {
      const recording = await getRecording(jobId);
      const artifact = pathToFileURL(recording.mp4Path).href;
      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ ok: true, ...recording, artifact }, null, 2) },
          { type: "resource_link" as const, uri: artifact, name: `${recording.jobId}.mp4`, mimeType: "video/mp4" },
        ],
      };
    } catch (error) {
      return toolError(error);
    }
  },
);

server.registerTool(
  "list_recordings",
  {
    title: "List local recordings",
    description: "Lists complete MP4 recordings in the local Deio Scroll output directory.",
    annotations: { readOnlyHint: true },
  },
  async () => ({ content: [{ type: "text", text: JSON.stringify(await listRecordings(), null, 2) }] }),
);

await server.connect(new StdioServerTransport());
