import Redis from 'ioredis'

// In-memory cache fallback
const memoryCache = new Map<string, { value: string; expiresAt: number }>()

// Redis client singleton (reused across invocations in same container)
let redisClient: Redis | null = null

function getRedisClient(): Redis | null {
  if (redisClient) return redisClient

  const redisUrl = process.env.REDIS_URL
  if (!redisUrl) return null

  // Cloud Redis providers (Upstash, Quickstash, etc.) require TLS
  const isTls = redisUrl.startsWith('rediss://')

  redisClient = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    tls: isTls ? { rejectUnauthorized: false } : undefined,
  })

  redisClient.on('error', (err) => {
    console.error('Redis error:', err)
  })

  return redisClient
}

export async function cacheGet(key: string): Promise<string | null> {
  const redis = getRedisClient()

  if (redis) {
    try {
      return await redis.get(key)
    } catch (err) {
      console.error('Redis get error:', err)
      // Fall through to memory cache
    }
  }

  // Memory cache fallback
  const entry = memoryCache.get(key)
  if (entry && entry.expiresAt > Date.now()) {
    return entry.value
  }

  // Clean up expired entry
  if (entry) {
    memoryCache.delete(key)
  }

  return null
}

export async function cacheSet(key: string, value: string, ttlSeconds: number): Promise<void> {
  const redis = getRedisClient()

  if (redis) {
    try {
      await redis.setex(key, ttlSeconds, value)
      return
    } catch (err) {
      console.error('Redis set error:', err)
      // Fall through to memory cache
    }
  }

  // Memory cache fallback
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  })
}

export function createCacheKey(chainId: string, method: string, paramsHash: string): string {
  return `rpc:${chainId}:${method}:${paramsHash}`
}

export async function hashParams(params: unknown[]): Promise<string> {
  const canonical = JSON.stringify(canonicalizeParams(params))
  const encoder = new TextEncoder()
  const data = encoder.encode(canonical)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
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
