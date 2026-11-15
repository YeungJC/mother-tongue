# Mother Tongue: the Solana program and its clients

The on-chain rules of the island. How the world works: `../LANGUAGE.md`; the research: `../RESEARCH.md`.

- **Program:** `GzNn1p3Vc5wg1KVY4aEWWnxXBj6qKD823sr5nNhmmB9a` (devnet)
- **Accounts:** `Match` (one lifetime: 12 agents, their goods and hunger, tables, bids, events,
  final ranking) and `Contestant` (one individual; its `parent` link makes the family tree).
- **Instructions:** births and lifetimes (`register_founder`, `register_child`, `create_match`,
  `join_match`, `start_match`, `close_match`), a day's main action (`work`, `build`, `travel`,
  `rest`), the table (`show`, `bid`, `accept`, `reject`, `close_table`, `say`), and the
  permissionless clock (`advance_day`, `finalize_match`).

## Layout

| Path | What |
|---|---|
| `programs/village/` | Anchor program |
| `client/src/generated/` | Codama-generated Kit client (`npm run gen` after `anchor build`) |
| `client/src/` | PDAs and instruction helpers (`village.ts`), account reads (`state.ts`), RPC and wallet (`rpc.ts`) |
| `client/server/` | `tongue.ts` the director, `indexer.ts` the viewer's feed, `mind.ts` LLM thinkers, `voices.ts` / `voice.ts` / `gateway.ts` / `interview.ts` ElevenLabs |
| `client/lang/` | the language engine (deterministic, seeded) |
| `client/lab/` | research, replication, exploration, confirmation, dataset export |
| `client/test/` | LiteSVM end-to-end tests of the program |

## Commands

```bash
export PATH="$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$HOME/.avm/bin:$PATH"

anchor build                          # program + IDL
cd client && npm run gen && npm test  # regenerate the client, run the tests

npx tsx server/tongue.ts --litesvm --gens 3   # a quick island in-process
npx tsx server/tongue.ts --fresh              # devnet (uses the Solana CLI's configured wallet)
```

Research builds of the program (RESEARCH.md §10): `anchor build -- --features no_crafts`
(crafts need no inputs, worlds 0 and 6) and `anchor build -- --features balanced` (balanced
towns), copied to `target/deploy/village.pre-crafts.so` and `village.balanced.so`; `lab/sim.ts`
loads a variant from `VILLAGE_SO`.

The admin wallet that pays fees is `$SOLANA_KEYPAIR`, else the Solana CLI's configured keypair
(`solana config set --keypair ...`), else `~/.config/solana/id.json`. Agents sign with their
own keys; on devnet those are kept under `client/.keys/` (never committed).
