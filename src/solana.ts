// The viewer's own Solana client: Wallet Standard discovery + devnet RPC (Kit plugins).
// Patrons sign with their own wallet; nothing here holds a key.
import { type Address, type Instruction, createClient } from '@solana/kit'
import { solanaRpc } from '@solana/kit-plugin-rpc'
import { walletSigner } from '@solana/kit-plugin-wallet'
import { TOKEN_PROGRAM_ADDRESS, findAssociatedTokenPda } from '@solana-program/token'

const q = new URLSearchParams(location.search)
export const RPC_URL = q.get('rpc') ?? (q.has('local') ? 'http://127.0.0.1:8899' : 'https://api.devnet.solana.com')
/** Circle's devnet USDC. */
export const USDC = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU' as Address

// v0 transactions: every devnet wallet can sign them, and ours fit easily.
export const clientPromise = Promise.resolve(
  createClient()
    .use(walletSigner({ chain: 'solana:devnet' }))
    .use(solanaRpc({ rpcUrl: RPC_URL, transactionConfig: { version: 0 } })),
)
export type AppClient = Awaited<typeof clientPromise>

export const usdcAccount = async (owner: Address) =>
  (await findAssociatedTokenPda({ owner, mint: USDC, tokenProgram: TOKEN_PROGRAM_ADDRESS }))[0]

export async function usdcBalance(client: AppClient, owner: Address): Promise<number> {
  try {
    const { value } = await client.rpc.getTokenAccountBalance(await usdcAccount(owner), { commitment: 'confirmed' }).send()
    return Number(value.amount) / 1e6
  } catch {
    return 0
  }
}

/** Plans, asks the wallet to sign, sends; returns a signature when the plugin reports one. */
export async function sendIxs(client: AppClient, ixs: Instruction[]): Promise<string | null> {
  const r = (await client.sendTransaction(ixs as never)) as unknown as { context?: { signature?: string }; signature?: string }
  return r?.context?.signature ?? r?.signature ?? null
}
