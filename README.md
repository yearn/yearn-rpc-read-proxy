# rpc-read-proxy

A minimum, cached, read-only proxy for Ethereum JSON-RPC requests, optimized for frontend.

## Local Development

```bash
bun i
bun dev
```

## Deployment

A push to `main` deploys the worker through the shared
`yearn/yearn-gha` Cloudflare workflow, which authenticates to Doppler with
OIDC. There is no manual deploy path and no Cloudflare token in GitHub.

### Secrets

The RPC URLs live in Doppler project `rpc-read-proxy`, config `prd`. Every
deploy pushes every value in that config to the worker with
`wrangler secret bulk` before `wrangler deploy`, so Doppler is the single
source of truth — add or rotate an RPC URL there, then let a deploy carry it.

Two caveats from the shared workflow:

- The sync is additive. A key removed from Doppler stays on the worker until
  someone runs `wrangler secret delete`.
- A `wrangler secret put` made by hand is reverted on the next deploy.

The shared `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` come from
Doppler `webops-shared-prod` / `cloudflare-deploy-configs`; this repository
stores neither.

### Setup

Repository variable `DOPPLER_PRODUCTION_IDENTITY_ID` holds the production
Doppler identity. Identity IDs are not secrets. See
`yearn-gha/specs/doppler-cloudflare.md` for the identity's required claims.

### CI/CD

`push` to `main` is the only supported trigger — the shared workflow rejects
every other event before it reaches Doppler. After the deploy, a `needs: deploy`
smoke job runs `bun run smoke` against the live worker.

## Configuration

| Variable | Description | Default |
| --- | --- | --- |
| `RPC_URI_FOR_[chainId]` | Upstream RPC URL for chain (secret) | - |
| `LATEST_TTL` | Cache TTL for `latest` block queries (seconds) | `3` |
| `HISTORICAL_TTL` | Cache TTL for numeric block queries (seconds) | `3600` |

TTLs and RPC URLs are worker secrets, managed in Doppler `rpc-read-proxy` / `prd`.

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

Configure rate limiting via Cloudflare's WAF in the dashboard at the domain level:

**Setup:** Domains → the proxy's public domain → Security → Security rules
