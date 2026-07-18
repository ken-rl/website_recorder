import type { Page, Response } from 'playwright'
import { assertAddressAllowed, assertSafeTargetUrl, installNetworkGuard, targetNetworkPolicyFromEnv } from './networkPolicy.js'
import { waitForScrollReady } from './scrollReadiness.js'

export interface PageAccessSnapshot {
  status?: number
  title: string
  bodyText: string
}

const SITE_PROTECTION_MESSAGE =
  'Automation blocked by site protection. This website does not allow automated browser capture.'

export async function gotoReachablePage(page: Page, url: string) {
  const policy = targetNetworkPolicyFromEnv()
  await assertSafeTargetUrl(url, policy)
  await installNetworkGuard(page, policy)
  let response: Response | null
  try {
    response = await page.goto(url, { waitUntil: 'load', timeout: 30000 })
  } catch (loadError) {
    try {
      response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })
    } catch {
      throw loadError
    }
  }
  await assertSafeTargetUrl(page.url(), policy)
  const server = await response?.serverAddr().catch(() => null)
  if (server?.ipAddress) {
    assertAddressAllowed(server.ipAddress, new URL(page.url()).hostname, policy)
  }
  await assertPageAllowsAutomation(page, response?.status())
  const readiness = await waitForScrollReady(page)
  // Some challenge pages render a neutral shell first and replace it with the
  // denial after their browser-verification script completes.
  await assertPageAllowsAutomation(page, response?.status())
  if (readiness.waited) {
    console.log(
      readiness.timedOut
        ? 'Scroll readiness remained locked; continuing with virtual-scroll detection.'
        : 'Waited for a temporary scroll intro to release the document.'
    )
  }
}

export function detectSiteProtectionBlock(snapshot: PageAccessSnapshot) {
  if (snapshot.status === 401 || snapshot.status === 403) return true

  const content = `${snapshot.title}\n${snapshot.bodyText}`
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

  return (
    /\baccess denied\b/.test(content) ||
    /\bfailed to verify (?:your )?browser\b/.test(content) ||
    /\b(?:unable|could not) to verify (?:your )?browser\b/.test(content) ||
    /\bbrowser verification (?:failed|required)\b/.test(content) ||
    /\bverify (?:that )?you are human\b/.test(content) ||
    /\bchecking (?:your )?browser\b/.test(content) ||
    /\bsecurity checkpoint\b/.test(content) ||
    /\bcaptcha (?:required|verification|challenge)\b/.test(content) ||
    (/\bcode 21\b/.test(content) && /\b(?:browser|verify|security|challenge)\b/.test(content))
  )
}

async function assertPageAllowsAutomation(page: Page, status?: number) {
  const snapshot = await page.evaluate(() => ({
    title: document.title || '',
    bodyText: (document.body?.innerText || '').slice(0, 8_000),
  })).catch(() => ({ title: '', bodyText: '' }))

  if (detectSiteProtectionBlock({ status, ...snapshot })) {
    throw new Error(SITE_PROTECTION_MESSAGE)
  }
}
