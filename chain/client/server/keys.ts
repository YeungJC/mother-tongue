// Agent keypairs, stored as standard Solana CLI keypair files (64 bytes: seed + pubkey).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { generateKeyPairSync } from 'node:crypto';
import { type KeyPairSigner, createKeyPairSignerFromBytes } from '@solana/kit';

export const KEY_DIR = new URL('../.keys/', import.meta.url).pathname;

function newKeypairBytes(): Uint8Array {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const seed = privateKey.export({ format: 'der', type: 'pkcs8' }).subarray(-32);
  const pub = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
  return Uint8Array.from([...seed, ...pub]);
}

/** Loads `<key>.json`, creating it on first use. */
export async function agentKey(key: string): Promise<KeyPairSigner> {
  mkdirSync(KEY_DIR, { recursive: true, mode: 0o700 });
  const path = `${KEY_DIR}${key}.json`;
  if (!existsSync(path)) writeFileSync(path, JSON.stringify([...newKeypairBytes()]), { mode: 0o600 });
  return createKeyPairSignerFromBytes(Uint8Array.from(JSON.parse(readFileSync(path, 'utf8'))));
}
