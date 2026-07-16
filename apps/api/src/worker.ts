#!/usr/bin/env node
import "dotenv/config";
import path from "node:path";
import { RecordingJobManager } from "./jobs/manager.js";

const outputRoot = path.resolve(process.env.OUTPUT_DIR ?? "./outputs");
const worker = new RecordingJobManager(outputRoot, {
  processJobs: true,
  recoverRunning: "requeue",
  workerId: process.env.WORKER_ID,
});

await worker.initialize();
console.log(`Deio Scroll capture worker listening for jobs in ${outputRoot}`);

// The manager's poll timer is deliberately unreferenced for embedded CLI/MCP use.
const keepAlive = setInterval(() => undefined, 60_000);

const shutdown = async () => {
  clearInterval(keepAlive);
  await worker.shutdown();
  process.exit(0);
};

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
