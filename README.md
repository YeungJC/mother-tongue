# Mother Tongue

**AI agents invent a language from nothing, on Solana.**

Twelve agents are born on an island with no shared words. To eat they must trade, and to trade
they must say what they want, in words nobody taught them. They learn only from what they see
change hands. What each speaker *meant* is hashed into its on-chain offer before anyone answers,
and revealed after its life, so anyone can check, word by word, whether they understood each
other. The best-placed agents have children, who learn from a sample of what their parent
overheard: the language drifts, splits into dialects, and keeps its mistakes.

The language rules are deterministic (`chain/client/lang/`); some agents are LLM "thinkers" that
plan their days and reason about what words mean, but no LLM ever decides what a word means for
another agent.

## Run it

```bash
./start.sh              # a fast live island: the Solana program run in-process (LiteSVM),
                        # paced for watching; a fresh island every start
./start.sh --recorded   # no chain, no keys: replay the recorded 12-generation island (data/demo)
./start.sh --devnet     # the real cluster: the director plays lifetimes on devnet
./start.sh --watch      # devnet, watch only
```

Then open the one URL it prints (`http://localhost:5173/?indexer=http://localhost:8412`).
`FLEX=0.5 ./start.sh` runs the live island under the lenient market instead of the strict one.
The director plays one bid round per table by default (`--rounds 3` for the older world).
Logs: `chain/client/data/live/*.log`. Needs Node 24; `npm install` at the root and in `chain/client`.
LLM thinkers use free Groq/Gemini keys (`~/.groq_key`, `~/.gemini_key`) if present; without
them the island runs at the same pace with no thoughts.

## Three screens

| Screen | The question it answers |
|---|---|
| **Watch** | *Is the language getting better?* Every exchange, in order: what's on the table, the words (with what the island takes them to mean underneath), what was really meant, each listener's guess, the result. Left: each town's word for each meaning, as of last night, and how often listeners understand. Right: who is winning and why. Below: a log of how the language changed. Speed 1× / 4× / 16×, pause, jump to live, click a generation to replay it. |
| **Agents** | *What makes an agent succeed?* What predicts children on this island (and on how many replicated islands it holds), whether being understood pays in each world, and every life, sortable. Click anyone for their private dictionary, thoughts, an interview (ElevenLabs Conversational AI) and their voice. |
| **Findings** | *What replicates?* At most five results, each with how many independent islands it holds on, why it matters, and the method; what didn't hold up; and the dataset as CSV. |

## On Solana

The program (`chain/programs/village`, Anchor; devnet `GzNn1p3Vc5wg1KVY4aEWWnxXBj6qKD823sr5nNhmmB9a`)
holds each lifetime as one `Match` account: agents, their goods and hunger, the tables, the bids.
Every step of a trade is a transaction carrying the words: `show` (goods escrowed, words, and
`intent = SHA-256(want : quantity : salt)`), `bid` (goods escrowed, words), `accept` / `reject`
(a word for yes or no). After the last day the program ranks agents by **standing** (wealth ÷
the mean wealth of the living in the same trade) and allows children by place; children are
registered by their parent's signature. The director publishes the reveals after each lifetime;
the research recomputes every hash before using a meaning (0 failures in over 100,000).

The live island runs the same program in-process with LiteSVM so a generation takes minutes, not
hours (a devnet day is 120 s). Accepting a bid is the maker's choice, so the market rule
(lenient or strict) is off-chain policy: the same program serves both.

## Findings

Full write-up, every declared test and every world we tried: [RESEARCH.md](RESEARCH.md).

**How we tested.** Habit minds, 12 agents, 25 generations per island, on the real program
(LiteSVM). We first **explored** different worlds on practice islands (seeds 101–808) and logged
every one, including the ones where nothing happened (RESEARCH.md §10.1). Then we **locked** one
world and wrote down the claims and their tests (§10.2), and **confirmed** them once on islands
never run before (seeds 909–1616), then again on a second fresh set (seeds 1717–2424, §10.4).

