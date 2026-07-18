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
  recommendedAlign: "top" | "center";
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
      while (current && current !== document.body && segments.length < 12) {
        const parent = current.parentElement;
        const tag = current.tagName.toLowerCase();
        const index = parent ? Array.from(parent.children).filter((child) => child.tagName === current.tagName).indexOf(current) + 1 : 1;
        segments.unshift(tag + ":nth-of-type(" + index + ")");
        current = parent;
      }
      return current === document.body
        ? "body > " + segments.join(" > ")
        : "body " + segments.join(" > ");
    };
    return Array.from(document.querySelectorAll("h1,h2,h3,main,section,article,footer,[role='main'],[role='region']"))
      .map((element) => {
        const tag = element.tagName.toLowerCase();
        const heading = /^h[1-3]$/.test(tag) ? element : element.querySelector("h1,h2,h3");
        const focus = heading || element;
        const focusRect = focus.getBoundingClientRect();
        const label = (
          element.getAttribute("aria-label")
          || heading?.innerText
          || heading?.textContent
          || element.innerText
          || element.textContent
          || ""
        ).replace(/\\s+/g, " ").trim().slice(0, 120);
        return {
          selector: pathFor(focus),
          label,
          kind: heading ? "heading" : "landmark",
          y: Math.max(0, Math.round(focusRect.top + window.scrollY)),
          height: Math.max(1, Math.round(focusRect.height)),
          visible: focusRect.width > 0 && focusRect.height > 0,
          stable: focus.id ? 1 : 0,
        };
      })
      .filter((candidate) => candidate.visible && candidate.label);
  })()`);

  const scored = candidates.map((candidate) => ({
    ...candidate,
    score: (candidate.kind === "heading" ? 4 : 0) + candidate.stable * 2,
    recommendedAlign: candidate.kind === "heading" ? "center" as const : "top" as const,
    position: alignedDocumentPosition({
      y: candidate.y,
      height: candidate.height,
      align: candidate.kind === "heading" ? "center" : "top",
      offsetPx: 0,
      safeViewport,
      viewportHeight,
      maxScroll,
    }),
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

export function resolvePauseFraming(options: {
  y: number;
  height: number;
  position: number;
  align: "top" | "center" | "bottom";
  safeViewport: SafeViewport;
  viewportHeight: number;
  maxScroll: number;
}) {
  const safeTopPx = options.safeViewport.topInsetPx + COMPOSITION_MARGIN_PX;
  const safeBottomPx = options.viewportHeight - options.safeViewport.bottomInsetPx;
  const safeHeight = safeBottomPx - safeTopPx;
  let targetY = Math.max(0, Math.min(options.maxScroll, options.position));
  let align = options.align;
  let top = options.y - targetY;
  let bottom = top + options.height;

  if (options.height > safeHeight) {
    align = "top";
    targetY = alignedDocumentPosition({ ...options, align: "top", offsetPx: 0 });
  } else if (top < safeTopPx) {
    targetY = Math.max(0, Math.min(options.maxScroll, targetY - (safeTopPx - top)));
  } else if (bottom > safeBottomPx) {
    targetY = Math.max(0, Math.min(options.maxScroll, targetY + (bottom - safeBottomPx)));
  }

  top = options.y - targetY;
  bottom = top + options.height;
  const verified = top >= safeTopPx - 1
    && top < safeBottomPx
    && (options.height > safeHeight || bottom <= safeBottomPx + 1);
  return { targetY, align, safeTopPx, safeBottomPx, verified };
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
