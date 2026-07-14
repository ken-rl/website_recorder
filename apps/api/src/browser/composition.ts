import type { Page } from "playwright";

export interface SafeViewport {
  topInsetPx: number;
  bottomInsetPx: number;
}

export interface SemanticAnchor {
  selector: string;
  label: string;
  kind: "heading" | "landmark";
  y: number;
  height: number;
  position: number;
}

interface RawSemanticAnchor extends Omit<SemanticAnchor, "position"> {
  stable: number;
  visible: boolean;
}

const COMPOSITION_MARGIN_PX = 24;

export async function detectSafeViewport(
  page: Page,
  viewportWidth: number,
  viewportHeight: number,
): Promise<SafeViewport> {
  const topInsetPx = await page.evaluate<number>(`(() => {
    const width = ${viewportWidth};
    const height = ${viewportHeight};
    return Array.from(document.querySelectorAll("body *")).reduce((inset, element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const pinned = style.position === "fixed" || style.position === "sticky";
      const visible = style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0;
      const isTopBar = rect.top <= 8 && rect.bottom > 0 && rect.width >= width * 0.5 && rect.height >= 24 && rect.height <= height * 0.3;
      return pinned && visible && isTopBar ? Math.max(inset, Math.round(rect.bottom)) : inset;
    }, 0);
  })()`);
  return { topInsetPx, bottomInsetPx: COMPOSITION_MARGIN_PX };
}

export async function collectSemanticAnchors(
  page: Page,
  safeViewport: SafeViewport,
  viewportHeight: number,
  maxScroll: number,
): Promise<SemanticAnchor[]> {
  const candidates = await page.evaluate<RawSemanticAnchor[]>(`(() => {
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
    return Array.from(document.querySelectorAll("h1,h2,h3,main,section,article,footer,[role='main'],[role='region']"))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const tag = element.tagName.toLowerCase();
        const heading = tag.startsWith("h") ? element : element.querySelector("h1,h2,h3");
        const label = (element.getAttribute("aria-label") || heading?.textContent || element.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 120);
        return {
          selector: pathFor(element),
          label,
          kind: tag.startsWith("h") ? "heading" : "landmark",
          y: Math.max(0, Math.round(rect.top + window.scrollY)),
          height: Math.max(1, Math.round(rect.height)),
          visible: rect.width > 0 && rect.height > 0,
          stable: element.id ? 1 : 0,
        };
      })
      .filter((candidate) => candidate.visible && candidate.label);
  })()`);

  const safeCenter =
    (safeViewport.topInsetPx + COMPOSITION_MARGIN_PX + viewportHeight - safeViewport.bottomInsetPx) / 2;
  const scored = candidates.map((candidate) => ({
    ...candidate,
    score: (candidate.kind === "heading" ? 4 : 0) + candidate.stable * 2,
    position: Math.max(
      0,
      Math.min(maxScroll, candidate.y + candidate.height / 2 - safeCenter),
    ),
  })).sort((a, b) => a.y - b.y || b.score - a.score);

  const anchors: typeof scored = [];
  for (const candidate of scored) {
    const nearbyIndex = anchors.findIndex((anchor) => Math.abs(anchor.y - candidate.y) <= 160);
    if (nearbyIndex < 0) anchors.push(candidate);
    else if (candidate.score > anchors[nearbyIndex].score) anchors[nearbyIndex] = candidate;
  }
  return anchors
    .sort((a, b) => a.y - b.y)
    .slice(0, 30)
    .map(({ score: _score, stable: _stable, visible: _visible, ...anchor }) => anchor);
}

export function alignedDocumentPosition(options: {
  y: number;
  height: number;
  align: "top" | "center" | "bottom";
  offsetPx: number;
  safeViewport: SafeViewport;
  viewportHeight: number;
  maxScroll: number;
}) {
  const safeTop = options.safeViewport.topInsetPx + COMPOSITION_MARGIN_PX;
  const safeBottom = options.viewportHeight - options.safeViewport.bottomInsetPx;
  const base = options.align === "top"
    ? options.y - safeTop
    : options.align === "bottom"
      ? options.y + options.height - safeBottom
      : options.y + options.height / 2 - (safeTop + safeBottom) / 2;
  return Math.max(0, Math.min(options.maxScroll, base + options.offsetPx));
}

export function nearestSemanticAnchor(
  anchors: SemanticAnchor[],
  position: number,
  viewportHeight: number,
) {
  return anchors.reduce<SemanticAnchor | null>((best, anchor) => {
    if (Math.abs(anchor.position - position) > viewportHeight * 0.5) return best;
    if (!best || Math.abs(anchor.position - position) < Math.abs(best.position - position)) {
      return anchor;
    }
    return best;
  }, null);
}
