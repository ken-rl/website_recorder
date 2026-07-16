import dns from "node:dns/promises";
import net from "node:net";
import type { Page, Route } from "playwright";

export interface TargetNetworkPolicy {
  allowLocalhost: boolean;
  allowPrivateNetworks: boolean;
}

const guardedPages = new WeakSet<Page>();
const resolutionCache = new Map<string, { expiresAt: number; addresses: string[] }>();

export function targetNetworkPolicyFromEnv(): TargetNetworkPolicy {
  return {
    // Localhost capture is a core local-development feature. Disable this in SaaS.
    allowLocalhost: process.env.ALLOW_LOCALHOST_TARGETS !== "0",
    allowPrivateNetworks: process.env.ALLOW_PRIVATE_TARGETS === "1",
  };
}

export async function installNetworkGuard(
  page: Page,
  policy = targetNetworkPolicyFromEnv(),
) {
  if (guardedPages.has(page)) return;
  guardedPages.add(page);
  await page.route("**/*", async (route) => {
    try {
      await assertSafeTargetUrl(route.request().url(), policy);
      await route.continue();
    } catch (error) {
      await abortBlockedRoute(route, error);
    }
  });
}

export async function assertSafeTargetUrl(
  value: string,
  policy = targetNetworkPolicyFromEnv(),
) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only HTTP(S) URLs are supported");
  }
  if (url.username || url.password) {
    throw new Error("Target URLs cannot contain credentials");
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (isCloudMetadataHostname(hostname)) {
    throw new Error("Cloud metadata targets are blocked");
  }
  const addresses = await resolveAddresses(hostname);
  if (addresses.length === 0) throw new Error(`Could not resolve target host: ${hostname}`);
  for (const address of addresses) assertAddressAllowed(address, hostname, policy);
  return url;
}

export function assertAddressAllowed(
  address: string,
  hostname: string,
  policy: TargetNetworkPolicy,
) {
  const normalized = normalizeMappedIpv4(address);
  if (isCloudMetadataAddress(normalized)) {
    throw new Error("Cloud metadata targets are blocked");
  }
  const category = addressCategory(normalized);
  if (category === "public") return;
  if (category === "loopback" && policy.allowLocalhost && isLocalHostname(hostname, normalized)) {
    return;
  }
  if (category === "private" && policy.allowPrivateNetworks) return;
  throw new Error(`Target resolves to a blocked ${category} address (${normalized})`);
}

export function addressCategory(address: string): "public" | "loopback" | "private" {
  const version = net.isIP(address);
  if (version === 4) {
    const [a, b] = address.split(".").map(Number);
    if (a === 127) return "loopback";
    if (
      a === 0 ||
      a === 10 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    ) return "private";
    return "public";
  }
  if (version === 6) {
    const lower = address.toLowerCase();
    if (lower === "::" || lower === "::1") return "loopback";
    if (/^(fc|fd)/.test(lower) || /^fe[89ab]/.test(lower) || lower.startsWith("ff")) {
      return "private";
    }
    return "public";
  }
  throw new Error(`Invalid resolved IP address: ${address}`);
}

async function resolveAddresses(hostname: string) {
  if (net.isIP(hostname)) return [hostname];
  const cached = resolutionCache.get(hostname);
  if (cached && cached.expiresAt > Date.now()) return cached.addresses;
  const resolved = await dns.lookup(hostname, { all: true, verbatim: true });
  const addresses = [...new Set(resolved.map((item) => item.address))];
  resolutionCache.set(hostname, { expiresAt: Date.now() + 30_000, addresses });
  return addresses;
}

function isLocalHostname(hostname: string, address: string) {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === address ||
    hostname === `[${address}]`
  );
}

function isCloudMetadataHostname(hostname: string) {
  return hostname === "metadata.google.internal" || hostname.endsWith(".metadata.google.internal");
}

function isCloudMetadataAddress(address: string) {
  return address === "169.254.169.254" || address.toLowerCase() === "fd00:ec2::254";
}

function normalizeMappedIpv4(address: string) {
  const match = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return match?.[1] ?? address;
}

async function abortBlockedRoute(route: Route, error: unknown) {
  console.warn(
    `Blocked browser request to ${route.request().url()}: ${
      error instanceof Error ? error.message : "network policy violation"
    }`,
  );
  await route.abort("blockedbyclient");
}
