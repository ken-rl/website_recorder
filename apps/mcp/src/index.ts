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

const server = new McpServer(
  { name: "scrollizard", version: "0.1.0" },
  {
    instructions:
      "For a directed recording, inspect the website before final capture. Use storyboard screenshots for visual pacing, and use the returned selector candidates for pause triggers. Start with a draft unless the user explicitly asks for a final render.",
  },
);

server.registerTool(
  "inspect_website",
  {
    title: "Inspect website for recording direction",
    description: "Returns a visual storyboard and a semantic section map that an AI can use to plan scroll speed, curves, and pauses. Supports public URLs and local development URLs.",
    inputSchema: { targetUrl: z.string().url(), viewport: viewportSchema.optional() },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ targetUrl, viewport }) => {
    const inspection = await inspectWebsite({ targetUrl, viewport });
    return {
      content: [
        { type: "text", text: JSON.stringify({ ...inspection, screenshots: undefined }, null, 2) },
        ...inspection.screenshots.map((data) => ({ type: "image" as const, data, mimeType: "image/jpeg" })),
      ],
    };
  },
);

server.registerTool(
  "create_recording",
  {
    title: "Create AI-directed website recording",
    description: "Captures a local MP4. Choose pace, curve, hero hold, and selector-based pauses based on the inspected page and the user's creative direction.",
    inputSchema: {
      targetUrl: z.string().url(),
      quality: z.enum(["draft", "standard", "cinematic"]).optional(),
      pace: z.enum(["slow", "normal", "fast"]).optional(),
      viewport: viewportSchema.optional(),
      curve: z.enum(["linear", "ease-in", "ease-out", "ease-in-out", "ease-in-cubic", "ease-out-cubic", "ease-in-out-cubic", "custom"]).optional(),
      customBezier: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
      heroHoldMs: z.number().int().min(0).max(15_000).optional(),
      durationMs: z.number().int().min(1_000).max(300_000).optional(),
      scrollMode: z.enum(["auto", "document", "virtual"]).optional(),
      pauses: z.array(pauseSchema).max(12).optional(),
      backgroundPreset: z.enum(["none", "gray_noise_gradient", "paper_blue", "red_blocks_gradient"]).optional(),
      addShadow: z.boolean().optional(),
      roundedCorners: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, openWorldHint: true, idempotentHint: false },
  },
  async (input) => {
    console.error(`Starting recording for ${input.targetUrl}`);
    const result = await createRecording(input);
    const artifact = pathToFileURL(result.mp4Path).href;
    return {
      content: [
        { type: "text", text: JSON.stringify({ ...result, artifact }, null, 2) },
        { type: "resource_link", uri: artifact, name: `${result.jobId}.mp4`, mimeType: "video/mp4" },
      ],
    };
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
    const recording = await getRecording(jobId);
    const artifact = pathToFileURL(recording.mp4Path).href;
    return {
      content: [
        { type: "text", text: JSON.stringify({ ...recording, artifact }, null, 2) },
        { type: "resource_link", uri: artifact, name: `${recording.jobId}.mp4`, mimeType: "video/mp4" },
      ],
    };
  },
);

server.registerTool(
  "list_recordings",
  {
    title: "List local recordings",
    description: "Lists complete MP4 recordings in the local Scrollizard output directory.",
    annotations: { readOnlyHint: true },
  },
  async () => ({ content: [{ type: "text", text: JSON.stringify(await listRecordings(), null, 2) }] }),
);

await server.connect(new StdioServerTransport());
