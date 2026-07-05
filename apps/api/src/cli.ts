#!/usr/bin/env node
import 'dotenv/config'
import fs from 'node:fs/promises'
import path from 'node:path'
import { recordWebsite } from './pipeline/recordWebsite.js'
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
  const result = await recordWebsite(request, outputRoot)

  console.log('Recording complete')
  console.log('jobId: ' + result.jobId)
  console.log('mp4: ' + result.mp4Path)
  console.log('durationMs: ' + result.durationMs)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
