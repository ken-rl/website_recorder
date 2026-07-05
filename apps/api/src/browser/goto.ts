import type { Page } from 'playwright'

export async function gotoReachablePage(page: Page, url: string) {
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 30000 })
  } catch (loadError) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })
    } catch {
      throw loadError
    }
  }
}
