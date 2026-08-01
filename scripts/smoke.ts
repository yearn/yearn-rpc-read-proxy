/**
 * Post-deploy smoke test: every chain the worker claims to support must answer
 * eth_chainId with its own id. Exits non-zero so a broken deploy fails CI.
 */
const BASE = process.env.SMOKE_BASE_URL || 'https://rpc.yearn.fi'
const CHAINS = [1, 10, 100, 137, 146, 250, 8453, 42161, 747474]
const ATTEMPTS = 3

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function checkOnce(chainId: number): Promise<string | undefined> {
  const response = await fetch(`${BASE}/chain/${chainId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] })
  }).catch((error) => {
    throw new Error(`request failed: ${error}`)
  })

  if (!response.ok) {
    return `HTTP ${response.status}: ${(await response.text()).slice(0, 120)}`
  }

  const body = (await response.json()) as { result?: string; error?: { message?: string } }
  if (body.error) {
    return `rpc error: ${body.error.message}`
  }
  if (Number(body.result) !== chainId) {
    return `expected chain ${chainId}, got ${body.result}`
  }
  return undefined
}

// Retry briefly: a fresh deploy can take a moment to propagate to every colo.
async function check(chainId: number): Promise<string | undefined> {
  return Array.from({ length: ATTEMPTS }).reduce<Promise<string | undefined>>(async (previous, _value, attempt) => {
    const failure = await previous
    if (attempt === 0) {
      return checkOnce(chainId).catch((error: Error) => error.message)
    }
    if (!failure) {
      return undefined
    }
    await wait(2000)
    return checkOnce(chainId).catch((error: Error) => error.message)
  }, Promise.resolve('not run'))
}

const results = await Promise.all(CHAINS.map(async (chainId) => ({ chainId, failure: await check(chainId) })))

for (const { chainId, failure } of results) {
  console.log(`chain ${String(chainId).padEnd(7)} ${failure ? `FAIL — ${failure}` : 'ok'}`)
}

const failed = results.filter((result) => result.failure)
if (failed.length > 0) {
  console.error(`\n${failed.length}/${CHAINS.length} chains unhealthy — check that RPC_URI_FOR_<chainId> secrets are set.`)
  process.exit(1)
}
console.log(`\nall ${CHAINS.length} chains healthy`)
