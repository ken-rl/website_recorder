#!/usr/bin/env node
import 'dotenv/config'
import fs from 'node:fs/promises'
import path from 'node:path'
import { RecordingJobManager } from './jobs/manager.js'
import type { RecordRequest } from './types.js'

async function main() {
  const configPath = process.argv[2]
  if (!configPath) {
    console.log('Usage: pnpm record <config.json>')
    process.exit(1)
  }

  const raw = await fs.readFile(path.resolve(configPath), 'utf8')
  const request = JSON.parse(raw) as RecordRequest
  const outputRoot = path.resolve(process.env.OUTPUT_DIR ?? './outputs')
  const manager = new RecordingJobManager(outputRoot)
  await manager.initialize()
  const queued = await manager.create(request)
  const job = await manager.waitForCompletion(queued.jobId)
  if (job.status !== 'completed' || !job.result) {
    throw new Error(job.error?.message ?? `Recording ${job.status}`)
  }

  console.log('Recording complete')
  console.log('jobId: ' + job.jobId)
  console.log('mp4: ' + path.join(outputRoot, job.jobId, 'output.mp4'))
  console.log('durationMs: ' + job.result.durationMs)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
