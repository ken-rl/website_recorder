import { chromium, type Page } from "playwright";
import type {
  StoryboardFrame,
  WebsiteInspection,
  WebsiteInteractionCandidate,
  WebsiteSection,
} from "../types.js";
import { gotoReachablePage } from "../browser/goto.js";

export interface RawWebsiteSection {
  label: string;
  selector: string;
  kind: "heading" | "landmark";
  y: number;
  height: number;
  stable: number;
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
    await gotoReachablePage(page, target.href);
    await page
      .waitForLoadState("networkidle", { timeout: 10_000 })
      .catch(() => undefined);
    const pageHeight = await page.evaluate(() =>
      Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
    );
    const scrollMode = await detectInspectionScrollMode(
      page,
      pageHeight,
      viewport.height,
    );
    const safeViewport = await detectInspectionSafeViewport(page, viewport);
    const sections = normalizeInspectionSections(
      await collectSections(page),
      safeViewport,
      viewport.height,
      Math.max(0, pageHeight - viewport.height),
    );
    const interactions = scrollMode === "document"
      ? await collectInteractionCandidates(page)
      : [];
    const { screenshots, storyboard } =
      scrollMode === "virtual"
        ? await takeVirtualStoryboardScreenshots(page, viewport)
        : await takeDocumentStoryboardScreenshots(
            page,
            pageHeight,
            viewport.height,
          );
    const warnings: string[] = [];
    if (page.url() !== target.href) warnings.push(`Redirected to ${page.url()}`);
    if (pageHeight <= viewport.height + 48 && scrollMode === "document") {
      warnings.push("This page has little or no scrollable content.");
    }
    if (scrollMode === "virtual") {
      warnings.push("Virtual scrolling detected; direction uses storyboard progress points.");
    }
    if (safeViewport.topInsetPx > 0) {
      warnings.push(`A ${safeViewport.topInsetPx}px fixed header will be kept clear.`);
    }
    if (scrollMode === "document" && sections.length === 0) {
      warnings.push("No semantic sections were detected; storyboard waypoints will be used.");
    }
    return {
      url: page.url(),
      title: await page.title(),
      pageHeight,
      viewport,
      scrollMode,
      safeViewport,
      sections,
      interactions,
      storyboard,
      screenshots,
      warnings,
    };
  } finally {
    await browser.close();
  }
}

async function collectInteractionCandidates(
  page: Page,
): Promise<WebsiteInteractionCandidate[]> {
  return page.evaluate(`(() => {
    const blocked = /\\b(delete|remove|unsubscribe|sign out|log out|purchase|buy|pay|checkout|submit|send|publish|confirm|destroy|upload|download)\\b/i;
    const pathFor = (element) => {
      if (element.id) return "#" + CSS.escape(element.id);
      for (const name of ["data-testid", "data-test", "data-qa"]) {
        const value = element.getAttribute(name);
        if (value) return "[" + name + "=\\"" + CSS.escape(value) + "\\"]";
      }
      const segments = [];
      let current = element;
      while (current && current !== document.body && segments.length < 5) {
        const parent = current.parentElement;
        const tag = current.tagName.toLowerCase();
        const siblings = parent ? Array.from(parent.children).filter((child) => child.tagName === current.tagName) : [];
        const suffix = siblings.length > 1 ? ":nth-of-type(" + (siblings.indexOf(current) + 1) + ")" : "";
        segments.unshift(tag + suffix);
        current = parent;
      }
      return "body > " + segments.join(" > ");
    };
    return Array.from(document.querySelectorAll("button,a[href],[role='button'],[role='tab'],[role='switch'],[role='menuitem'],[aria-expanded],summary,input:not([type='hidden'])"))
      .flatMap((element, index) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const label = (element.getAttribute("aria-label") || element.getAttribute("title") || element.textContent || element.value || "").replace(/\\s+/g, " ").trim().slice(0, 120);
        if (!label || blocked.test(label) || rect.width < 28 || rect.height < 20 || style.display === "none" || style.visibility === "hidden" || Number(style.opacity) < 0.05 || element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true") return [];
        const tag = element.tagName.toLowerCase();
        const role = element.getAttribute("role") || (tag === "a" ? "link" : tag);
        const type = (element.getAttribute("type") || "").toLowerCase();
        const semanticClick = ["tab", "switch", "menuitem", "option"].includes(role) || element.hasAttribute("aria-expanded") || tag === "summary" || (tag === "button" && type === "button") || (tag === "button" && !element.closest("form") && !type);
        const focusable = element.tabIndex >= 0 || ["button", "a", "input", "summary"].includes(tag);
        const actions = ["hover", ...(focusable ? ["focus"] : []), ...(semanticClick && tag !== "a" ? ["click"] : [])];
        const selector = pathFor(element);
        return [{
          id: "interaction_" + String(index + 1).padStart(2, "0"),
          selector,
          label,
          tag,
          role,
          actions,
          rect: {
            x: Math.round(rect.left + window.scrollX),
            y: Math.round(rect.top + window.scrollY),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
          recommendedTarget: { type: "selector", selector, align: "center" },
          recommendedHoldMs: semanticClick ? 1600 : 1300,
          recommendedZoomScale: rect.width > innerWidth * 0.4 ? 1.12 : 1.28,
        }];
      })
      .slice(0, 30);
  })()`) as Promise<WebsiteInteractionCandidate[]>;
}

