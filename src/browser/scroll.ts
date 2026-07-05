import type { Page } from 'playwright'
import type { PauseTrigger } from '../types.js'

export async function runSmoothScroll(
  page: Page,
  pixelsPerFrame: number,
  pauseTriggers: PauseTrigger[]
) {
  await page.evaluate(async ({ pixelsPerFrame, pauseTriggers }) => {
    await new Promise<void>((resolve) => {
      let currentScroll = 0
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight
      const detectedTargets = new Set<string>()

      function step() {
        for (const trigger of pauseTriggers) {
          const element = document.querySelector(trigger.selector)
          if (element && !detectedTargets.has(trigger.selector)) {
            const rect = element.getBoundingClientRect()
            if (rect.top <= window.innerHeight / 2 && rect.bottom >= 0) {
              detectedTargets.add(trigger.selector)
              setTimeout(() => { requestAnimationFrame(step) }, trigger.durationMs)
              return
            }
          }
        }

        if (currentScroll < maxScroll) {
          currentScroll = Math.min(currentScroll + pixelsPerFrame, maxScroll)
          window.scrollTo(0, currentScroll)
          requestAnimationFrame(step)
        } else {
          resolve()
        }
      }

      requestAnimationFrame(step)
    })
  }, { pixelsPerFrame, pauseTriggers })
}
