import type { Page } from "playwright";

const OVERLAY_SELECTORS = [
  '[id*="cookie"]',
  '[class*="cookie"]',
  '[id*="consent"]',
  '[class*="consent"]',
  ".newsletter-popup",
  '[class*="popup"]',
  '[aria-modal="true"]',
];

export async function sanitizeDom(page: Page, removeOverlayElements: boolean) {
  await page.evaluate(
    ({ selectors, remove }) => {
      const style = document.createElement("style");
      style.innerHTML = `
      ::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
      html, body {
        scroll-behavior: auto !important;
        scrollbar-width: none !important;
        overflow: hidden !important;
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
        min-height: 100% !important;
      }
    `;
      document.head.appendChild(style);

      if (!remove) return;

      for (const selector of selectors) {
        document.querySelectorAll(selector).forEach((el) => {
          if (el === document.documentElement || el === document.body) return;
          el.remove();
        });
      }
    },
    { selectors: OVERLAY_SELECTORS, remove: removeOverlayElements },
  );
}
