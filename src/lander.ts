import { Env, CHAIN_NAMES, METHOD_CONFIG } from './config'

const SUPPORTED_METHODS = [
  { method: 'eth_blockNumber', description: 'Returns the current block number' },
  { method: 'eth_chainId', description: 'Returns the chain ID' },
  { method: 'eth_gasPrice', description: 'Returns the current gas price' },
  { method: 'eth_call', description: 'Executes a call without creating a transaction' },
  { method: 'eth_getBalance', description: 'Returns the balance of an address' },
  { method: 'eth_getCode', description: 'Returns the code at an address' },
  { method: 'eth_getStorageAt', description: 'Returns storage at a position' },
  { method: 'eth_getBlockByNumber', description: 'Returns block by number' },
  { method: 'eth_getBlockByHash', description: 'Returns block by hash' },
  { method: 'eth_getTransactionByHash', description: 'Returns transaction by hash' },
  { method: 'eth_getTransactionReceipt', description: 'Returns transaction receipt' },
  { method: 'eth_getTransactionCount', description: 'Returns transaction count (nonce)' },
  { method: 'eth_getLogs', description: 'Returns logs matching filter' },
  { method: 'eth_estimateGas', description: 'Estimates gas for a transaction' },
]

function getConfiguredChains(env: Env): { chainId: string; name: string }[] {
  const chains: { chainId: string; name: string }[] = []

  for (const key of Object.keys(env)) {
    if (key.startsWith('RPC_URI_FOR_')) {
      const chainId = key.replace('RPC_URI_FOR_', '')
      chains.push({
        chainId,
        name: CHAIN_NAMES[chainId] || `Chain ${chainId}`,
      })
    }
  }

  return chains.sort((a, b) => parseInt(a.chainId) - parseInt(b.chainId))
}

export function renderLandingPage(env: Env, baseUrl: string): string {
  const chains = getConfiguredChains(env)
  const latestTtl = env.LATEST_TTL || '3'
  const historicalTtl = env.HISTORICAL_TTL || '30'

  const chainsHtml = chains.length > 0
    ? chains.map(({ chainId, name }) => `
        <li class="flex items-center gap-3">
          <code class="bg-zinc-900 rounded px-2 py-1 font-mono text-sm text-zinc-300">${chainId}</code>
          <span class="text-zinc-400">${name}</span>
        </li>
      `).join('')
    : '<p class="text-zinc-500">No chains configured. Set RPC_URI_FOR_[chainId] environment variables.</p>'

  const methodsHtml = SUPPORTED_METHODS.map(({ method, description }) => `
    <li class="flex items-start gap-3">
      <code class="bg-zinc-900 rounded px-2 py-1 font-mono text-sm text-zinc-300 shrink-0">${method}</code>
      <span class="text-zinc-500 text-sm">${description}</span>
    </li>
  `).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Yearn RPC Read Proxy</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono&display=swap');
    body { font-family: 'Inter', sans-serif; }
    code, pre { font-family: 'JetBrains Mono', monospace; }
  </style>
</head>
<body class="min-h-screen bg-zinc-950 text-zinc-100">
  <main class="max-w-3xl mx-auto px-6 py-16">
    <header class="mb-12">
      <h1 class="text-3xl font-semibold mb-2">Yearn RPC Read Proxy</h1>
      <p class="text-zinc-400">
        A minimum, cached, read-only proxy for Ethereum JSON-RPC requests, optimized for frontend.
      </p>
    </header>

    <section class="mb-10">
      <h2 class="text-xl font-semibold mb-4">Endpoint</h2>
      <code class="block bg-zinc-900 rounded-lg px-4 py-3 font-mono text-sm">
        POST /chain/[chainId]
      </code>
    </section>

    <section class="mb-10">
      <h2 class="text-xl font-semibold mb-4">Supported Chains</h2>
      <ul class="space-y-2">
        ${chainsHtml}
      </ul>
    </section>

    <section class="mb-10">
      <h2 class="text-xl font-semibold mb-4">Supported Methods</h2>
      <ul class="space-y-2">
        ${methodsHtml}
      </ul>
    </section>

    <section class="mb-10">
      <h2 class="text-xl font-semibold mb-4">Example Request</h2>
      <pre class="bg-zinc-900 rounded-lg px-4 py-3 font-mono text-sm overflow-x-auto">curl -v -X POST ${baseUrl}/chain/1 \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0",
    "method": "eth_blockNumber",
    "params": [],
    "id": 1
  }'</pre>
    </section>

    <section class="mb-10">
      <h2 class="text-xl font-semibold mb-4">Example Response</h2>
      <pre class="bg-zinc-900 rounded-lg px-4 py-3 font-mono text-sm overflow-x-auto">{
  "jsonrpc": "2.0",
  "id": 1,
  "result": "0x134a5b2"
}</pre>
    </section>

    <section class="mb-10">
      <h2 class="text-xl font-semibold mb-4">Caching</h2>
      <ul class="space-y-2 text-zinc-400">
        <li class="flex items-start gap-2">
          <span class="text-zinc-500">-</span>
          <span>Queries with <code class="text-zinc-300">latest</code>, <code class="text-zinc-300">pending</code>, or absent block parameters are cached for ${latestTtl} seconds</span>
        </li>
        <li class="flex items-start gap-2">
          <span class="text-zinc-500">-</span>
          <span>Queries with numeric block parameters are cached for ${historicalTtl} seconds</span>
        </li>
        <li class="flex items-start gap-2">
          <span class="text-zinc-500">-</span>
          <span>Batch requests cache each item individually for maximum efficiency</span>
        </li>
      </ul>
    </section>

    <section class="mb-10">
      <h2 class="text-xl font-semibold mb-4">Usage with Libraries</h2>
      <pre class="bg-zinc-900 rounded-lg px-4 py-3 font-mono text-sm overflow-x-auto mb-3">// viem
const client = createPublicClient({
  transport: http('${baseUrl}/chain/1')
})</pre>
      <pre class="bg-zinc-900 rounded-lg px-4 py-3 font-mono text-sm overflow-x-auto">// ethers
const provider = new JsonRpcProvider('${baseUrl}/chain/1')</pre>
    </section>

    <footer class="pt-8 border-t border-zinc-800 text-zinc-500 text-sm">
      <a
        href="${baseUrl}"
        target="_blank"
        rel="noopener noreferrer"
        class="hover:text-zinc-300 transition-colors"
      >${baseUrl.replace('https://', '')}</a>
    </footer>
  </main>
</body>
</html>`
}
