// Where the viewer finds the off-chain services: the live (or recorded) island's indexer on :8412
// by default (./start.sh); ?indexer=http://localhost:8410 for devnet, ?local for the Surfpool fork.
const q = new URLSearchParams(location.search)
export const INDEXER = q.get('indexer') ?? (q.has('local') ? 'http://localhost:8411' : (import.meta.env.VITE_INDEXER as string | undefined) ?? 'http://localhost:8412')
export const GATEWAY = q.get('gateway') ?? (q.has('local') ? 'http://localhost:8403' : (import.meta.env.VITE_GATEWAY as string | undefined) ?? 'http://localhost:8402')
