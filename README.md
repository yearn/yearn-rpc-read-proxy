# readRPC

A minimal, edge-cached, read-only proxy for Ethereum JSON-RPC requests, optimized for frontend.

## Packages

| Package | Platform | Endpoint |
| --- | --- | --- |
| [packages/cloudflare](./packages/cloudflare) | Cloudflare Workers | `POST /chain/[chainId]` |
| [packages/vercel](./packages/vercel) | Vercel (Next.js) | `POST /chain/[chainId]` |

## Quick Start

```bash
bun i
```

### Cloudflare Workers

```bash
cp packages/cloudflare/.dev.vars.example packages/cloudflare/.dev.vars
bun run dev:cloudflare
```

### Vercel

```bash
cp packages/vercel/.env.example packages/vercel/.env.local
bun run dev:vercel
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

## Example

```bash
curl -X POST https://your-endpoint/chain/1 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "eth_blockNumber", "params": [], "id": 1}'
```

## Usage with Libraries

```typescript
// viem
const client = createPublicClient({
  transport: http('https://your-endpoint/chain/1')
})

// ethers
const provider = new JsonRpcProvider('https://your-endpoint/chain/1')
```
