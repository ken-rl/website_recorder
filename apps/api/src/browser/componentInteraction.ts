import type { Page } from "playwright";
import type { ComponentInteraction } from "../types.js";

const DESTRUCTIVE = /\b(delete|remove|unsubscribe|sign out|log out|purchase|buy|pay|checkout|submit|send|publish|confirm|destroy|upload|download)\b/i;

export class ComponentInteractionAnimator {
  private activeBeat = -1;

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
      await this.prepare(options.beatIndex, options.selector, options.interaction);
      this.activeBeat = options.beatIndex;
    }

    const approach = smoothstep(Math.min(1, progress / 0.34));
    const depart = progress <= 0.78 ? 1 : 1 - smoothstep((progress - 0.78) / 0.22);
    const amount = Math.min(approach, depart);
    const state = await this.page.evaluate(
      ({ selector, scale, amount, showCursor }) => {
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
        return { x: targetX, y: targetY };
      },
      {
        selector: options.selector,
        scale: options.interaction.zoomScale ?? 1.25,
        amount,
        showCursor: options.interaction.showCursor ?? true,
      },
    );
    if (!state) throw new Error(`Interaction selector was not found or visible: ${options.selector}`);

    await this.page.mouse.move(state.x, state.y);
    if (progress >= 0.38) {
      await this.activateOnce(options.beatIndex, options.selector, options.interaction);
    }
  }

  async reset() {
    if (this.activeBeat < 0) return;
    await this.page.mouse.move(24, 24);
    await this.page.evaluate(() => {
      document.body.style.transform = "none";
      document.body.style.transformOrigin = "";
      const cursor = document.getElementById("__deio-scroll-cursor");
      if (cursor) cursor.style.opacity = "0";
      delete (window as any).__deioScrollInteractionTarget;
    });
    this.activeBeat = -1;
  }

  private async prepare(
    beatIndex: number,
    selector: string,
    interaction: ComponentInteraction,
  ) {
    const allowed = await this.page.evaluate(
      ({ selector, action, destructiveSource }) => {
        const element = document.querySelector(selector) as HTMLElement | null;
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return false;
        const label = (
          element.getAttribute("aria-label")
          || element.getAttribute("title")
          || element.textContent
          || ""
        ).replace(/\s+/g, " ").trim();
        if (new RegExp(destructiveSource, "i").test(label)) return false;
        if (action !== "click") return true;
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
      },
      { selector, action: interaction.action, destructiveSource: DESTRUCTIVE.source },
    );
    if (!allowed) throw new Error(`Unsafe or unsupported ${interaction.action} interaction: ${selector}`);

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
        cursor.innerHTML = `<svg width="30" height="38" viewBox="0 0 30 38" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 2L27 21H16L10 35L2 2Z" fill="white" stroke="#111827" stroke-width="2.5" stroke-linejoin="round"/></svg>`;
        Object.assign(cursor.style, {
          position: "fixed",
          left: "0",
          top: "0",
          width: "30px",
          height: "38px",
          zIndex: "2147483647",
          pointerEvents: "none",
          opacity: "0",
          transformOrigin: "2px 2px",
          filter: "drop-shadow(0 3px 4px rgba(0,0,0,.28))",
        });
        document.documentElement.appendChild(cursor);
      }
    }, selector);
    void beatIndex;
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

export async function installInteractionNavigationGuards(page: Page) {
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
