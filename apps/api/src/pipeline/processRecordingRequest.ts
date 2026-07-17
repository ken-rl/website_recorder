import type { RecordRequest } from "../types.js";
import { recordComparison } from "./recordComparison.js";
import { recordWebsite, type RecordingRuntime } from "./recordWebsite.js";

export function processRecordingRequest(
  request: RecordRequest,
  outputRoot: string,
  jobId?: string,
  runtime: RecordingRuntime = {},
) {
  if (request.comparison) {
    if (!jobId) throw new Error("Managed job id is required for a comparison");
    return recordComparison(request, outputRoot, jobId, runtime);
  }
  return recordWebsite(request, outputRoot, jobId, runtime);
}
