import type { Page } from 'playwright'

const SCROLL_SETTLE_MS = 650
const MAX_SCROLL_PASSES = 3
const MAX_SCROLL_STEPS = 36

async function documentHeight(page: Page) {
  return page.evaluate(() => Math.max(
    document.documentElement.scrollHeight,
    document.body?.scrollHeight ?? 0,
    window.innerHeight
  ))
}

async function waitForStableDocumentHeight(page: Page) {
  let last = await documentHeight(page)
  for (let index = 0; index < 4; index += 1) {
    await page.waitForTimeout(350)
    const next = await documentHeight(page)
    if (Math.abs(next - last) < 8) return
    last = next
  }
}

export async function hydrateLazyContent(page: Page, viewportHeight: number) {
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined)
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }))
  await page.waitForTimeout(300)

  let previousHeight = await documentHeight(page)
  for (let pass = 0; pass < MAX_SCROLL_PASSES; pass += 1) {
    let y = 0
    for (let step = 0; step < MAX_SCROLL_STEPS; step += 1) {
      const height = await documentHeight(page)
      const maxY = Math.max(0, height - viewportHeight)
      y = Math.min(maxY, step === 0 ? 0 : y + Math.floor(viewportHeight * 0.78))
      await page.evaluate((nextY) => window.scrollTo({ top: nextY, left: 0, behavior: 'instant' }), y)
      await page.mouse.wheel(0, Math.floor(viewportHeight * 0.18)).catch(() => undefined)
      await page.waitForTimeout(SCROLL_SETTLE_MS)
      await page.waitForLoadState('networkidle', { timeout: 2500 }).catch(() => undefined)
      if (y >= maxY) break
    }

    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, left: 0, behavior: 'instant' }))
    await page.waitForTimeout(SCROLL_SETTLE_MS)
    const nextHeight = await documentHeight(page)
    if (Math.abs(nextHeight - previousHeight) < 8) break
    previousHeight = nextHeight
  }

  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, left: 0, behavior: 'instant' }))
  await page.waitForTimeout(700)
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }))
  await page.waitForTimeout(700)
  await waitForStableDocumentHeight(page)
}
