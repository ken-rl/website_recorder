import type { Page } from "playwright";
import type { ComponentInteraction, MotionBeat } from "../types.js";

const DESTRUCTIVE = /\b(delete|remove|unsubscribe|sign out|log out|purchase|buy|pay|checkout|submit|send|publish|confirm|destroy|upload|download)\b/i;
const CURSOR_ARRIVAL_PROGRESS = 0.34;
const HOVER_ACTIVATION_PROGRESS = 0.46;
const ACTION_ACTIVATION_PROGRESS = 0.56;
const CURSOR_DEPART_PROGRESS = 0.78;
const HOVER_RELEASE_PROGRESS = 0.82;

export class ComponentInteractionAnimator {
  private activeBeat = -1;
  private activeSelector = "";

  constructor(private readonly page: Page) {}

  async render(options: {
    beatIndex: number;
    selector: string;
    interaction: ComponentInteraction;
    progress: number;
  }) {
    const progress = Math.max(0, Math.min(1, options.progress));
    if (this.activeBeat !== options.beatIndex) {
      await this.reset();
      this.activeSelector = await this.prepare(
        options.beatIndex,
        options.selector,
        options.interaction,
      );
      this.activeBeat = options.beatIndex;
    }

    const approach = smoothstep(Math.min(1, progress / CURSOR_ARRIVAL_PROGRESS));
    const depart = progress <= CURSOR_DEPART_PROGRESS
      ? 1
      : 1 - smoothstep((progress - CURSOR_DEPART_PROGRESS) / (1 - CURSOR_DEPART_PROGRESS));
    const amount = Math.min(approach, depart);
    const hoverActive = progress >= HOVER_ACTIVATION_PROGRESS
      && progress <= HOVER_RELEASE_PROGRESS;
    const state = await this.page.evaluate(
      ({ selector, scale, amount, showCursor, pointerActive }) => {
        const element = document.querySelector(selector) as HTMLElement | null;
        const cursor = document.getElementById("__deio-scroll-cursor") as HTMLElement | null;
        if (!element || !cursor) return null;
        const target = (window as any).__deioScrollInteractionTarget as { x: number; y: number; pageX: number; pageY: number } | undefined;
        if (!target) return null;
        const targetX = target.x;
        const targetY = target.y;
        const startX = innerWidth * 0.82;
        const startY = innerHeight * 0.82;
        const x = startX + (targetX - startX) * amount;
        const y = startY + (targetY - startY) * amount;
        const zoom = 1 + (scale - 1) * amount;
        document.body.style.transformOrigin = `${target.pageX}px ${target.pageY}px`;
        document.body.style.transform = `scale(${zoom})`;
        cursor.style.opacity = showCursor && amount > 0.02 ? "1" : "0";
        cursor.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${0.86 + amount * 0.14})`;
        cursor.dataset.kind = pointerActive ? "pointer" : "arrow";
        const arrow = cursor.querySelector("[data-deio-cursor-arrow]") as SVGElement | null;
        const pointer = cursor.querySelector("[data-deio-cursor-pointer]") as SVGElement | null;
        if (arrow) arrow.style.display = pointerActive ? "none" : "block";
        if (pointer) pointer.style.display = pointerActive ? "block" : "none";
        return { targetX, targetY, startX, startY };
      },
      {
        selector: this.activeSelector,
        scale: options.interaction.zoomScale ?? 1.25,
        amount,
        showCursor: options.interaction.showCursor ?? true,
        pointerActive: hoverActive,
      },
    );
    if (!state) throw new Error(`Interaction selector was not found or visible: ${options.selector}`);

    // The browser's real mouse must remain away from the target until the
    // rendered cursor has arrived and settled, otherwise :hover changes early.
    await this.page.mouse.move(
      hoverActive ? state.targetX : state.startX,
      hoverActive ? state.targetY : state.startY,
    );
    if (
      progress >= ACTION_ACTIVATION_PROGRESS
      && progress <= HOVER_RELEASE_PROGRESS
    ) {
      await this.activateOnce(options.beatIndex, this.activeSelector, options.interaction);
    }
  }

  async reset() {
    if (this.activeBeat < 0) return;
    await this.page.mouse.move(24, 24);
    await this.page.evaluate(() => {
      document.body.style.transform = "none";
      document.body.style.transformOrigin = "";
      const cursor = document.getElementById("__deio-scroll-cursor");
      if (cursor) {
        cursor.style.opacity = "0";
        cursor.dataset.kind = "arrow";
        const arrow = cursor.querySelector("[data-deio-cursor-arrow]") as SVGElement | null;
        const pointer = cursor.querySelector("[data-deio-cursor-pointer]") as SVGElement | null;
        if (arrow) arrow.style.display = "block";
        if (pointer) pointer.style.display = "none";
      }
      delete (window as any).__deioScrollInteractionTarget;
    });
    this.activeBeat = -1;
    this.activeSelector = "";
  }

  private async prepare(
    beatIndex: number,
    selector: string,
    interaction: ComponentInteraction,
  ) {
    await ensurePlaywrightEvaluationRuntime(this.page);
    const resolved = await resolveInteractionTarget(
      this.page,
      selector,
      interaction,
      `beat-${beatIndex}`,
    );
    if (resolved.recovered) {
      console.warn(
        `Recovered interaction ${interaction.candidateId ?? beatIndex} by semantic label “${resolved.label}”`,
      );
    }

    await this.page.evaluate((targetSelector) => {
      document.body.style.transition = "none";
      const target = document.querySelector(targetSelector);
      const rect = target?.getBoundingClientRect();
      if (!rect) return;
      (window as any).__deioScrollInteractionTarget = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        pageX: rect.left + rect.width / 2 + scrollX,
        pageY: rect.top + rect.height / 2 + scrollY,
      };
      let cursor = document.getElementById("__deio-scroll-cursor") as HTMLElement | null;
      if (!cursor) {
        cursor = document.createElement("div");
        cursor.id = "__deio-scroll-cursor";
        cursor.setAttribute("aria-hidden", "true");
        cursor.dataset.kind = "arrow";
        // Glyphs from Bootstrap Icons 1.13.1 (MIT):
        // https://icons.getbootstrap.com/icons/cursor/
        // https://icons.getbootstrap.com/icons/hand-index-fill/
        cursor.innerHTML = `
          <svg data-deio-cursor-arrow width="30" height="30" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
            <path d="M14.082 2.182a.5.5 0 0 1 .103.557L8.528 15.467a.5.5 0 0 1-.917-.007L5.57 10.694.803 8.652a.5.5 0 0 1-.006-.916l12.728-5.657a.5.5 0 0 1 .556.103zM2.25 8.184l3.897 1.67a.5.5 0 0 1 .262.263l1.67 3.897L12.743 3.52z" fill="white" stroke="#111827" stroke-width=".65" stroke-linejoin="round"/>
          </svg>
          <svg data-deio-cursor-pointer width="30" height="30" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" style="display:none;transform:translateX(-8px)">
            <path d="M8.5 4.466V1.75a1.75 1.75 0 1 0-3.5 0v5.34l-1.2.24a1.5 1.5 0 0 0-1.196 1.636l.345 3.106a2.5 2.5 0 0 0 .405 1.11l1.433 2.15A1.5 1.5 0 0 0 6.035 16h6.385a1.5 1.5 0 0 0 1.302-.756l1.395-2.441a3.5 3.5 0 0 0 .444-1.389l.271-2.715a2 2 0 0 0-1.99-2.199h-.581a5 5 0 0 0-.195-.248c-.191-.229-.51-.568-.88-.716-.364-.146-.846-.132-1.158-.108l-.132.012a1.26 1.26 0 0 0-.56-.642 2.6 2.6 0 0 0-.738-.288c-.31-.062-.739-.058-1.05-.046z" fill="white" stroke="#111827" stroke-width=".65" stroke-linejoin="round"/>
          </svg>`;
        Object.assign(cursor.style, {
          position: "fixed",
          left: "0",
          top: "0",
          width: "32px",
          height: "38px",
          zIndex: "2147483647",
          pointerEvents: "none",
          opacity: "0",
          transformOrigin: "2px 2px",
          filter: "drop-shadow(0 3px 4px rgba(0,0,0,.28))",
        });
        document.documentElement.appendChild(cursor);
      }
    }, resolved.selector);
    return resolved.selector;
  }

  private async activateOnce(
    beatIndex: number,
    selector: string,
    interaction: ComponentInteraction,
  ) {
    const key = `__deio_interaction_${beatIndex}`;
    const alreadyActivated = await this.page.evaluate((name) => Boolean((window as any)[name]), key);
    if (alreadyActivated) return;
    await this.page.evaluate((name) => { (window as any)[name] = true; }, key);
    const locator = this.page.locator(selector).first();
    if (interaction.action === "focus") {
      await locator.focus();
    } else if (interaction.action === "click") {
      await this.page.mouse.down();
      await this.page.waitForTimeout(70);
      await this.page.mouse.up();
    }
  }
}

export async function preflightComponentInteractions(
  page: Page,
  beats: MotionBeat[],
) {
  await ensurePlaywrightEvaluationRuntime(page);
  const interactive = beats.flatMap((beat, beatIndex) => {
    if (!beat.interaction) return [];
    if (beat.target.type !== "selector") {
      throw new Error(`Interactive beat ${beatIndex + 1} requires a selector target`);
    }
    return [{
      beatIndex,
      beat,
      selector: beat.target.selector,
      interaction: beat.interaction,
    }];
  });
  const results = [];
  for (const item of interactive) {
    const resolved = await resolveInteractionTarget(
      page,
      item.selector,
      item.interaction,
    );
    if (resolved.recovered && item.beat.target.type === "selector") {
      // The recovered element is tagged in this capture page. Updating the
      // target before timeline resolution keeps zoom framing and scroll
      // position tied to the live control rather than its old approximation.
      item.beat.target.selector = resolved.selector;
    }
    results.push(resolved);
  }
  return results;
}

export async function installInteractionNavigationGuards(page: Page) {
  await ensurePlaywrightEvaluationRuntime(page);
  page.on("dialog", (dialog) => dialog.dismiss().catch(() => undefined));
  page.on("download", (download) => download.cancel().catch(() => undefined));
  page.context().on("page", (popup) => {
    if (popup !== page) void popup.close();
  });
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
  await page.evaluate(() => {
    window.open = () => null;
    const pushState = history.pushState.bind(history);
    const replaceState = history.replaceState.bind(history);
    const safeHistoryUrl = (value?: string | URL | null) => {
      if (!value) return true;
      const next = new URL(String(value), location.href);
      return next.origin === location.origin && next.pathname === location.pathname;
    };
    history.pushState = ((state: unknown, unused: string, url?: string | URL | null) => {
      if (safeHistoryUrl(url)) pushState(state, unused, url);
    }) as History["pushState"];
    history.replaceState = ((state: unknown, unused: string, url?: string | URL | null) => {
      if (safeHistoryUrl(url)) replaceState(state, unused, url);
    }) as History["replaceState"];
    document.addEventListener("submit", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
  });
}

function smoothstep(value: number) {
  const x = Math.max(0, Math.min(1, value));
  return x * x * (3 - 2 * x);
}

async function ensurePlaywrightEvaluationRuntime(page: Page) {
  // tsx/esbuild can annotate nested functions with a global __name helper.
  // Playwright serializes the callback but not that helper into the page.
  await page.evaluate("window.__name = window.__name || ((target) => target)");
}

async function resolveInteractionTarget(
  page: Page,
  selector: string,
  interaction: ComponentInteraction,
  marker?: string,
): Promise<{ selector: string; label: string; recovered: boolean }> {
  const resolved = await page.evaluate(
    ({ selector, interaction, destructiveSource, marker }) => {
      const normalize = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();
      const labelFor = (element: Element) => (
        element.getAttribute("aria-label")
        || element.getAttribute("title")
        || element.textContent
        || (element as HTMLInputElement).value
        || ""
      ).replace(/\s+/g, " ").trim().slice(0, 120);
      const roleFor = (element: Element) => (
        element.getAttribute("role")
        || (element.tagName.toLowerCase() === "a" ? "link" : element.tagName.toLowerCase())
      ).toLowerCase();
      const visible = (element: Element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0
          && style.display !== "none"
          && style.visibility !== "hidden"
          && Number(style.opacity) >= 0.05;
      };
      const clickSafe = (element: Element) => {
        const tag = element.tagName.toLowerCase();
        const role = element.getAttribute("role") || "";
        const type = (element.getAttribute("type") || "").toLowerCase();
        return tag !== "a" && (
          ["tab", "switch", "menuitem", "option"].includes(role)
          || element.hasAttribute("aria-expanded")
          || tag === "summary"
          || (tag === "button" && type === "button")
          || (tag === "button" && !element.closest("form") && !type)
        );
      };
      const safe = (element: Element) => {
        const label = labelFor(element);
        return visible(element)
          && !new RegExp(destructiveSource, "i").test(label)
          && (interaction.action !== "click" || clickSafe(element));
      };
      const expectedLabel = normalize(interaction.label || "");
      const expectedRole = normalize(interaction.role || "");
      let exact: Element | null = null;
      try { exact = document.querySelector(selector); } catch {}
      if (
        exact
        && safe(exact)
        && (!expectedLabel || normalize(labelFor(exact)) === expectedLabel)
        && (!expectedRole || roleFor(exact) === expectedRole)
      ) {
        if (marker) exact.setAttribute("data-deio-interaction-key", marker);
        return {
          selector: marker ? `[data-deio-interaction-key="${marker}"]` : selector,
          label: labelFor(exact),
          recovered: false,
        };
      }
      if (!expectedLabel) return null;
      const candidates = Array.from(document.querySelectorAll(
        "button,a[href],[role='button'],[role='tab'],[role='switch'],[role='menuitem'],[aria-expanded],summary,input:not([type='hidden'])",
      )).filter(safe);
      const ranked = candidates.map((element) => {
        const label = normalize(labelFor(element));
        const role = roleFor(element);
        let score = label === expectedLabel ? 100 : 0;
        if (!score && (label.includes(expectedLabel) || expectedLabel.includes(label))) score = 65;
        if (expectedRole && role === expectedRole) score += 25;
        return { element, score };
      }).sort((a, b) => b.score - a.score);
      const match = ranked[0];
      if (!match || match.score < 80) return null;
      const key = marker || `preflight-${Math.random().toString(36).slice(2)}`;
      match.element.setAttribute("data-deio-interaction-key", key);
      return {
        selector: `[data-deio-interaction-key="${key}"]`,
        label: labelFor(match.element),
        recovered: true,
      };
    },
    {
      selector,
      interaction,
      destructiveSource: DESTRUCTIVE.source,
      marker,
    },
  );
  if (!resolved) {
    throw new Error(
      `Interaction preflight could not safely resolve ${interaction.candidateId ?? selector}`
      + (interaction.label ? ` (“${interaction.label}”)` : ""),
    );
  }
  return resolved;
}
