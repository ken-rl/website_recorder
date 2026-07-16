#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";
const services = new Map();
let shuttingDown = false;
let finalExitCode = 0;
let forceTimer;

function packageBinary(packageDir, name) {
  return path.join(root, packageDir, "node_modules", ".bin", `${name}${isWindows ? ".cmd" : ""}`);
}

function startService(name, command, args, cwd, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...extraEnv },
    stdio: "inherit",
    detached: !isWindows,
    shell: isWindows,
  });

  services.set(child.pid, { name, child });
  child.once("error", (error) => {
    console.error(`[dev] Could not start ${name}: ${error.message}`);
    services.delete(child.pid);
    shutdown(`${name} failed to start`, 1);
  });
  child.once("exit", (code, signal) => {
    services.delete(child.pid);
    if (!shuttingDown) {
      const reason = signal ? `signal ${signal}` : `exit code ${code ?? 1}`;
      console.error(`[dev] ${name} stopped with ${reason}; stopping the other service.`);
      shutdown(`${name} stopped`, code ?? 1);
    }
    finishWhenStopped();
  });
}

function signalService(child, signal) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (isWindows) child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

function shutdown(reason, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  finalExitCode = exitCode;
  console.error(`[dev] ${reason}. Shutting down Deio Scroll…`);

  for (const { child } of services.values()) signalService(child, "SIGTERM");
  if (services.size === 0) return finishWhenStopped();

  forceTimer = setTimeout(() => {
    for (const { child } of services.values()) signalService(child, "SIGKILL");
  }, 4_000);
  forceTimer.unref();
}

function finishWhenStopped() {
  if (!shuttingDown || services.size > 0) return;
  if (forceTimer) clearTimeout(forceTimer);
  process.exit(finalExitCode);
}

process.once("SIGINT", () => shutdown("Received Ctrl-C"));
process.once("SIGTERM", () => shutdown("Received SIGTERM"));

startService(
  "API",
  packageBinary("apps/api", "tsx"),
  ["src/api/server.ts"],
  path.join(root, "apps/api"),
);
startService(
  "web app",
  packageBinary("apps/web", "vite"),
  [],
  path.join(root, "apps/web"),
  {
    // Polling avoids Linux inotify exhaustion on machines with editors and
    // several MCP/Codex sessions, while retaining frontend hot reload.
    CHOKIDAR_USEPOLLING: process.env.CHOKIDAR_USEPOLLING ?? "1",
    CHOKIDAR_INTERVAL: process.env.CHOKIDAR_INTERVAL ?? "300",
  },
);
