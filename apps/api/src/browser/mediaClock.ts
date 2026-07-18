import { performance } from "node:perf_hooks";
import type { Page } from "playwright";

const MEDIA_CLOCK_KEY = "__websiterecorderMediaClock";

/**
 * Screenshot capture can be substantially slower than its output frame rate.
 * Native videos otherwise advance at wall-clock speed and appear fast-forwarded
 * in the encoded sequence. This controller keeps them on the output timeline.
 */
export async function installMediaClock(page: Page): Promise<void> {
  // Use source text rather than a serialized TypeScript callback. tsx/esbuild
  // annotates nested functions with a global __name helper that is not present
  // in a page's isolated init-script world.
  await page.addInitScript({ content: `(() => {
    const key = ${JSON.stringify(MEDIA_CLOCK_KEY)};
    const state = {
      active: false,
      rate: 0.08,
      videos: new Set(),
      register(video) {
        this.videos.add(video);
        video.muted = true;
        setPlaybackRate(video, this.rate);
        if (!this.active) video.pause();
      },
      sync(rate) {
        this.active = true;
        this.rate = rate;
        document.querySelectorAll("video").forEach((video) => this.register(video));
        for (const video of this.videos) {
          if (!video.isConnected) continue;
          video.muted = true;
          setPlaybackRate(video, rate);
          video.play().catch(() => undefined);
        }
        for (const animation of document.getAnimations()) {
          if (animation.timeline && animation.timeline !== document.timeline) continue;
          try {
            animation.playbackRate = rate;
          } catch {
            try {
              animation.updatePlaybackRate(rate);
            } catch {
              // Scroll-timeline or page-owned animations can reject control.
            }
          }
        }
      },
    };

    // Chromium's supported range varies by media implementation. Keep the
    // controller from failing the whole capture when a page rejects a rate.
    function setPlaybackRate(video, rate) {
      try {
        video.playbackRate = Math.max(0.0625, Math.min(16, rate));
      } catch {
        try {
          video.playbackRate = 0.25;
        } catch {
          // Leave the site's default rate in place rather than failing capture.
        }
      }
    }

    Object.defineProperty(window, key, { value: state, configurable: true });
    document.addEventListener("play", (event) => {
      const video = event.target;
      if (video instanceof HTMLVideoElement) state.register(video);
    }, true);
    document.addEventListener("DOMContentLoaded", () => {
      document.querySelectorAll("video").forEach((video) => state.register(video));
    }, { once: true });
  })()` });
}

export async function createMediaClockSync(page: Page, fps: number) {
  const startedAt = performance.now();

  return async (frameNumber: number) => {
    const outputSeconds = frameNumber / fps;
    const wallSeconds = Math.max(0.001, (performance.now() - startedAt) / 1000);
    // A little floor avoids stalling media on very slow, high-resolution captures.
    const rate = Math.min(1, Math.max(0.0625, outputSeconds / wallSeconds || 0.08));
    await page.evaluate(
      ({ key, rate: nextRate }) => {
        const state = (window as unknown as Record<string, {
          sync?: (rate: number) => void;
        }>)[key];
        state?.sync?.(nextRate);
      },
      { key: MEDIA_CLOCK_KEY, rate },
    );
  };
}
