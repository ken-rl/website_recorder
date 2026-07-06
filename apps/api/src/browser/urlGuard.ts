import type { Page } from "playwright";
import { gotoReachablePage } from "./goto.js";

function normalizePath(pathname: string) {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed || "/";
}

export function urlsMatchTarget(currentUrl: string, targetUrl: string) {
  const current = new URL(currentUrl);
  const target = new URL(targetUrl);
  const host = (value: URL) => value.hostname.replace(/^www\./, "");

  return (
    host(current) === host(target) &&
    normalizePath(current.pathname) === normalizePath(target.pathname)
  );
}

export async function ensureOnTargetUrl(page: Page, targetUrl: string) {
  if (urlsMatchTarget(page.url(), targetUrl)) {
    return;
  }

  console.warn(
    `Page drifted to ${page.url()} — re-navigating to ${targetUrl}`,
  );
  await gotoReachablePage(page, targetUrl);
  await page.evaluate(() =>
    window.scrollTo({ top: 0, left: 0, behavior: "instant" }),
  );
  await page.waitForTimeout(300);
}
