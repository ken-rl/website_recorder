import { chromium, type Page } from "playwright";
import { assertHttpUrl } from "./recording.js";

export interface WebsiteSection {
  label: string;
  selector: string;
  kind: "heading" | "landmark";
  y: number;
}

export interface WebsiteInspection {
  url: string;
  title: string;
  pageHeight: number;
  viewport: { width: number; height: number };
  sections: WebsiteSection[];
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
    await page.goto(target.href, { waitUntil: "networkidle", timeout: 45_000 });
    const pageHeight = await page.evaluate(() => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight));
    const sections = await collectSections(page);
    const screenshots = await takeStoryboardScreenshots(page, pageHeight, viewport.height);
    return { url: page.url(), title: await page.title(), pageHeight, viewport, sections, screenshots };
  } finally {
    await browser.close();
  }
}

async function collectSections(page: Page): Promise<WebsiteSection[]> {
  return page.evaluate(() => {
    const pathFor = (element: Element) => {
      if (element.id) return `#${CSS.escape(element.id)}`;
      const segments: string[] = [];
      let current: Element | null = element;
      while (current && current !== document.body && segments.length < 4) {
        const parent: Element | null = current.parentElement;
        const tag = current.tagName.toLowerCase();
        const index = parent
          ? (Array.from(parent.children) as Element[]).filter((child) => child.tagName === current!.tagName).indexOf(current) + 1
          : 1;
        segments.unshift(`${tag}:nth-of-type(${index})`);
        current = parent;
      }
      return `body > ${segments.join(" > ")}`;
    };

    const found = Array.from(document.querySelectorAll("h1,h2,h3,main,section,article,header,footer,[role='main'],[role='region']"))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const tag = element.tagName.toLowerCase();
        const text = (element.getAttribute("aria-label") || element.textContent || "").replace(/\s+/g, " ").trim();
        return {
          label: text.slice(0, 120) || tag,
          selector: pathFor(element),
          kind: tag.startsWith("h") ? ("heading" as const) : ("landmark" as const),
          y: Math.max(0, Math.round(rect.top + window.scrollY)),
        };
      })
      .filter((section) => section.label.length > 0 && Number.isFinite(section.y));

    return found.filter((section, index) => index === 0 || section.y - found[index - 1].y > 24).slice(0, 30);
  });
}

async function takeStoryboardScreenshots(page: Page, pageHeight: number, viewportHeight: number) {
  const maxScroll = Math.max(0, pageHeight - viewportHeight);
  const positions = [...new Set([0, Math.round(maxScroll / 3), Math.round((maxScroll * 2) / 3), maxScroll])];
  const screenshots: string[] = [];
  for (const position of positions) {
    await page.evaluate((y) => window.scrollTo(0, y), position);
    await page.waitForTimeout(250);
    const image = await page.screenshot({ type: "jpeg", quality: 60 });
    screenshots.push(image.toString("base64"));
  }
  return screenshots;
}
