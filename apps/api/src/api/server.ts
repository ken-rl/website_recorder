#!/usr/bin/env node
import "dotenv/config";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { restyleRecording } from "../pipeline/styleRecording.js";
import { inspectWebsite } from "../inspection/inspectWebsite.js";
import { RecordingJobManager } from "../jobs/manager.js";
import { assertSafeTargetUrl } from "../browser/networkPolicy.js";
import { parseInspectRequest, parseRecordRequest, parseStyleRequest } from "../contracts.js";
import { embeddedWorkerEnabled } from "../config/runtimeMode.js";
import type { RecordRequest } from "../types.js";

const PORT = Number(process.env.PORT ?? 3847);
const HOST = process.env.HOST ?? "127.0.0.1";
const OUTPUT_DIR = path.resolve(process.env.OUTPUT_DIR ?? "./outputs");
const PUBLIC_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../public",
);
// Local startup is self-contained. Hosted deployments can set EMBEDDED_WORKER=0
// and run src/worker.ts independently against the same durable job database.
const hasEmbeddedWorker = embeddedWorkerEnabled();
const jobs = new RecordingJobManager(OUTPUT_DIR, {
  processJobs: hasEmbeddedWorker,
  recoverRunning: hasEmbeddedWorker ? "requeue" : "interrupt",
});
await jobs.initialize();

const server = http.createServer((req, res) => {
  void handleRequest(req, res).catch((error) => {
    console.error("Unhandled API request error", error);
    if (res.writableEnded) return;
    if (!res.headersSent) {
      sendJson(res, 500, { ok: false, error: errorMessage(error) });
    } else {
      res.end();
    }
  });
});

