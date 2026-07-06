import type { Page } from "playwright";
import type { ScrollMode } from "../types.js";

const DOCUMENT_SCROLL_THRESHOLD_PX = 48;

export type ResolvedScrollMode = "document" | "virtual";

export async function detectScrollMode(
  page: Page,
  requestedMode: ScrollMode = "auto",
): Promise<ResolvedScrollMode> {
  if (requestedMode === "document" || requestedMode === "virtual") {
    return requestedMode;
  }

  const signals = await page.evaluate((threshold) => {
    const docMaxScroll = Math.max(
      0,
      document.documentElement.scrollHeight - window.innerHeight,
    );
    const bodyStyle = getComputedStyle(document.body);
    const htmlStyle = getComputedStyle(document.documentElement);
    const bodyScrollLocked =
      bodyStyle.overflowY === "hidden" || bodyStyle.overflow === "hidden";
    const htmlScrollLocked =
      htmlStyle.overflowY === "hidden" || htmlStyle.overflow === "hidden";
    const viewportLocked =
      Math.abs(document.documentElement.scrollHeight - window.innerHeight) <=
        threshold &&
      Math.abs((document.body?.scrollHeight ?? 0) - window.innerHeight) <=
        threshold;

    const fixedViewportShell = [...document.querySelectorAll("body *")].some(
      (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          (style.position === "fixed" || style.position === "sticky") &&
          rect.height >= window.innerHeight * 0.85 &&
          rect.width >= window.innerWidth * 0.85
        );
      },
    );

    const canvasHeavy = document.querySelectorAll("canvas").length >= 3;
    const innerScrollContainers = [...document.querySelectorAll("*")].filter(
      (element) => {
        const style = getComputedStyle(element);
        return (
          (style.overflowY === "auto" || style.overflowY === "scroll") &&
          element.scrollHeight > element.clientHeight + threshold
        );
      },
    ).length;

    return {
      docMaxScroll,
      viewportLocked,
      bodyScrollLocked,
      htmlScrollLocked,
      fixedViewportShell,
      canvasHeavy,
      innerScrollContainers,
    };
  }, DOCUMENT_SCROLL_THRESHOLD_PX);

  if (signals.docMaxScroll > DOCUMENT_SCROLL_THRESHOLD_PX) {
    return "document";
  }

  const canNativeScroll = await page.evaluate(() => {
    const before = window.scrollY;
    window.scrollTo({ top: 100, left: 0, behavior: "instant" });
    const after = window.scrollY;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    return after > before;
  });

  if (canNativeScroll) {
    return "document";
  }

  const lowNativeScroll = signals.docMaxScroll <= DOCUMENT_SCROLL_THRESHOLD_PX;

  const virtualSignals = [
    lowNativeScroll && signals.viewportLocked,
    lowNativeScroll && (signals.bodyScrollLocked || signals.htmlScrollLocked),
    lowNativeScroll && signals.fixedViewportShell,
    signals.canvasHeavy && lowNativeScroll,
    signals.innerScrollContainers > 0 && lowNativeScroll,
  ];

  return virtualSignals.some(Boolean) ? "virtual" : "document";
}
