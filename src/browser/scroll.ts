import type { Page } from "playwright";
import type { BezierControlPoints } from "./curves.js";
import type { PauseTrigger } from "../types.js";

const SCROLL_REFERENCE_FPS = 60;

export async function runSmoothScroll(
  page: Page,
  pixelsPerFrame: number,
  pauseTriggers: PauseTrigger[],
  bezier: BezierControlPoints,
) {
  await page.evaluate(
    async ({ pixelsPerFrame, pauseTriggers, bezier, scrollReferenceFps }) => {
      const [x1, y1, x2, y2] = bezier;

      function sampleCurveX(t: number) {
        const inv = 1 - t;
        return 3 * inv * inv * t * x1 + 3 * inv * t * t * x2 + t * t * t;
      }

      function sampleCurveY(t: number) {
        const inv = 1 - t;
        return 3 * inv * inv * t * y1 + 3 * inv * t * t * y2 + t * t * t;
      }

      function sampleCurveDerivativeX(t: number) {
        return (
          3 * (1 - t) * (1 - t) * x1 +
          6 * (1 - t) * t * (x2 - x1) +
          3 * t * t * (1 - x2)
        );
      }

      function applyCurve(linearProgress: number) {
        if (linearProgress <= 0) return 0;
        if (linearProgress >= 1) return 1;

        let start = 0;
        let end = 1;
        let param = linearProgress;

        for (let i = 0; i < 8; i += 1) {
          param = (start + end) / 2;
          const x = sampleCurveX(param);
          if (x < linearProgress) start = param;
          else end = param;
        }

        param = (start + end) / 2;
        const dx = sampleCurveDerivativeX(param);
        if (Math.abs(dx) > 1e-6) {
          param -= (sampleCurveX(param) - linearProgress) / dx;
        }

        return sampleCurveY(Math.min(1, Math.max(0, param)));
      }

      await new Promise<void>((resolve) => {
        const maxScroll = Math.max(
          0,
          document.documentElement.scrollHeight - window.innerHeight,
        );

        if (maxScroll === 0) {
          resolve();
          return;
        }

        const totalFrames = Math.max(1, maxScroll / pixelsPerFrame);
        const durationMs = totalFrames * (1000 / scrollReferenceFps);
        const detectedTargets = new Set<string>();

        let startTime = 0;
        let pausedMs = 0;
        let pauseStartedAt = 0;

        function elapsedMs(now: number) {
          return now - startTime - pausedMs;
        }

        function step(now: number) {
          if (!startTime) startTime = now;

          for (const trigger of pauseTriggers) {
            const element = document.querySelector(trigger.selector);
            if (element && !detectedTargets.has(trigger.selector)) {
              const rect = element.getBoundingClientRect();
              if (rect.top <= window.innerHeight / 2 && rect.bottom >= 0) {
                detectedTargets.add(trigger.selector);
                pauseStartedAt = performance.now();
                setTimeout(() => {
                  pausedMs += performance.now() - pauseStartedAt;
                  requestAnimationFrame(step);
                }, trigger.durationMs);
                return;
              }
            }
          }

          const linearProgress = Math.min(1, elapsedMs(now) / durationMs);
          const easedProgress = applyCurve(linearProgress);
          const scrollY = maxScroll * easedProgress;

          window.scrollTo({ top: scrollY, left: 0, behavior: "instant" });

          if (linearProgress < 1) requestAnimationFrame(step);
          else resolve();
        }

        requestAnimationFrame(step);
      });
    },
    {
      pixelsPerFrame,
      pauseTriggers,
      bezier,
      scrollReferenceFps: SCROLL_REFERENCE_FPS,
    },
  );
}
