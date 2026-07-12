import fs from "node:fs/promises";
import path from "node:path";
import type { Page } from "playwright";

export interface FrameRecorderOptions {
  outputDir: string;
  fps?: number;
  scaleFactor?: number;
  qualityJpeg?: number;
  parallelWorkers?: number;
}

export class FrameRecorder {
  private frameCount = 0;
  private outputDir: string;
  private fps: number;
  private scaleFactor: number;
  private qualityJpeg: number;
  private parallelWorkers: number;
  private captureQueue: Array<{
    frameNum: number;
    page: Page;
    resolve: () => void;
    reject: (e: Error) => void;
  }> = [];
  private activeCaptures = 0;

  constructor(options: FrameRecorderOptions) {
    this.outputDir = options.outputDir;
    this.fps = options.fps ?? 60;
    this.scaleFactor = options.scaleFactor ?? 1;
    this.qualityJpeg = options.qualityJpeg ?? 95;
    this.parallelWorkers = options.parallelWorkers ?? 2;
  }

  async writeFrame(page: Page): Promise<void> {
    return new Promise((resolve, reject) => {
      this.captureQueue.push({
        frameNum: this.frameCount++,
        page,
        resolve,
        reject,
      });
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    while (
      this.activeCaptures < this.parallelWorkers &&
      this.captureQueue.length > 0
    ) {
      const task = this.captureQueue.shift();
      if (!task) break;

      this.activeCaptures++;
      this.captureFrame(task).finally(() => {
        this.activeCaptures--;
        this.processQueue();
      });
    }
  }

  private async captureFrame(task: {
    frameNum: number;
    page: Page;
    resolve: () => void;
    reject: (e: Error) => void;
  }): Promise<void> {
    try {
      const framePath = path.join(
        this.outputDir,
        `frame-${String(task.frameNum).padStart(6, "0")}.jpg`,
      );

      const buffer = await task.page.screenshot({
        type: "jpeg",
        quality: this.qualityJpeg,
        fullPage: false,
      });

      await fs.writeFile(framePath, buffer);
      task.resolve();
    } catch (error) {
      task.reject(error as Error);
    }
  }

  getFrameCount(): number {
    return this.frameCount;
  }

  getFps(): number {
    return this.fps;
  }

  getScaleFactor(): number {
    return this.scaleFactor;
  }
}
