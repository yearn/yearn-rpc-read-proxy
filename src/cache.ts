import {
  Env,
  JsonRpcRequest,
  JsonRpcResponse,
  METHOD_CONFIG,
  getLatestTtl,
  getHistoricalTtl,
  jsonRpcError,
} from './config'

function isLatestBlock(block: unknown): boolean {
  if (block === undefined || block === null) return true
  if (typeof block === 'string') {
    const lower = block.toLowerCase()
    return lower === 'latest' || lower === 'pending'
  }
  return false
}

function isNumericHexBlock(block: unknown): boolean {
  if (typeof block !== 'string') return false
  return /^0x[0-9a-fA-F]+$/.test(block)
}

export function determineTtl(env: Env, method: string, params: unknown[]): number {
  const latestTtl = getLatestTtl(env)
  const historicalTtl = getHistoricalTtl(env)
  const config = METHOD_CONFIG[method]
  if (!config) return latestTtl

  // Fixed TTL methods
  if (config.ttl === 'historical') return historicalTtl
  if (config.ttl === 'latest') return latestTtl

  // eth_getLogs special handling
  if (config.blockParamIndex === 'logs') {
    const filter = params[0] as { fromBlock?: unknown; toBlock?: unknown } | undefined
    if (!filter) return latestTtl

    const fromBlock = filter.fromBlock
    const toBlock = filter.toBlock

    // If either bound is latest/pending/absent, use latestTtl
    if (isLatestBlock(fromBlock) || isLatestBlock(toBlock)) return latestTtl

    // If both are numeric hex, use historicalTtl
    if (isNumericHexBlock(fromBlock) && isNumericHexBlock(toBlock)) return historicalTtl

    return latestTtl
  }

  // Standard block parameter handling
  if (config.blockParamIndex === null) return latestTtl

  const blockParam = params[config.blockParamIndex] ?? config.defaultBlock

  if (isLatestBlock(blockParam)) return latestTtl
  if (isNumericHexBlock(blockParam)) return historicalTtl

  return latestTtl
}

function canonicalizeParams(params: unknown[]): unknown[] {
  return JSON.parse(JSON.stringify(params, (_, value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.keys(value).sort().reduce((sorted: Record<string, unknown>, key) => {
        sorted[key] = value[key]
        return sorted
      }, {})
    }
    return value
  }))
}

function normalizeRequest(request: JsonRpcRequest, normalizedId: number): JsonRpcRequest {
  return {
    jsonrpc: '2.0',
    method: request.method,
    params: canonicalizeParams(request.params || []),
    id: normalizedId,
  }
}

function restoreId(response: JsonRpcResponse, originalId: unknown): JsonRpcResponse {
  return { ...response, id: originalId }
}