server.on("error", (error: NodeJS.ErrnoException) => {
  const message = error.code === "EADDRINUSE"
    ? `Deio Scroll cannot start: ${HOST}:${PORT} is already in use. Stop the existing dev server or choose another PORT.`
    : `Deio Scroll server error: ${error.message}`;
  console.error(message);
  process.exitCode = 1;
  void jobs.shutdown();
});

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
) {
  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`,
  );

  if (req.method === "GET" && url.pathname === "/health") {
    return sendJson(res, 200, {
      ok: true,
      workerMode: hasEmbeddedWorker ? "embedded" : "external",
    });
  }

  if (req.method === "POST" && url.pathname === "/api/inspect") {
    try {
      const body = parseInspectRequest(await readJsonBody(req));
      await assertSafeTargetUrl(body.targetUrl);
      const inspection = await inspectWebsite(body);
      return sendJson(res, 200, { ok: true, inspection });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Inspection failed";
      return sendJson(res, 400, { ok: false, error: message });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/jobs") {
    try {
      const body = parseRecordRequest(await readJsonBody(req));
      await assertSafeTargetUrl(body.targetUrl);
      const job = await jobs.create(body);
      return sendJson(res, 202, jobLinks(job.jobId));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not create job";
      return sendJson(res, 400, { ok: false, error: message });
    }
  }

  if (req.method === "GET" && url.pathname === "/api/jobs") {
    return sendJson(res, 200, { ok: true, jobs: await jobs.list() });
  }

  const jobRoute = url.pathname.match(/^\/api\/jobs\/([^/]+)$/);
  if (req.method === "GET" && jobRoute) {
    try {
      return sendJson(res, 200, { ok: true, job: await jobs.get(jobRoute[1]) });
    } catch (error) {
      return sendJson(res, 404, { ok: false, error: errorMessage(error) });
    }
  }

  const eventsRoute = url.pathname.match(/^\/api\/jobs\/([^/]+)\/events$/);
  if (req.method === "GET" && eventsRoute) {
    try {
      const jobId = eventsRoute[1];
      const current = await jobs.get(jobId);
      res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      });
      res.flushHeaders();
      res.write("retry: 1500\n\n");
      const write = (job: typeof current) => {
        if (!res.writableEnded && !res.destroyed) {
          res.write(`event: job\ndata: ${JSON.stringify(job)}\n\n`);
        }
      };
      write(current);
      const unsubscribe = jobs.subscribe(jobId, write);
      const heartbeat = setInterval(() => {
        if (!res.writableEnded && !res.destroyed) res.write(": keepalive\n\n");
      }, 10_000);
      let cleanedUp = false;
      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        clearInterval(heartbeat);
        unsubscribe();
      };
      req.on("close", cleanup);
      res.on("close", cleanup);
      return;
    } catch (error) {
      return sendJson(res, 404, { ok: false, error: errorMessage(error) });
    }
  }

  const cancelRoute = url.pathname.match(/^\/api\/jobs\/([^/]+)\/cancel$/);
  if (req.method === "POST" && cancelRoute) {
    try {
      return sendJson(res, 200, { ok: true, job: await jobs.cancel(cancelRoute[1]) });
    } catch (error) {
      return sendJson(res, 409, { ok: false, error: errorMessage(error) });
    }
  }

  const retryRoute = url.pathname.match(/^\/api\/jobs\/([^/]+)\/retry$/);
  if (req.method === "POST" && retryRoute) {
    try {
      const job = await jobs.retry(retryRoute[1]);
      return sendJson(res, 202, jobLinks(job.jobId));
    } catch (error) {
      return sendJson(res, 409, { ok: false, error: errorMessage(error) });
    }
  }

  if (req.method === "DELETE" && jobRoute) {
    try {
      await jobs.remove(jobRoute[1]);
      return sendJson(res, 200, { ok: true });
    } catch (error) {
      return sendJson(res, 409, { ok: false, error: errorMessage(error) });
    }
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
      url.pathname === "/upcoming" ||
      url.pathname === "/library")
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
      const body = parseRecordRequest(await readJsonBody(req));
      await assertSafeTargetUrl(body.targetUrl);
      const queued = await jobs.create(body);
      const job = await jobs.waitForCompletion(queued.jobId);
      if (job.status !== "completed" || !job.result) {
        throw new Error(job.error?.message ?? `Recording ${job.status}`);
      }
      const result = job.result;
      return sendJson(res, 200, {
        ok: true,
        jobId: job.jobId,
        videoUrl: result.videoUrl,
        sourceVideoUrl: result.sourceVideoUrl,
        mp4Path: path.join(OUTPUT_DIR, job.jobId, "output.mp4"),
        durationMs: result.durationMs,
        renderTimeMs: result.renderTimeMs,
        viewport: result.viewport,
        scrollStrategy: result.scrollStrategy,
        motionPlan: result.motionPlan,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return sendJson(res, 400, { ok: false, error: message });
    }
  }

  if (req.method === "POST" && url.pathname === "/style") {
    try {
      const body = parseStyleRequest(await readJsonBody(req));
      const result = await restyleRecording(body, OUTPUT_DIR);
      const existing = await jobs.get(body.jobId).catch(() => null);
      if (existing) {
        const request = existing.request
          ? { ...existing.request, backgroundPreset: body.backgroundPreset, addShadow: body.addShadow, roundedCorners: body.roundedCorners }
          : undefined;
        await jobs.refreshResult(body.jobId, request);
      }
      return sendJson(res, 200, { ok: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return sendJson(res, 400, { ok: false, error: message });
    }
  }

  sendJson(res, 404, { ok: false, error: "Not found" });
}

server.listen(PORT, HOST, () => {
  console.log(`Deio Scroll listening on http://${HOST}:${PORT}`);
  console.log(`output directory: ${OUTPUT_DIR}`);
  console.log(
    hasEmbeddedWorker
      ? "capture worker: embedded"
      : "capture worker: external (start pnpm dev:worker)",
  );
});

const shutdown = () => {
  server.close(() => {
    void jobs.shutdown().finally(() => process.exit(0));
  });
  // SSE clients are intentionally long-lived and would otherwise keep close() pending.
  server.closeAllConnections();
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

function sendJson(res: http.ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
  });
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

function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 1_048_576) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      if (!tooLarge) chunks.push(chunk);
    });
    req.on("end", () => {
      if (tooLarge) return reject(new Error("JSON body cannot exceed 1 MB"));
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(JSON.parse(raw) as unknown);
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function jobLinks(jobId: string) {
  return {
    ok: true,
    jobId,
    statusUrl: `/api/jobs/${jobId}`,
    eventsUrl: `/api/jobs/${jobId}/events`,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}