export function normalizeInspectionSections(
  raw: RawWebsiteSection[],
  safeViewport: { topInsetPx: number; bottomInsetPx: number },
  viewportHeight: number,
  maxScroll: number,
): WebsiteSection[] {
  const safeTop = safeViewport.topInsetPx + 24;
  const safeBottom = viewportHeight - safeViewport.bottomInsetPx;
  const scored = raw
    .map((section) => ({
      ...section,
      score: (section.kind === "heading" ? 4 : 0) + section.stable * 2,
      recommendedAlign:
        section.kind === "heading" ? ("center" as const) : ("top" as const),
      targetY: Math.max(
        0,
        Math.min(
          maxScroll,
          section.kind === "heading"
            ? section.y + section.height / 2 - (safeTop + safeBottom) / 2
            : section.y - safeTop,
        ),
      ),
    }))
    .sort((a, b) => a.y - b.y || b.score - a.score);
  const selected: typeof scored = [];
  for (const section of scored) {
    const nearby = selected.findIndex(
      (candidate) => Math.abs(candidate.y - section.y) <= 160,
    );
    if (nearby < 0) selected.push(section);
    else if (section.score > selected[nearby].score) selected[nearby] = section;
  }

  let previousTarget = 0;
  return selected
    .sort((a, b) => a.y - b.y)
    .slice(0, 30)
    .map((section) => {
      const distanceFromPrevious = Math.max(0, section.targetY - previousTarget);
      previousTarget = section.targetY;
      const recommendedTransitionMs = Math.max(
        600,
        Math.ceil(
          (((distanceFromPrevious * 1.9) /
            Math.max(1, viewportHeight * 1.5)) *
            1000) /
            50,
        ) * 50,
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
        recommendedTarget: {
          type: "selector" as const,
          selector: section.selector,
          align: section.recommendedAlign,
        },
      };
    });
}

