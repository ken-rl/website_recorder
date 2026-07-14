import { chromium, type Page } from "playwright";
import { assertHttpUrl } from "./recording.js";

export interface WebsiteSection {
  label: string;
  selector: string;
  kind: "heading" | "landmark";
  y: number;
  progress: number;
  height: number;
  targetY: number;
  distanceFromPrevious: number;
  recommendedTransitionMs: number;
}

export interface StoryboardFrame {
  imageIndex: number;
  target: { type: "progress"; value: number };
  y?: number;
}

export interface WebsiteInspection {
  url: string;
  title: string;
  pageHeight: number;
  viewport: { width: number; height: number };
  scrollMode: "document" | "virtual";
  safeViewport: { topInsetPx: number; bottomInsetPx: number };
  sections: WebsiteSection[];
  storyboard: StoryboardFrame[];
  screenshots: string[];
}

export async function inspectWebsite(options: {
  targetUrl: string;
  viewport?: { width: number; height: number };
}): Promise<WebsiteInspection> {
  const target = assertHttpUrl(options.targetUrl);
  const viewport = options.viewport ?? { width: 1280, height: 720 };
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({ viewport });
    await page.goto(target.href, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
    const pageHeight = await page.evaluate(() => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight));
    const scrollMode = await detectInspectionScrollMode(page, pageHeight, viewport.height);
    const safeViewport = await detectInspectionSafeViewport(page, viewport);
    const sections = normalizeInspectionSections(
      await collectSections(page),
      safeViewport,
      viewport.height,
      Math.max(0, pageHeight - viewport.height),
    );
    const { screenshots, storyboard } = scrollMode === "virtual"
      ? await takeVirtualStoryboardScreenshots(page, viewport)
      : await takeDocumentStoryboardScreenshots(page, pageHeight, viewport.height);
    return { url: page.url(), title: await page.title(), pageHeight, viewport, scrollMode, safeViewport, sections, storyboard, screenshots };
  } finally {
    await browser.close();
  }
}

interface RawWebsiteSection {
  label: string;
  selector: string;
  kind: "heading" | "landmark";
  y: number;
  height: number;
  stable: number;
}

async function collectSections(page: Page): Promise<RawWebsiteSection[]> {
  // Keep this callback as source text: the MCP bundle adds a `__name` helper to
  // normal function expressions, which is unavailable inside the browser realm.
  return page.evaluate(`(() => {
    const pathFor = (element) => {
      if (element.id) return "#" + CSS.escape(element.id);
      const segments = [];
      let current = element;
      while (current && current !== document.body && segments.length < 4) {
        const parent = current.parentElement;
        const tag = current.tagName.toLowerCase();
        const index = parent
          ? Array.from(parent.children).filter((child) => child.tagName === current.tagName).indexOf(current) + 1
          : 1;
        segments.unshift(tag + ":nth-of-type(" + index + ")");
        current = parent;
      }
      return "body > " + segments.join(" > ");
    };

    const found = Array.from(document.querySelectorAll("h1,h2,h3,main,section,article,header,footer,[role='main'],[role='region']"))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const tag = element.tagName.toLowerCase();
        const heading = tag.startsWith("h") ? element : element.querySelector("h1,h2,h3");
        const text = (element.getAttribute("aria-label") || heading?.textContent || element.textContent || "").replace(/\s+/g, " ").trim();
        return {
          label: text.slice(0, 120) || tag,
          selector: pathFor(element),
          kind: tag.startsWith("h") ? "heading" : "landmark",
          y: Math.max(0, Math.round(rect.top + window.scrollY)),
          height: Math.max(1, Math.round(rect.height)),
          stable: element.id ? 1 : 0,
          visible: rect.width > 0 && rect.height > 0,
        };
      })
      .filter((section) => section.visible && section.label.length > 0 && Number.isFinite(section.y));

    return found;
  })()`);
}

function normalizeInspectionSections(
  raw: RawWebsiteSection[],
  safeViewport: { topInsetPx: number; bottomInsetPx: number },
  viewportHeight: number,
  maxScroll: number,
): WebsiteSection[] {
  const safeTop = safeViewport.topInsetPx + 24;
  const safeBottom = viewportHeight - safeViewport.bottomInsetPx;
  const safeCenter = (safeTop + safeBottom) / 2;
  const scored = raw.map((section) => ({
    ...section,
    score: (section.kind === "heading" ? 4 : 0) + section.stable * 2,
    targetY: Math.max(0, Math.min(maxScroll, section.y + section.height / 2 - safeCenter)),
  })).sort((a, b) => a.y - b.y || b.score - a.score);
  const selected: typeof scored = [];
  for (const section of scored) {
    const nearby = selected.findIndex((candidate) => Math.abs(candidate.y - section.y) <= 160);
    if (nearby < 0) selected.push(section);
    else if (section.score > selected[nearby].score) selected[nearby] = section;
  }

  let previousTarget = 0;
  return selected.sort((a, b) => a.y - b.y).slice(0, 30).map((section) => {
    const distanceFromPrevious = Math.max(0, section.targetY - previousTarget);
    previousTarget = section.targetY;
    const recommendedTransitionMs = Math.max(
      600,
      Math.ceil(((distanceFromPrevious * 1.9) / Math.max(1, viewportHeight * 1.5) * 1000) / 50) * 50,
    );
    return {
      label: section.label,
      selector: section.selector,
      kind: section.kind,
      y: section.y,
      height: section.height,
      targetY: section.targetY,
      progress: maxScroll === 0 ? 0 : section.targetY / maxScroll,
      distanceFromPrevious,
      recommendedTransitionMs,
    };
  });
}

