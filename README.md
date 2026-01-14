# rpc-read-proxy - Cloudflare Workers

Cloudflare Workers implementation of the read-only Ethereum JSON-RPC proxy.

## Local Development

```bash
bun i
bun dev
```

## Deployment

### Authentication

Create an API token at https://dash.cloudflare.com/profile/api-tokens with the **"Edit Cloudflare Workers"** template.

### Set RPC URLs

```bash
cp .secrets.example .secrets  # Add your RPC URLs
CLOUDFLARE_API_TOKEN=******** bun secrets # Upload to Cloudflare
```

### Deploy

```bash
CLOUDFLARE_API_TOKEN=******** bun deploy
```

### Cleanup

Destroy personal tokens after use.

## Configuration

| Variable | Description | Default |
| --- | --- | --- |
| `RPC_URI_FOR_[chainId]` | Upstream RPC URL for chain (secret) | - |
| `LATEST_TTL` | Cache TTL for `latest` block queries (seconds) | `3` |
| `HISTORICAL_TTL` | Cache TTL for numeric block queries (seconds) | `3600` |

TTLs are configured in `wrangler.toml`. RPC URLs are stored as secrets on Cloudflare.

## Endpoint

```
POST /chain/[chainId]
```

## Caching

Uses Cloudflare's Cache API to cache POST responses at the edge:

- Queries with `latest`, `pending`, or absent block parameters are cached for `LATEST_TTL` seconds (default: 3)
- Queries with numeric block parameters are cached for `HISTORICAL_TTL` seconds (default: 3600)
- Batch requests cache each item individually for maximum cache efficiency

Cache keys are generated from the chain ID, method name, and a SHA-256 hash of canonicalized parameters.

## Rate Limiting

Configure rate limiting via Cloudflare's WAF in the dashboard:

**Setup:** Workers → your-worker → Settings → Security → Rate Limiting
