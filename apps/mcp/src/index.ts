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
const interactionSchema = z.object({
  action: z.enum(["hover", "focus", "click"]),
  candidateId: z.string().min(1).max(80).optional(),
  label: z.string().min(1).max(120).optional(),
  role: z.string().min(1).max(40).optional(),
  zoomScale: z.number().min(1).max(1.8).optional(),
  showCursor: z.boolean().optional(),
});
const directionSchema = z.object({
  startHoldMs: z.number().int().min(0).max(15_000).optional(),
  beats: z.array(z.object({
    target: motionTargetSchema,
    transitionMs: z.number().int().min(250).max(60_000),
    curve: scrollCurveSchema.optional(),
    holdMs: z.number().int().min(0).max(15_000).optional(),
    interaction: interactionSchema.optional(),
  })).min(1).max(12),
});

const server = new McpServer(
  { name: "deio-scroll", version: "0.4.0" },
  {
    instructions:
      "This MCP creates direct website recordings, not launch films. Inspect before directing. Keep smooth scrolling as the base motion. For interactive moments, copy the candidate's recommendedTarget and recommendedInteraction, changing only the action when that action appears in the candidate's allowed actions. Give the beat at least recommendedHoldMs. The recorder handles pause, camera zoom, visible cursor, component state, selector recovery, and return to scrolling. Never invent interaction selectors or omit the semantic fingerprint. Directed recordings hold the hero for 1500ms by default. On document pages, use recommended selector targets for held beats and progress targets only for fly-through waypoints. Use recommendedTransitionMs as a floor and ease-in-out curves around holds. On virtual pages, use storyboard progress targets and omit component interactions. Start with draft quality unless the user requests a final render. Report motionPlan adjustments.",
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
    description: "Returns scroll mode, storyboard, semantic section targets, and guarded interaction candidates that can be used for cursor, hover, focus, click, pause, and zoom moments.",
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
    description: "Captures a direct local MP4 with smooth scrolling and optional inspected component interactions, including pauses, camera zooms, a visible smooth cursor, hover/focus/click states, and guarded navigation.",
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
