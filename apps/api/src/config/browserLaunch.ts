import type { AnimationConfig } from "../types.js";

export interface BrowserLaunchOptions {
  headless: boolean;
  args: string[];
}

const SHARED_ARGS = [
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
] as const;

/** Software WebGL — fine for headless document pages, too slow for headed WebGL captures. */
const HEADLESS_ARGS = [
  ...SHARED_ARGS,
  "--enable-gpu",
  "--use-angle=swiftshader-webgl",
] as const;

/** Real GPU — required for smooth WebGL scroll-scrubbing captures. */
const HEADED_ARGS = [
  ...SHARED_ARGS,
  "--enable-gpu",
  // Keep the OS window compact — Playwright controls the actual capture viewport
  // via context options, so this only affects the visible window chrome.
  "--window-size=900,700",
  "--window-position=0,0",
] as const;

/**
 * WebGL scroll-scrubbing sites run their render loop at only a few fps in
 * headless Chromium. Use a headed browser with real GPU for virtual-scroll.
 */
export function resolveBrowserLaunch(
  animation: AnimationConfig,
): BrowserLaunchOptions {
  if (process.env.RECORD_HEADED === "1") {
    return { headless: false, args: [...HEADED_ARGS] };
  }

  if (process.env.RECORD_HEADED === "0") {
    return { headless: true, args: [...HEADLESS_ARGS] };
  }

  const scrollMode = animation.scrollMode ?? "auto";

  if (scrollMode === "document") {
    return { headless: true, args: [...HEADLESS_ARGS] };
  }

  if (scrollMode === "virtual") {
    return { headless: false, args: [...HEADED_ARGS] };
  }

  return {
    headless: !process.env.DISPLAY,
    args: process.env.DISPLAY ? [...HEADED_ARGS] : [...HEADLESS_ARGS],
  };
}

export function launchArgsForHeadless(headless: boolean): string[] {
  return headless ? [...HEADLESS_ARGS] : [...HEADED_ARGS];
}

export function shouldWarnHeadlessVirtualCapture(
  scrollStrategy: "document" | "virtual",
  captureHeadless: boolean,
): string | null {
  if (scrollStrategy === "virtual" && captureHeadless) {
    return (
      "Virtual scroll was captured headless; WebGL sites may look choppy. " +
      "Set scrollMode to virtual, use a display (DISPLAY), or set RECORD_HEADED=1."
    );
  }
  return null;
}
