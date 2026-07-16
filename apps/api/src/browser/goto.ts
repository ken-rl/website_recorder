import type { Page } from 'playwright'
import { assertAddressAllowed, assertSafeTargetUrl, installNetworkGuard, targetNetworkPolicyFromEnv } from './networkPolicy.js'
import { waitForScrollReady } from './scrollReadiness.js'

export async function gotoReachablePage(page: Page, url: string) {
  const policy = targetNetworkPolicyFromEnv()
  await assertSafeTargetUrl(url, policy)
  await installNetworkGuard(page, policy)
  let response
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
  const readiness = await waitForScrollReady(page)
  if (readiness.waited) {
    console.log(
      readiness.timedOut
        ? 'Scroll readiness remained locked; continuing with virtual-scroll detection.'
        : 'Waited for a temporary scroll intro to release the document.'
    )
  }
}
