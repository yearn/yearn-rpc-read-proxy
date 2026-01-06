import { NextRequest, NextResponse } from 'next/server'
import { cacheGet, cacheSet, createCacheKey, hashParams } from '../../lib/cache'

const LATEST_TTL = parseInt(process.env.LATEST_TTL || '3', 10)
const HISTORICAL_TTL = parseInt(process.env.HISTORICAL_TTL || '30', 10)

// Method allowlist with block parameter position
// Position: null = no block param, number = params index, 'logs' = special eth_getLogs handling
const METHOD_CONFIG: Record<string, { blockParamIndex: number | null | 'logs'; defaultBlock?: string; ttl?: 'latest' | 'historical' }> = {
  eth_blockNumber: { blockParamIndex: null, ttl: 'latest' },
  eth_chainId: { blockParamIndex: null, ttl: 'historical' },
  eth_gasPrice: { blockParamIndex: null, ttl: 'latest' },
  eth_call: { blockParamIndex: 1, defaultBlock: 'latest' },
  eth_getBalance: { blockParamIndex: 1, defaultBlock: 'latest' },
  eth_getCode: { blockParamIndex: 1, defaultBlock: 'latest' },
  eth_getStorageAt: { blockParamIndex: 2, defaultBlock: 'latest' },
  eth_getBlockByNumber: { blockParamIndex: 0 },
  eth_getBlockByHash: { blockParamIndex: null, ttl: 'historical' },
  eth_getTransactionByHash: { blockParamIndex: null, ttl: 'historical' },
  eth_getTransactionReceipt: { blockParamIndex: null, ttl: 'historical' },
  eth_getTransactionCount: { blockParamIndex: 1, defaultBlock: 'latest' },
  eth_getLogs: { blockParamIndex: 'logs' },
  eth_estimateGas: { blockParamIndex: 1, defaultBlock: 'latest' },
}

interface JsonRpcRequest {
  jsonrpc: string
  method: string
  params?: unknown[]
  id: unknown
}

interface JsonRpcResponse {
  jsonrpc: string
  id: unknown
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

function jsonRpcError(id: unknown, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } }
}

function getUpstreamRpc(chainId: string): string | null {
  return process.env[`RPC_URI_FOR_${chainId}`] || null
}

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

function determineTtl(method: string, params: unknown[]): number {
  const config = METHOD_CONFIG[method]
  if (!config) return LATEST_TTL

  // Fixed TTL methods
  if (config.ttl === 'historical') return HISTORICAL_TTL
  if (config.ttl === 'latest') return LATEST_TTL

  // eth_getLogs special handling
  if (config.blockParamIndex === 'logs') {
    const filter = params[0] as { fromBlock?: unknown; toBlock?: unknown } | undefined
    if (!filter) return LATEST_TTL

    const fromBlock = filter.fromBlock
    const toBlock = filter.toBlock

    // If either bound is latest/pending/absent, use LATEST_TTL
    if (isLatestBlock(fromBlock) || isLatestBlock(toBlock)) return LATEST_TTL

    // If both are numeric hex, use HISTORICAL_TTL
    if (isNumericHexBlock(fromBlock) && isNumericHexBlock(toBlock)) return HISTORICAL_TTL

    return LATEST_TTL
  }

  // Standard block parameter handling
  if (config.blockParamIndex === null) return LATEST_TTL

  const blockParam = params[config.blockParamIndex] ?? config.defaultBlock

  if (isLatestBlock(blockParam)) return LATEST_TTL
  if (isNumericHexBlock(blockParam)) return HISTORICAL_TTL

  return LATEST_TTL
}

function normalizeRequest(request: JsonRpcRequest, normalizedId: number): JsonRpcRequest {
  return {
    jsonrpc: '2.0',
    method: request.method,
    params: request.params || [],
    id: normalizedId,
  }
}

function restoreId(response: JsonRpcResponse, originalId: unknown): JsonRpcResponse {
  return { ...response, id: originalId }
}

function validateChainId(chainId: string): boolean {
  return /^\d+$/.test(chainId)
}

function validateJsonRpcRequest(request: unknown): request is JsonRpcRequest {
  if (!request || typeof request !== 'object') return false
  const req = request as Record<string, unknown>
  return (
    req.jsonrpc === '2.0' &&
    typeof req.method === 'string' &&
    (req.params === undefined || Array.isArray(req.params))
  )
}

