import type { Page } from "playwright";

const SCROLL_RANGE_THRESHOLD_PX = 48;
const DEFAULT_TIMEOUT_MS = 12_000;
const LATENT_CONTENT_OBSERVATION_MS = 2_500;

export interface ScrollReadinessSnapshot {
  viewportHeight: number;
  documentScrollRange: number;
  latentContentHeight: number;
  bodyLocked: boolean;
  htmlLocked: boolean;
}

export interface ScrollReadinessResult {
  waited: boolean;
  timedOut: boolean;
  initial: ScrollReadinessSnapshot;
}

/**
 * Some scroll-driven sites render a tall document behind a temporary intro
 * lock. During that intro, scrollHeight is only one viewport and looks exactly
 * like a virtual-scroll page. Wait for the latent document to be released
 * before choosing a scroll strategy or hydrating content.
 */
export async function waitForScrollReady(
  page: Page,
  options: { timeoutMs?: number } = {},
): Promise<ScrollReadinessResult> {
  await page.waitForLoadState("load", { timeout: 5_000 }).catch(() => undefined);
  const initial = await page.evaluate(readinessSnapshot);
  if (!isPotentialScrollLock(initial)) {
    return { waited: false, timedOut: false, initial };
  }

  let locked = initial;
  if (!isTransientScrollLock(locked)) {
    try {
      await page.waitForFunction(
        (threshold) => {
          const html = document.documentElement;
          const body = document.body;
          const candidates = [
            body,
            document.querySelector("main"),
            document.querySelector("[role='main']"),
            ...Array.from(document.querySelectorAll("body > div, body > section")),
          ].filter((element): element is Element => Boolean(element));
          const latentHeight = candidates.reduce((largest, element) => {
            const rect = element.getBoundingClientRect();
            return Math.max(
              largest,
              element.scrollHeight,
              rect.height,
              rect.bottom + window.scrollY,
            );
          }, 0);
          const documentHeight = Math.max(
            document.scrollingElement?.scrollHeight ?? html.scrollHeight,
            innerHeight,
          );
          const bodyStyle = body ? getComputedStyle(body) : null;
          const htmlStyle = getComputedStyle(html);
          const locked =
            bodyStyle?.overflow === "hidden" ||
            bodyStyle?.overflowY === "hidden" ||
            htmlStyle.overflow === "hidden" ||
            htmlStyle.overflowY === "hidden";
          return (
            documentHeight - innerHeight > threshold ||
            (locked && latentHeight > innerHeight * 1.5)
          );
        },
        SCROLL_RANGE_THRESHOLD_PX,
        { timeout: LATENT_CONTENT_OBSERVATION_MS, polling: 100 },
      );
    } catch {
      return { waited: false, timedOut: false, initial };
    }
    locked = await page.evaluate(readinessSnapshot);
    if (locked.documentScrollRange > SCROLL_RANGE_THRESHOLD_PX) {
      return { waited: true, timedOut: false, initial };
    }
    if (!isTransientScrollLock(locked)) {
      return { waited: false, timedOut: false, initial };
    }
  }

  try {
    await page.waitForFunction(
      (threshold) => {
        const html = document.documentElement;
        const body = document.body;
        const documentHeight = Math.max(
          document.scrollingElement?.scrollHeight ?? html.scrollHeight,
          innerHeight,
        );
        return documentHeight - innerHeight > threshold;
      },
      SCROLL_RANGE_THRESHOLD_PX,
      { timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS, polling: 100 },
    );
    return { waited: true, timedOut: false, initial };
  } catch {
    // A genuine fixed-viewport/virtual page can retain the lock indefinitely.
    // Let normal mode detection handle it after the bounded readiness wait.
    return { waited: true, timedOut: true, initial };
  }
}

export function isTransientScrollLock(snapshot: ScrollReadinessSnapshot) {
  const nativeRangeMissing =
    snapshot.documentScrollRange <= SCROLL_RANGE_THRESHOLD_PX;
  const contentIsTallerThanViewport =
    snapshot.latentContentHeight > snapshot.viewportHeight * 1.5;
  return (
    nativeRangeMissing &&
    contentIsTallerThanViewport &&
    (snapshot.bodyLocked || snapshot.htmlLocked)
  );
}

export function isPotentialScrollLock(snapshot: ScrollReadinessSnapshot) {
  // A site can install its intro lock and tall layout just after `load`, so a
  // one-viewport document is provisional even before overflow becomes hidden.
  return snapshot.documentScrollRange <= SCROLL_RANGE_THRESHOLD_PX;
}

function readinessSnapshot(): ScrollReadinessSnapshot {
  const html = document.documentElement;
  const body = document.body;
  const bodyStyle = body ? getComputedStyle(body) : null;
  const htmlStyle = getComputedStyle(html);
  const candidates = [
    body,
    document.querySelector("main"),
    document.querySelector("[role='main']"),
    ...Array.from(document.querySelectorAll("body > div, body > section")),
  ].filter((element): element is Element => Boolean(element));
  const latentContentHeight = candidates.reduce((largest, element) => {
    const rect = element.getBoundingClientRect();
    return Math.max(
      largest,
      element.scrollHeight,
      rect.height,
      rect.bottom + window.scrollY,
    );
  }, 0);
  const documentHeight = Math.max(
    document.scrollingElement?.scrollHeight ?? html.scrollHeight,
    innerHeight,
  );
  return {
    viewportHeight: innerHeight,
    documentScrollRange: Math.max(0, documentHeight - innerHeight),
    latentContentHeight,
    bodyLocked:
      bodyStyle?.overflow === "hidden" || bodyStyle?.overflowY === "hidden",
    htmlLocked:
      htmlStyle.overflow === "hidden" || htmlStyle.overflowY === "hidden",
  };
}
