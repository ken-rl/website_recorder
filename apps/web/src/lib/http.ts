/**
 * Parse an API response without leaking the browser's opaque JSON.parse error
 * when a proxy, restart, or upstream failure returns an empty/HTML body.
 */
export async function readJsonResponse<T>(
  response: Response,
  action: string,
): Promise<T> {
  const body = await response.text();
  const status = `${response.status}${response.statusText ? ` ${response.statusText}` : ""}`;

  if (!body.trim()) {
    throw new Error(
      `${action} received an empty response (${status}). The recorder API may be offline or restarting.`,
    );
  }

  try {
    return JSON.parse(body) as T;
  } catch {
    const contentType = response.headers.get("content-type") ?? "unknown content type";
    throw new Error(
      `${action} received an invalid response (${status}, ${contentType}). The recorder API may be unavailable.`,
    );
  }
}
