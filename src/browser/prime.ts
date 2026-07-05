import type { Page } from 'playwright'

export async function primeLazyAssets(page: Page) {
  await page.evaluate(async () => {
    const lazyImages = document.querySelectorAll<HTMLImageElement>(
      'img[loading="lazy"], img[data-src], img[data-lazy-src], img[data-original]'
    )

    for (const img of lazyImages) {
      img.loading = 'eager'
      const lazySrc = img.dataset.src ?? img.dataset.lazySrc ?? img.dataset.original
      if (lazySrc) img.src = lazySrc
    }

    await Promise.all(
      Array.from(document.images).map((img) => img.decode().catch(() => undefined))
    )
  })
}
