export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>
}

export interface Env {
  LATEST_TTL: string
  HISTORICAL_TTL: string
  RATE_LIMITER: RateLimiter
  [key: string]: string | RateLimiter | undefined
}

export interface JsonRpcRequest {
  jsonrpc: string
  method: string
  params?: unknown[]
  id: unknown
}

export interface JsonRpcResponse {
  jsonrpc: string
  id: unknown
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

export interface MethodConfig {
  blockParamIndex: number | null | 'logs'
  defaultBlock?: string
  ttl?: 'latest' | 'historical'
}

// Method allowlist with block parameter position
// Position: null = no block param, number = params index, 'logs' = special eth_getLogs handling
export const METHOD_CONFIG: Record<string, MethodConfig> = {
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

export const CHAIN_NAMES: Record<string, string> = {
  '1': 'Ethereum Mainnet',
  '10': 'Optimism',
  '137': 'Polygon',
  '250': 'Fantom',
  '42161': 'Arbitrum One',
  '43114': 'Avalanche C-Chain',
  '8453': 'Base',
  '100': 'Gnosis',
  '324': 'zkSync Era',
  '59144': 'Linea',
  '534352': 'Scroll',
  '5000': 'Mantle',
  '81457': 'Blast',
}

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export function jsonRpcError(id: unknown, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } }
}

export function getUpstreamRpc(env: Env, chainId: string): string | null {
  const rpc = env[`RPC_URI_FOR_${chainId}`]
  return typeof rpc === 'string' ? rpc : null
}

export function getLatestTtl(env: Env): number {
  return parseInt(env.LATEST_TTL || '3', 10)
}

export function getHistoricalTtl(env: Env): number {
  return parseInt(env.HISTORICAL_TTL || '30', 10)
}

export function validateChainId(chainId: string): boolean {
  return /^\d+$/.test(chainId)
}

export function validateJsonRpcRequest(request: unknown): request is JsonRpcRequest {
  if (!request || typeof request !== 'object') return false
  const req = request as Record<string, unknown>
  return (
    req.jsonrpc === '2.0' &&
    typeof req.method === 'string' &&
    (req.params === undefined || Array.isArray(req.params))
  )
}
