# Yearn RPC Read Proxy

A minimal, edge-cached read-only proxy for Ethereum JSON-RPC requests.

## Running

```bash
bun dev
```

## Configuration

| Variable | Description | Default |
| --- | --- | --- |
| `RPC_URI_FOR_[chainId]` | Upstream RPC URL for chain | - |
| `LATEST_TTL` | Cache TTL for `latest` block queries (seconds) | `3` |
| `HISTORICAL_TTL` | Cache TTL for numeric block queries (seconds) | `30` |

Example:
```bash
RPC_URI_FOR_1=https://eth.llamarpc.com bun dev
```

## Endpoint

```
POST /rpc/[chainId]
```

## Supported Methods

| Method | Description |
| --- | --- |
| `eth_blockNumber` | Returns the current block number |
| `eth_chainId` | Returns the chain ID |
| `eth_gasPrice` | Returns the current gas price |
| `eth_call` | Executes a call without creating a transaction |
| `eth_getBalance` | Returns the balance of an address |
| `eth_getCode` | Returns the code at an address |
| `eth_getStorageAt` | Returns storage at a position |
| `eth_getBlockByNumber` | Returns block by number |
| `eth_getBlockByHash` | Returns block by hash |
| `eth_getTransactionByHash` | Returns transaction by hash |
| `eth_getTransactionReceipt` | Returns transaction receipt |
| `eth_getTransactionCount` | Returns transaction count (nonce) |
| `eth_getLogs` | Returns logs matching filter |
| `eth_estimateGas` | Estimates gas for a transaction |

## Example Request

```bash
curl -X POST http://localhost:3000/rpc/1 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "eth_blockNumber",
    "params": [],
    "id": 1
  }'
```

## Example Response

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": "0x134a5b2"
}
```

## Caching

- Queries with `latest`, `pending`, or absent block parameters are cached for `LATEST_TTL` seconds (default: 3)
- Queries with numeric block parameters are cached for `HISTORICAL_TTL` seconds (default: 30)
- Batch requests use the most conservative TTL across all items

## Rate Limiting

Rate limiting is configured via the Vercel Dashboard, not in code or `vercel.json`.

Vercel's WAF rate limiting runs at the edge, before the function executes, providing zero-latency protection against abuse.

**Setup:** Project → Firewall → Configure → New Rule → Rate Limit

**Docs:** https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting

## Usage with Libraries

```typescript
// viem
const client = createPublicClient({
  transport: http('http://localhost:3000/rpc/1')
})

// ethers
const provider = new JsonRpcProvider('http://localhost:3000/rpc/1')
```