async function hashParams(params: unknown[]): Promise<string> {
  const canonical = JSON.stringify(canonicalizeParams(params))
  const encoder = new TextEncoder()
  const data = encoder.encode(canonical)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

function createCacheKey(chainId: string, method: string, paramsHash: string): Request {
  return new Request(`https://rpc-cache/${chainId}/${method}/${paramsHash}`, {
    method: 'GET',
  })
}

export async function processRequest(
  request: JsonRpcRequest,
  upstreamRpc: string,
  chainId: string,
  env: Env
): Promise<{ response: JsonRpcResponse; ttl: number; cached: boolean }> {
  const config = METHOD_CONFIG[request.method]

  if (!config) {
    return {
      response: jsonRpcError(request.id, -32601, `Method not supported: ${request.method}`),
      ttl: getLatestTtl(env),
      cached: false,
    }
  }

  const params = request.params || []
  const ttl = determineTtl(env, request.method, params)
  const paramsHash = await hashParams(params)
  const cacheKey = createCacheKey(chainId, request.method, paramsHash)
  const cache = caches.default

  // Check cache
  const cachedResponse = await cache.match(cacheKey)
  if (cachedResponse) {
    const result = await cachedResponse.json() as JsonRpcResponse
    return { response: restoreId(result, request.id), ttl, cached: true }
  }

  // Fetch from upstream
  const normalizedRequest = normalizeRequest(request, 1)

  try {
    const upstreamResponse = await fetch(upstreamRpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(normalizedRequest),
    })

    const result = await upstreamResponse.json() as JsonRpcResponse

    // Cache the response
    const responseToCache = new Response(JSON.stringify(result), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${ttl}`,
      },
    })
    await cache.put(cacheKey, responseToCache)

    return { response: restoreId(result, request.id), ttl, cached: false }
  } catch (error) {
    return {
      response: jsonRpcError(
        request.id,
        -32603,
        `Upstream RPC error: ${error instanceof Error ? error.message : 'Unknown error'}`
      ),
      ttl: getLatestTtl(env),
      cached: false,
    }
  }
}

export async function processBatch(
  requests: JsonRpcRequest[],
  upstreamRpc: string,
  chainId: string,
  env: Env
): Promise<{ responses: JsonRpcResponse[]; ttl: number }> {
  const latestTtl = getLatestTtl(env)
  const historicalTtl = getHistoricalTtl(env)

  // Validate all requests first
  const validationErrors: { index: number; error: JsonRpcResponse }[] = []

  for (let i = 0; i < requests.length; i++) {
    const config = METHOD_CONFIG[requests[i].method]
    if (!config) {
      validationErrors.push({
        index: i,
        error: jsonRpcError(requests[i].id, -32601, `Method not supported: ${requests[i].method}`),
      })
    }
  }

  // Calculate most conservative TTL
  let batchTtl = historicalTtl
  for (const request of requests) {
    if (METHOD_CONFIG[request.method]) {
      const ttl = determineTtl(env, request.method, request.params || [])
      if (ttl === latestTtl) {
        batchTtl = latestTtl
        break
      }
    }
  }

  // If all requests have validation errors, return them
  if (validationErrors.length === requests.length) {
    return { responses: validationErrors.map(e => e.error), ttl: batchTtl }
  }

  // Process each request individually to leverage caching
  const results: { index: number; response: JsonRpcResponse }[] = []
  const uncachedRequests: { index: number; request: JsonRpcRequest }[] = []

  // Check cache for each valid request
  for (let i = 0; i < requests.length; i++) {
    if (validationErrors.find(e => e.index === i)) continue

    const request = requests[i]
    const params = request.params || []
    const paramsHash = await hashParams(params)
    const cacheKey = createCacheKey(chainId, request.method, paramsHash)
    const cache = caches.default

    const cachedResponse = await cache.match(cacheKey)
    if (cachedResponse) {
      const result = await cachedResponse.json() as JsonRpcResponse
      results.push({ index: i, response: restoreId(result, request.id) })
    } else {
      uncachedRequests.push({ index: i, request })
    }
  }

  // Batch fetch uncached requests
  if (uncachedRequests.length > 0) {
    const normalizedRequests = uncachedRequests.map(({ request }, i) => normalizeRequest(request, i))
    const originalIds = uncachedRequests.map(({ request }) => request.id)

    try {
      const upstreamResponse = await fetch(upstreamRpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(normalizedRequests),
      })

      const upstreamResults = await upstreamResponse.json() as JsonRpcResponse[]
      const cache = caches.default

      // Cache each response and restore IDs
      for (let i = 0; i < upstreamResults.length; i++) {
        const result = upstreamResults[i]
        const { index, request } = uncachedRequests[i]
        const params = request.params || []
        const ttl = determineTtl(env, request.method, params)
        const paramsHash = await hashParams(params)
        const cacheKey = createCacheKey(chainId, request.method, paramsHash)

        const responseToCache = new Response(JSON.stringify(result), {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': `public, max-age=${ttl}`,
          },
        })
        await cache.put(cacheKey, responseToCache)

        results.push({ index, response: restoreId(result, originalIds[i]) })
      }
    } catch (error) {
      for (const { index, request } of uncachedRequests) {
        results.push({
          index,
          response: jsonRpcError(
            request.id,
            -32603,
            `Upstream RPC error: ${error instanceof Error ? error.message : 'Unknown error'}`
          ),
        })
      }
    }
  }

  // Merge validation errors and results in correct order
  const finalResponses: JsonRpcResponse[] = []
  for (let i = 0; i < requests.length; i++) {
    const validationError = validationErrors.find(e => e.index === i)
    if (validationError) {
      finalResponses.push(validationError.error)
    } else {
      const result = results.find(r => r.index === i)
      if (result) {
        finalResponses.push(result.response)
      }
    }
  }

  return { responses: finalResponses, ttl: batchTtl }
}
