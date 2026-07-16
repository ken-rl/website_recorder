import type { Page } from 'playwright'
import { assertAddressAllowed, assertSafeTargetUrl, installNetworkGuard, targetNetworkPolicyFromEnv } from './networkPolicy.js'

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
}
