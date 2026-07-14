#!/usr/bin/env node
import "dotenv/config";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { recordWebsite } from "../pipeline/recordWebsite.js";
import { restyleRecording } from "../pipeline/styleRecording.js";
import type { RecordRequest, StyleRequest } from "../types.js";

const PORT = Number(process.env.PORT ?? 3847);
const OUTPUT_DIR = path.resolve(process.env.OUTPUT_DIR ?? "./outputs");
const PUBLIC_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../public",
);

const server = http.createServer(async (req, res) => {
  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`,
  );

  if (req.method === "GET" && url.pathname === "/health") {
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "GET" && url.pathname === "/api/upcoming") {
    return sendJson(res, 200, {
      ok: true,
      upcomingFeatures: [
        {
          id: "react-component",
          title: "Embeddable React Component (<WebRecorder />)",
          description:
            "A reusable React component for developer dashboards and documentation with built-in progress feedback.",
          status: "planned",
        },
        {
          id: "deterministic-caching",
          title: "Deterministic Server Caching",
          description:
            "Instant video loading on matching configurations by checking pre-recorded caches indexed by SHA-256 configuration hashes.",
          status: "planned",
        },
        {
          id: "webhook-notifications",
          title: "Webhooks & Async Processing",
          description:
            "Allow long-running captures to run in the background and notify clients via Webhooks or SSE when ready.",
          status: "planned",
        },
        {
          id: "audio-overlay",
          title: "Audio & Speech Hydration",
          description:
            "Synthesize background soundtracks or text-to-speech audio overlays synchronized with the viewport scroll animation.",
          status: "planned",
        },
      ],
    });
  }

  if (
    req.method === "GET" &&
    (url.pathname === "/" ||
      url.pathname === "/upcoming")
  ) {
    return serveFile(
      res,
      path.join(PUBLIC_DIR, "index.html"),
      "text/html; charset=utf-8",
    );
  }

  if (req.method === "GET" && url.pathname.startsWith("/outputs/")) {
    const relativePath = url.pathname.slice("/outputs/".length);
    const filePath = path.resolve(OUTPUT_DIR, relativePath);
    if (!filePath.startsWith(OUTPUT_DIR + path.sep)) {
      return sendJson(res, 403, { ok: false, error: "Forbidden" });
    }
    return serveFile(res, filePath, contentTypeFor(filePath));
  }

  // Serve general static files from PUBLIC_DIR (e.g. built JS/CSS files)
  if (req.method === "GET" && url.pathname !== "/") {
    const relativePath = url.pathname.startsWith("/")
      ? url.pathname.slice(1)
      : url.pathname;
    const filePath = path.resolve(PUBLIC_DIR, relativePath);
    if (filePath.startsWith(PUBLIC_DIR + path.sep)) {
      try {
        await fs.access(filePath);
        return serveFile(res, filePath, contentTypeFor(filePath));
      } catch {
        // Fall through to other routes or 404
      }
    }
  }

  if (req.method === "POST" && url.pathname === "/record") {
    try {
      const body = await readJsonBody<RecordRequest>(req);
      validateRecordRequest(body);
      const result = await recordWebsite(body, OUTPUT_DIR);
      return sendJson(res, 200, {
        ok: true,
        jobId: result.jobId,
        videoUrl: `/outputs/${result.jobId}/output.mp4`,
        sourceVideoUrl: `/outputs/${result.jobId}/source.mp4`,
        mp4Path: result.mp4Path,
        durationMs: result.durationMs,
        viewport: result.viewport,
        scrollStrategy: result.scrollStrategy,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return sendJson(res, 400, { ok: false, error: message });
    }
  }

  if (req.method === "POST" && url.pathname === "/style") {
    try {
      const body = await readJsonBody<StyleRequest>(req);
      const result = await restyleRecording(body, OUTPUT_DIR);
      return sendJson(res, 200, { ok: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return sendJson(res, 400, { ok: false, error: message });
    }
  }

  sendJson(res, 404, { ok: false, error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`websiterecorder listening on http://localhost:${PORT}`);
  console.log(`output directory: ${OUTPUT_DIR}`);
});

function sendJson(res: http.ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload, null, 2));
}

async function serveFile(
  res: http.ServerResponse,
  filePath: string,
  contentType: string,
) {
  try {
    const data = await fs.readFile(filePath);
    res.writeHead(200, { "content-type": contentType });
    res.end(data);
  } catch {
    sendJson(res, 404, { ok: false, error: "Not found" });
  }
}

function contentTypeFor(filePath: string) {
  if (filePath.endsWith(".mp4")) return "video/mp4";
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg"))
    return "image/jpeg";
  if (filePath.endsWith(".ico")) return "image/x-icon";
  return "application/octet-stream";
}

function readJsonBody<T>(req: http.IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(JSON.parse(raw) as T);
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function validateRecordRequest(body: RecordRequest) {
  if (!body?.targetUrl) throw new Error("targetUrl is required");
  try {
    new URL(body.targetUrl);
  } catch {
    throw new Error("targetUrl must be a valid URL");
  }
  if (
    !body.videoConfig?.viewport?.width ||
    !body.videoConfig?.viewport?.height
  ) {
    throw new Error(
      "videoConfig.viewport.width and videoConfig.viewport.height are required",
    );
  }
}
