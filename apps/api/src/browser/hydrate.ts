import type { Page } from "playwright";

const DEFAULT_SCROLL_SETTLE_MS = 650;
const DEFAULT_MAX_SCROLL_PASSES = 3;
const DEFAULT_MAX_SCROLL_STEPS = 36;

const FAST_SCROLL_SETTLE_MS = 180;
const FAST_MAX_SCROLL_PASSES = 1;
const FAST_MAX_SCROLL_STEPS = 10;

export interface HydrateOptions {
  fast?: boolean;
  /** Wheel nudges help virtual-scroll sites; skip on document-scroll pages. */
  useWheel?: boolean;
}

async function documentHeight(page: Page) {
  return page.evaluate(() =>
    Math.max(
      document.documentElement.scrollHeight,
      document.body?.scrollHeight ?? 0,
      window.innerHeight,
    ),
  );
}

async function waitForStableDocumentHeight(
  page: Page,
  settleMs: number,
  fast: boolean,
) {
  const checks = fast ? 2 : 4;
  let last = await documentHeight(page);
  for (let index = 0; index < checks; index += 1) {
    await page.waitForTimeout(fast ? 150 : 350);
    const next = await documentHeight(page);
    if (Math.abs(next - last) < 8) return;
    last = next;
  }
}

export async function hydrateLazyContent(
  page: Page,
  viewportHeight: number,
  options: HydrateOptions = {},
) {
  const fast = options.fast ?? false;
  const useWheel = options.useWheel ?? true;
  const scrollSettleMs = fast
    ? FAST_SCROLL_SETTLE_MS
    : DEFAULT_SCROLL_SETTLE_MS;
  const maxPasses = fast ? FAST_MAX_SCROLL_PASSES : DEFAULT_MAX_SCROLL_PASSES;
  const maxSteps = fast ? FAST_MAX_SCROLL_STEPS : DEFAULT_MAX_SCROLL_STEPS;
  const networkIdleTimeout = fast ? 1200 : 8000;
  const stepNetworkTimeout = fast ? 800 : 2500;

  await page
    .waitForLoadState("networkidle", { timeout: networkIdleTimeout })
    .catch(() => undefined);
  await page.evaluate(() =>
    window.scrollTo({ top: 0, left: 0, behavior: "instant" }),
  );
  await page.waitForTimeout(fast ? 120 : 300);

  let previousHeight = await documentHeight(page);
  for (let pass = 0; pass < maxPasses; pass += 1) {
    let y = 0;
    for (let step = 0; step < maxSteps; step += 1) {
      const height = await documentHeight(page);
      const maxY = Math.max(0, height - viewportHeight);
      y = Math.min(
        maxY,
        step === 0 ? 0 : y + Math.floor(viewportHeight * (fast ? 0.9 : 0.78)),
      );
      await page.evaluate(
        (nextY) =>
          window.scrollTo({ top: nextY, left: 0, behavior: "instant" }),
        y,
      );
      if (useWheel) {
        await page.mouse
          .wheel(0, Math.floor(viewportHeight * (fast ? 0.3 : 0.18)))
          .catch(() => undefined);
      }
      await page.waitForTimeout(scrollSettleMs);
      await page
        .waitForLoadState("networkidle", { timeout: stepNetworkTimeout })
        .catch(() => undefined);
      if (y >= maxY) break;
    }

    await page.evaluate(() =>
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        left: 0,
        behavior: "instant",
      }),
    );
    await page.waitForTimeout(scrollSettleMs);
    const nextHeight = await documentHeight(page);
    if (Math.abs(nextHeight - previousHeight) < 8) break;
    previousHeight = nextHeight;
  }

  await page.evaluate(() =>
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      left: 0,
      behavior: "instant",
    }),
  );
  await page.waitForTimeout(fast ? 200 : 700);
  await page.evaluate(() =>
    window.scrollTo({ top: 0, left: 0, behavior: "instant" }),
  );
  await page.waitForTimeout(fast ? 200 : 700);
  await waitForStableDocumentHeight(page, scrollSettleMs, fast);
}