**The locked world:** crafts need inputs (a smith's work uses ore, a carpenter's uses wood), one
bid round per table (a misunderstanding costs the deal), strict market.

- **Being understood earns more children, when agents depend on each other and a misunderstanding
  costs the deal.** Positive on **16 of 16** unseen islands, significant on 9 (mean ρ +0.14,
  pooled sign-flip p 0.0039 on each set of 8). Either condition alone is not enough: crafts with
  three bid rounds, or one round without crafts, did not reach the declared bar. Under the earlier
  worlds (free retries, crafts from nothing) the clearest speakers had no more children on 0 of 24
  islands (§6, §9); that null is what led to this study.
- **Like human languages, the most used words change least** (Pagel et al. 2007). Negative on 8 of
  8 islands in both confirmation sets; supported by the pooled test declared in §10.4 (p 0.0039).
  Each island has only ~12 meanings, too few to test alone; our first rule (≥ 4 islands
  significant on their own) couldn't pass with that, and we say so.
- **A shared code without a teacher.** Generation 1 already beats guessing from context on 8 of 8
  islands; later, listeners' first guesses are right about 68–77% of the time, against ~27–31%
  from context alone.
- **The language drifts.** A child keeps about 75% of its parent's words: at that rate ~9
  generations until 90% of today's words are gone.
- **Dialects follow contact, not distance.** Towns that meet at the same tables share more words
  on 7–8 of 8 islands; travel distance predicts it on 0–1 of 8.
- **Words for visible actions come first:** yes/no (around day 3), then goods (5), then numbers (6).
- **Every meaning is provable.** Every reveal on every island matched its on-chain hash (0
  failures in over 100,000).

**Didn't hold up:** "the language gets easier to learn" (Kirby et al. 2008): not supported in any
world. Our language is one word per meaning with no grammar, so there is nothing to get easier;
agents that build words from parts would be the next step. LLM thinkers vs habit minds: one
island, not replicated.

## Data

```bash
cd chain/client
npx tsx lab/research.ts demo              # the findings for one island
npx tsx lab/dataset.ts demo               # CSVs: messages, guesses, lives, births, words, lexicon
npx tsx lab/replicate.ts 8 25 --flex 0    # 8 new islands under the strict market
npx tsx lab/explore.ts --table             # every world explored (RESEARCH.md §10.1)
npx tsx lab/confirm.ts                     # the confirmation run on unseen islands (§10.3; --second for §10.4)
```

The viewer's Findings screen links the same CSVs (`/dataset/<table>.csv` on the indexer). Every
row is joined to the verified meaning; `lives.csv` carries each agent's standing, children,
clarity, comprehension, words inherited, trades, trips and hungry days.

## Layout

- `src/` viewer (Vite, React, react-three-fiber): `tongue.ts` (the player), `derive.ts`,
  `ui/Watch.tsx`, `ui/Agents.tsx`, `ui/Findings.tsx`, `scene/` (the island)
- `chain/programs/village` the Solana program; `chain/client/src/village.ts` its client
- `chain/client/server/tongue.ts` the director; `indexer.ts` (HTTP + SSE for the viewer);
  `mind.ts` thinkers; `voices.ts`, `gateway.ts` ElevenLabs voices and interviews
- `chain/client/lang/` the language rules; `chain/client/lab/` research, replication, dataset
- `LANGUAGE.md` how the world and the language work; `RESEARCH.md` the research; `DEMO.md` the demo script

## Tracks

- **Solana**: every message, bid, trade and birth is a transaction; meanings are committed
  on-chain and revealed later (commit-reveal), so intent is auditable.
- **ElevenLabs**: each founding family has its own voice, inherited by its descendants; offers are
  spoken with tone tags; a historian narrates each generation; "hear the drift" plays one word
  generation by generation; any agent can be interviewed live.
- **Marshall Wace (new data)**: an open dataset of machine language formation with ground truth:
  every message, every listener's guess, every private dictionary every evening, and the sealed
  meaning, across the exploration islands and 16 pre-registered confirmation islands.
