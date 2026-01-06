# readRPC - Vercel

Next.js/Vercel implementation of the read-only Ethereum JSON-RPC proxy.

## Local Development

```bash
bun i
cp .env.example .env.local  # Add your RPC URLs
bun dev
```

## Deployment

Deploy to Vercel via the dashboard or CLI:

```bash
bunx vercel
```

### Environment Variables

Set in Vercel dashboard: **Project → Settings → Environment Variables**

| Variable | Description | Default |
| --- | --- | --- |
| `RPC_URI_FOR_[chainId]` | Upstream RPC URL for chain | - |
| `LATEST_TTL` | Cache TTL for `latest` block queries (seconds) | `3` |
| `HISTORICAL_TTL` | Cache TTL for numeric block queries (seconds) | `30` |
| `REDIS_URL` | Redis connection URL for caching | in-memory |

## Endpoint

```
POST /chain/[chainId]
```

## Caching

Uses Redis (or in-memory fallback) for caching RPC responses:

- Queries with `latest`, `pending`, or absent block parameters are cached for `LATEST_TTL` seconds (default: 3)
- Queries with numeric block parameters are cached for `HISTORICAL_TTL` seconds (default: 30)
- Batch requests cache each item individually for maximum cache efficiency
- Returns `X-Cache: HIT` or `X-Cache: MISS` header (batch: `X-Cache: HIT:n MISS:m`)

If `REDIS_URL` is not set, falls back to in-memory cache (not shared across function instances).

## Rate Limiting

Configure rate limiting via Vercel's WAF in the dashboard:

**Setup:** Project → Firewall → Configure → New Rule → Rate Limit

**Docs:** https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting
