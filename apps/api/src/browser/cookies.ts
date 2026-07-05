import type { Page } from 'playwright'

const ACCEPT_SELECTORS = [
  'button[id*="accept" i]',
  'button[class*="accept" i]',
  'button[aria-label*="accept" i]',
  '[data-testid*="cookie" i] button',
  '#onetrust-accept-btn-handler',
  '.cc-accept',
  '[class*="consent" i] button'
]

export async function dismissCookieBanners(page: Page) {
  for (const selector of ACCEPT_SELECTORS) {
    try {
      await page.click(selector, { timeout: 600 })
      await page.waitForTimeout(300)
      return
    } catch {}
  }
}
