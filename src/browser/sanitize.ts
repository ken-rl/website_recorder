import type { Page } from 'playwright'

const OVERLAY_SELECTORS = [
  '[id*="cookie"]',
  '[class*="cookie"]',
  '[id*="consent"]',
  '[class*="consent"]',
  '[class*="modal"]',
  '.newsletter-popup',
  '[class*="banner"]',
  '[class*="popup"]',
  '[class*="overlay"]',
  '[aria-modal="true"]'
]

export async function sanitizeDom(page: Page, removeOverlayElements: boolean) {
  await page.evaluate(({ selectors, remove }) => {
    const style = document.createElement('style')
    style.innerHTML = `
      ::-webkit-scrollbar { display: none !important; }
      html, body { scroll-behavior: auto !important; scrollbar-width: none !important; }
    `
    document.head.appendChild(style)

    if (!remove) return

    for (const selector of selectors) {
      document.querySelectorAll(selector).forEach((el) => el.remove())
    }
  }, { selectors: OVERLAY_SELECTORS, remove: removeOverlayElements })
}