async function detectInspectionSafeViewport(
  page: Page,
  viewport: { width: number; height: number },
) {
  const topInsetPx = await page.evaluate<number>(`(() => {
    return Array.from(document.querySelectorAll("body *")).reduce((inset, element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const pinned = style.position === "fixed" || style.position === "sticky";
      const visible = style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0;
      const topBar = rect.top <= 8 && rect.bottom > 0 && rect.width >= ${viewport.width} * 0.5 && rect.height >= 24 && rect.height <= ${viewport.height} * 0.3;
      return pinned && visible && topBar ? Math.max(inset, Math.round(rect.bottom)) : inset;
    }, 0);
  })()`);
  return { topInsetPx, bottomInsetPx: 24 };
}

async function takeDocumentStoryboardScreenshots(page: Page, pageHeight: number, viewportHeight: number) {
  const maxScroll = Math.max(0, pageHeight - viewportHeight);
  const positions = [...new Set([0, Math.round(maxScroll / 3), Math.round((maxScroll * 2) / 3), maxScroll])];
  const screenshots: string[] = [];
  const storyboard: StoryboardFrame[] = [];
  for (const position of positions) {
    await page.evaluate(`window.scrollTo(0, ${position})`);
    await page.waitForTimeout(250);
    const image = await page.screenshot({ type: "jpeg", quality: 60 });
    screenshots.push(image.toString("base64"));
    storyboard.push({
      imageIndex: screenshots.length - 1,
      target: { type: "progress", value: maxScroll === 0 ? 0 : position / maxScroll },
      y: position,
    });
  }
  return { screenshots, storyboard };
}

async function takeVirtualStoryboardScreenshots(
  page: Page,
  viewport: { width: number; height: number },
) {
  const progressPoints = [0, 0.25, 0.5, 0.75, 1];
  const wheelBudget = viewport.height * 8;
  const centerX = Math.floor(viewport.width / 2);
  const centerY = Math.floor(viewport.height / 2);
  const cdp = await page.context().newCDPSession(page);
  const screenshots: string[] = [];
  const storyboard: StoryboardFrame[] = [];
  let dispatched = 0;

  try {
    await page.mouse.move(centerX, centerY);
    await page.mouse.click(centerX, centerY);
    for (const value of progressPoints) {
      const target = value * wheelBudget;
      if (target > dispatched) {
        const delta = (target - dispatched) / 20;
        for (let tick = 0; tick < 20; tick += 1) {
          await cdp.send("Input.dispatchMouseEvent", {
            type: "mouseWheel",
            x: centerX,
            y: centerY,
            deltaX: 0,
            deltaY: delta,
          });
          await page.waitForTimeout(16);
        }
        dispatched = target;
        await page.waitForTimeout(250);
      }
      const image = await page.screenshot({ type: "jpeg", quality: 60 });
      screenshots.push(image.toString("base64"));
      storyboard.push({ imageIndex: screenshots.length - 1, target: { type: "progress", value } });
    }
  } finally {
    await cdp.detach().catch(() => undefined);
  }
  return { screenshots, storyboard };
}

async function detectInspectionScrollMode(page: Page, pageHeight: number, viewportHeight: number) {
  if (pageHeight - viewportHeight > 48) return "document" as const;
  const virtual = await page.evaluate(`(() => {
    const body = getComputedStyle(document.body);
    const html = getComputedStyle(document.documentElement);
    const locked = body.overflow === "hidden" || body.overflowY === "hidden" || html.overflow === "hidden" || html.overflowY === "hidden";
    const fixedShell = Array.from(document.querySelectorAll("body *")).some((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (style.position === "fixed" || style.position === "sticky") && rect.height >= innerHeight * 0.85 && rect.width >= innerWidth * 0.85;
    });
    return locked || fixedShell || document.querySelectorAll("canvas").length >= 3;
  })()`);
  return virtual ? "virtual" as const : "document" as const;
}