async function processRequest(
  request: JsonRpcRequest,
  upstreamRpc: string,
  chainId: string
): Promise<{ response: JsonRpcResponse; ttl: number; cached: boolean }> {
  const config = METHOD_CONFIG[request.method]

  // Check if method is supported
  if (!config) {
    return {
      response: jsonRpcError(request.id, -32601, `Method not supported: ${request.method}`),
      ttl: LATEST_TTL,
      cached: false,
    }
  }

  const params = request.params || []
  const ttl = determineTtl(request.method, params)
  const paramsHash = await hashParams(params)
  const cacheKey = createCacheKey(chainId, request.method, paramsHash)

  // Check cache
  const cachedResult = await cacheGet(cacheKey)
  if (cachedResult) {
    const result = JSON.parse(cachedResult) as JsonRpcResponse
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
    await cacheSet(cacheKey, JSON.stringify(result), ttl)

    return { response: restoreId(result, request.id), ttl, cached: false }
  } catch (error) {
    return {
      response: jsonRpcError(request.id, -32603, `Upstream RPC error: ${error instanceof Error ? error.message : 'Unknown error'}`),
      ttl: LATEST_TTL,
      cached: false,
    }
  }
}

async function processBatch(
  requests: JsonRpcRequest[],
  upstreamRpc: string,
  chainId: string
): Promise<{ responses: JsonRpcResponse[]; ttl: number; cacheHits: number; cacheMisses: number }> {
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

  // Calculate most conservative TTL for response header
  let batchTtl = HISTORICAL_TTL
  for (const request of requests) {
    if (METHOD_CONFIG[request.method]) {
      const ttl = determineTtl(request.method, request.params || [])
      if (ttl === LATEST_TTL) {
        batchTtl = LATEST_TTL
        break
      }
    }
  }

  // If all requests have validation errors, return them
  if (validationErrors.length === requests.length) {
    return { responses: validationErrors.map(e => e.error), ttl: batchTtl, cacheHits: 0, cacheMisses: 0 }
  }

  // Process each request individually to leverage per-item caching
  const results: { index: number; response: JsonRpcResponse; cached: boolean }[] = []

  // Process valid requests individually (each gets its own TTL/cache)
  const processingPromises = requests.map(async (request, i) => {
    if (validationErrors.find(e => e.index === i)) return

    const { response, cached } = await processRequest(request, upstreamRpc, chainId)
    results.push({ index: i, response, cached })
  })

  await Promise.all(processingPromises)

  // Merge validation errors and results in correct order
  const finalResponses: JsonRpcResponse[] = []
  let cacheHits = 0
  let cacheMisses = 0

  for (let i = 0; i < requests.length; i++) {
    const validationError = validationErrors.find(e => e.index === i)
    if (validationError) {
      finalResponses.push(validationError.error)
    } else {
      const result = results.find(r => r.index === i)
      if (result) {
        finalResponses.push(result.response)
        if (result.cached) {
          cacheHits++
        } else {
          cacheMisses++
        }
      }
    }
  }

  return { responses: finalResponses, ttl: batchTtl, cacheHits, cacheMisses }
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new Response(null, { headers: CORS_HEADERS })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ chainId: string }> }
) {
  const { chainId } = await params

  // Validate chain ID
  if (!validateChainId(chainId)) {
    return NextResponse.json(
      jsonRpcError(null, -32602, `Invalid chain ID: ${chainId}`),
      { status: 400, headers: CORS_HEADERS }
    )
  }

  // Get upstream RPC URL
  const upstreamRpc = getUpstreamRpc(chainId)
  if (!upstreamRpc) {
    return NextResponse.json(
      jsonRpcError(null, -32602, `Unconfigured chain ID: ${chainId}`),
      { status: 400, headers: CORS_HEADERS }
    )
  }

  // Parse request body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      jsonRpcError(null, -32700, 'Parse error: Invalid JSON'),
      { status: 400, headers: CORS_HEADERS }
    )
  }

  // Handle batch requests
  if (Array.isArray(body)) {
    if (body.length === 0) {
      return NextResponse.json(
        jsonRpcError(null, -32600, 'Invalid request: Empty batch'),
        { status: 400, headers: CORS_HEADERS }
      )
    }

    // Validate all requests in batch
    for (const req of body) {
      if (!validateJsonRpcRequest(req)) {
        return NextResponse.json(
          jsonRpcError(null, -32600, 'Invalid request: Malformed JSON-RPC request in batch'),
          { status: 400, headers: CORS_HEADERS }
        )
      }
    }

    const { responses, ttl, cacheHits, cacheMisses } = await processBatch(body as JsonRpcRequest[], upstreamRpc, chainId)
    return NextResponse.json(responses, {
      headers: {
        ...CORS_HEADERS,
        'Cache-Control': `public, s-maxage=${ttl}, stale-while-revalidate`,
        'X-Cache': `HIT:${cacheHits} MISS:${cacheMisses}`,
      },
    })
  }

  // Handle single request
  if (!validateJsonRpcRequest(body)) {
    return NextResponse.json(
      jsonRpcError(null, -32600, 'Invalid request: Malformed JSON-RPC request'),
      { status: 400, headers: CORS_HEADERS }
    )
  }

  const { response, ttl, cached } = await processRequest(body, upstreamRpc, chainId)
  return NextResponse.json(response, {
    headers: {
      ...CORS_HEADERS,
      'Cache-Control': `public, s-maxage=${ttl}, stale-while-revalidate`,
      'X-Cache': cached ? 'HIT' : 'MISS',
    },
  })
}
