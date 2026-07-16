export function embeddedWorkerEnabled(
  environment: NodeJS.ProcessEnv = process.env,
) {
  return environment.EMBEDDED_WORKER !== "0";
}
