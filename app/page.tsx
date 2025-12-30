function getBaseUrl(): string {
  if (process.env.NODE_ENV === 'development') {
    return `http://localhost:${process.env.PORT || 3000}`
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }
  return 'https://example.com'
}

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

function getConfiguredChains(): { chainId: string; name: string }[] {
  const chains: { chainId: string; name: string }[] = []
  const chainNames: Record<string, string> = {
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

  for (const key of Object.keys(process.env)) {
    if (key.startsWith('RPC_URI_FOR_')) {
      const chainId = key.replace('RPC_URI_FOR_', '')
      chains.push({
        chainId,
        name: chainNames[chainId] || `Chain ${chainId}`,
      })
    }
  }

  return chains.sort((a, b) => parseInt(a.chainId) - parseInt(b.chainId))
}

export default function Home() {
  const chains = getConfiguredChains()
  const baseUrl = getBaseUrl()

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-[family-name:var(--font-geist-sans)]">
      <main className="max-w-3xl mx-auto px-6 py-16">
        <header className="mb-12">
          <h1 className="text-3xl font-semibold mb-2">Yearn RPC Read Proxy</h1>
          <p className="text-zinc-400">
            A minimal, edge-cached read-only proxy for Ethereum JSON-RPC requests.
          </p>
        </header>

        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-4">Endpoint</h2>
          <code className="block bg-zinc-900 rounded-lg px-4 py-3 font-[family-name:var(--font-geist-mono)] text-sm">
            POST /rpc/[chainId]
          </code>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-4">Supported Chains</h2>
          {chains.length > 0 ? (
            <ul className="space-y-2">
              {chains.map(({ chainId, name }) => (
                <li key={chainId} className="flex items-center gap-3">
                  <code className="bg-zinc-900 rounded px-2 py-1 font-[family-name:var(--font-geist-mono)] text-sm text-zinc-300">
                    {chainId}
                  </code>
                  <span className="text-zinc-400">{name}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-zinc-500">No chains configured. Set RPC_URI_FOR_[chainId] environment variables.</p>
          )}
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-4">Supported Methods</h2>
          <ul className="space-y-2">
            {SUPPORTED_METHODS.map(({ method, description }) => (
              <li key={method} className="flex items-start gap-3">
                <code className="bg-zinc-900 rounded px-2 py-1 font-[family-name:var(--font-geist-mono)] text-sm text-zinc-300 shrink-0">
                  {method}
                </code>
                <span className="text-zinc-500 text-sm">{description}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-4">Example Request</h2>
          <pre className="bg-zinc-900 rounded-lg px-4 py-3 font-[family-name:var(--font-geist-mono)] text-sm overflow-x-auto">
{`curl -X POST ${baseUrl}/rpc/1 \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0",
    "method": "eth_blockNumber",
    "params": [],
    "id": 1
  }'`}
          </pre>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-4">Example Response</h2>
          <pre className="bg-zinc-900 rounded-lg px-4 py-3 font-[family-name:var(--font-geist-mono)] text-sm overflow-x-auto">
{`{
  "jsonrpc": "2.0",
  "id": 1,
  "result": "0x134a5b2"
}`}
          </pre>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-4">Caching</h2>
          <ul className="space-y-2 text-zinc-400">
            <li className="flex items-start gap-2">
              <span className="text-zinc-500">-</span>
              <span>Queries with <code className="text-zinc-300">latest</code>, <code className="text-zinc-300">pending</code>, or absent block parameters are cached for {process.env.LATEST_TTL || '3'} seconds</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-zinc-500">-</span>
              <span>Queries with numeric block parameters are cached for {process.env.HISTORICAL_TTL || '30'} seconds</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-zinc-500">-</span>
              <span>Batch requests use the most conservative TTL across all items</span>
            </li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-4">Usage with Libraries</h2>
          <pre className="bg-zinc-900 rounded-lg px-4 py-3 font-[family-name:var(--font-geist-mono)] text-sm overflow-x-auto mb-3">
{`// viem
const client = createPublicClient({
  transport: http('${baseUrl}/rpc/1')
})`}
          </pre>
          <pre className="bg-zinc-900 rounded-lg px-4 py-3 font-[family-name:var(--font-geist-mono)] text-sm overflow-x-auto">
{`// ethers
const provider = new JsonRpcProvider('${baseUrl}/rpc/1')`}
          </pre>
        </section>

        <footer className="pt-8 border-t border-zinc-800 text-zinc-500 text-sm">
          <a
            href="https://github.com/yearn/rpc-read-proxy"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-zinc-300 transition-colors"
          >
            github.com/yearn/rpc-read-proxy
          </a>
        </footer>
      </main>
    </div>
  )
}
