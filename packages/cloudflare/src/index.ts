import {
  Env,
  JsonRpcRequest,
  CORS_HEADERS,
  jsonRpcError,
  getUpstreamRpc,
  validateChainId,
  validateJsonRpcRequest,
} from './config'
import { processRequest, processBatch } from './cache'
import { renderLandingPage } from './lander'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    // Landing page
    if (path === '/' && request.method === 'GET') {
      const baseUrl = url.origin
      const html = renderLandingPage(env, baseUrl)
      return new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    // RPC endpoint
    const rpcMatch = path.match(/^\/chain\/(\d+)$/)
    if (rpcMatch) {
      const chainId = rpcMatch[1]

      // Handle CORS preflight
      if (request.method === 'OPTIONS') {
        return new Response(null, { headers: CORS_HEADERS })
      }

      // Only allow POST
      if (request.method !== 'POST') {
        return new Response('Method not allowed', {
          status: 405,
          headers: CORS_HEADERS,
        })
      }

      return handleRpcRequest(request, chainId, env)
    }

    // 404 for other paths
    return new Response('Not found', { status: 404 })
  },
}

async function handleRpcRequest(request: Request, chainId: string, env: Env): Promise<Response> {
  // Validate chain ID
  if (!validateChainId(chainId)) {
    return Response.json(jsonRpcError(null, -32602, `Invalid chain ID: ${chainId}`), {
      status: 400,
      headers: CORS_HEADERS,
    })
  }

  // Get upstream RPC URL
  const upstreamRpc = getUpstreamRpc(env, chainId)
  if (!upstreamRpc) {
    return Response.json(jsonRpcError(null, -32602, `Unconfigured chain ID: ${chainId}`), {
      status: 400,
      headers: CORS_HEADERS,
    })
  }

  // Parse request body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json(jsonRpcError(null, -32700, 'Parse error: Invalid JSON'), {
      status: 400,
      headers: CORS_HEADERS,
    })
  }

  // Handle batch requests
  if (Array.isArray(body)) {
    if (body.length === 0) {
      return Response.json(jsonRpcError(null, -32600, 'Invalid request: Empty batch'), {
        status: 400,
        headers: CORS_HEADERS,
      })
    }

    // Validate all requests in batch
    for (const req of body) {
      if (!validateJsonRpcRequest(req)) {
        return Response.json(
          jsonRpcError(null, -32600, 'Invalid request: Malformed JSON-RPC request in batch'),
          { status: 400, headers: CORS_HEADERS }
        )
      }
    }

    const { responses, ttl } = await processBatch(body as JsonRpcRequest[], upstreamRpc, chainId, env)
    return Response.json(responses, {
      headers: {
        ...CORS_HEADERS,
        'Cache-Control': `public, max-age=${ttl}`,
      },
    })
  }

  // Handle single request
  if (!validateJsonRpcRequest(body)) {
    return Response.json(jsonRpcError(null, -32600, 'Invalid request: Malformed JSON-RPC request'), {
      status: 400,
      headers: CORS_HEADERS,
    })
  }

  const { response, ttl, cached } = await processRequest(body, upstreamRpc, chainId, env)
  return Response.json(response, {
    headers: {
      ...CORS_HEADERS,
      'Cache-Control': `public, max-age=${ttl}`,
      'X-Cache': cached ? 'HIT' : 'MISS',
    },
  })
}