async function collectSections(page: Page): Promise<RawWebsiteSection[]> {
  return page.evaluate(`(() => {
    const pathFor = (element) => {
      if (element.id) return "#" + CSS.escape(element.id);
      const segments = [];
      let current = element;
      while (current && current !== document.body && segments.length < 4) {
        const parent = current.parentElement;
        const tag = current.tagName.toLowerCase();
        const index = parent ? Array.from(parent.children).filter((child) => child.tagName === current.tagName).indexOf(current) + 1 : 1;
        segments.unshift(tag + ":nth-of-type(" + index + ")");
        current = parent;
      }
      return "body > " + segments.join(" > ");
    };
    return Array.from(document.querySelectorAll("h1,h2,h3,main,section,article,header,footer,[role='main'],[role='region']"))
      .map((element) => {
        const tag = element.tagName.toLowerCase();
        const heading = tag.startsWith("h") ? element : element.querySelector("h1,h2,h3");
        const focus = heading || element;
        const rect = focus.getBoundingClientRect();
        const text = (element.getAttribute("aria-label") || heading?.textContent || element.textContent || "").replace(/\s+/g, " ").trim();
        return { label: text.slice(0, 120) || tag, selector: pathFor(focus), kind: heading ? "heading" : "landmark", y: Math.max(0, Math.round(rect.top + window.scrollY)), height: Math.max(1, Math.round(rect.height)), stable: focus.id ? 1 : 0, visible: rect.width > 0 && rect.height > 0 };
      })
      .filter((section) => section.visible && section.label.length > 0 && Number.isFinite(section.y));
  })()`);
}

async function detectInspectionSafeViewport(
  page: Page,
  viewport: { width: number; height: number },
) {
  const topInsetPx = await page.evaluate<number>(`(() => Array.from(document.querySelectorAll("body *")).reduce((inset, element) => {
    const style = getComputedStyle(element); const rect = element.getBoundingClientRect();
    const pinned = style.position === "fixed" || style.position === "sticky";
    const visible = style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0;
    const topBar = rect.top <= 8 && rect.bottom > 0 && rect.width >= ${viewport.width} * 0.5 && rect.height >= 24 && rect.height <= ${viewport.height} * 0.3;
    return pinned && visible && topBar ? Math.max(inset, Math.round(rect.bottom)) : inset;
  }, 0))()`);
  return { topInsetPx, bottomInsetPx: 24 };
}

async function takeDocumentStoryboardScreenshots(
  page: Page,
  pageHeight: number,
  viewportHeight: number,
) {
  const maxScroll = Math.max(0, pageHeight - viewportHeight);
  const positions = [
    ...new Set([
      0,
      Math.round(maxScroll / 3),
      Math.round((maxScroll * 2) / 3),
      maxScroll,
    ]),
  ];
  const screenshots: string[] = [];
  const storyboard: StoryboardFrame[] = [];
  for (const position of positions) {
    await page.evaluate(`window.scrollTo(0, ${position})`);
    await page.waitForTimeout(250);
    screenshots.push(
      (await page.screenshot({ type: "jpeg", quality: 60 })).toString("base64"),
    );
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
      screenshots.push(
        (await page.screenshot({ type: "jpeg", quality: 60 })).toString("base64"),
      );
      storyboard.push({ imageIndex: screenshots.length - 1, target: { type: "progress", value } });
    }
  } finally {
    await cdp.detach().catch(() => undefined);
  }
  return { screenshots, storyboard };
}

async function detectInspectionScrollMode(
  page: Page,
  pageHeight: number,
  viewportHeight: number,
) {
  if (pageHeight - viewportHeight > 48) return "document" as const;
  const virtual = await page.evaluate(`(() => {
    const body = getComputedStyle(document.body); const html = getComputedStyle(document.documentElement);
    const locked = body.overflow === "hidden" || body.overflowY === "hidden" || html.overflow === "hidden" || html.overflowY === "hidden";
    const fixedShell = Array.from(document.querySelectorAll("body *")).some((element) => { const style = getComputedStyle(element); const rect = element.getBoundingClientRect(); return (style.position === "fixed" || style.position === "sticky") && rect.height >= innerHeight * 0.85 && rect.width >= innerWidth * 0.85; });
    return locked || fixedShell || document.querySelectorAll("canvas").length >= 3;
  })()`);
  return virtual ? ("virtual" as const) : ("document" as const);
}

function assertHttpUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only HTTP(S) URLs are supported");
  }
  return url;
}
