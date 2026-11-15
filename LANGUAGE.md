# Mother Tongue: plan

> AI agents are born on an island speaking nothing. To survive they have to trade, and to trade
> they have to make themselves understood, so they invent words. Their children learn those words
> imperfectly, from what they overheard. Over generations the language spreads, drifts, splits
> into dialects and fills up with mistakes that stuck. Every word is spoken aloud (ElevenLabs)
> and every message, trade and birth is on Solana. Humans only watch.

Working name: **Mother Tongue** (open to change).

---

## 1. Rules of thumb

1. **No oracle.** Agents learn only from what they can see and do: goods on the table, bids,
   accept and reject, other people's trades. Nobody is ever told what a word means.
2. **Mistakes are allowed and kept.** Beliefs are guesses with a confidence level. Wrong ones
   last until they cause failures, and wrong ones that never cause failures can last forever.
3. **Talking must be necessary.** If an agent can get what it needs without being understood,
   the language won't grow. So there is no market to fall back on: you only get what you lack
   by trading with another agent.
4. **Viewers see the truth; agents don't.** Every speaker's real intention is logged (and
   hash-committed on-chain) so the viewer can show "meant / heard / understood", but it is never
   fed back to the agents.

---

## 2. What stays, what goes, what's new

| | |
|---|---|
| **Stays** | Island, 4 towns, travel times, work/craft/build, hunger and elimination, events (frost etc.), `Contestant` accounts, director loop, LLM brains (`brain.ts`, `llm.ts`), voice pipeline (`voice.ts`, gateway, cached audio), indexer and SSE viewer, 3D scene, interview, LiteSVM lab (`lab/sim.ts`) |
| **Goes (switched off for v1)** | Town markets (automated pools), contracts, loans. Loans and contracts need words for "later" and "promise", which won't exist early on. They could come back once a language has grown enough to express them (stretch goal). |
| **New** | The trading table (show, bid, accept, reject), speech events, the language engine, lifetimes and children, inherited voices, the language views in the viewer |

---

## 3. The world

- **Needs:** every agent eats 1 food a day; frost needs 1 wood a day; tools boost work. Each town
  produces one thing (Wrenford and Saltmere food, Oakhollow wood, Ironcrag ore), so everyone
  lacks something and has to trade for it.
- **A lifetime = one match** (20 days, same as now).
- **Fitness = children.** At the end of a lifetime, agents are ranked by **standing within their
  trade**: wealth (goods + buildings) ÷ the mean wealth of the living agents with the same job
  (×1000; alone in your trade = 1000), and the dead score 0. (Until 2026-11-14 it was raw wealth,
  which mostly rewarded being a carpenter; see RESEARCH.md §5.) Better-ranked agents have more children in the next generation (e.g.
  1st: 3, 2nd and 3rd: 2, 4th to 6th: 1, the rest: 0, keeping the population at 8).
- **Children start in their parent's home town.** That way towns keep their families, and
  distance between towns produces dialects.

---

## 4. The trading table (how a trade works without a shared language)

One round, in one town:

1. **Show.** The maker puts goods on the table (escrowed, visible to everyone): "3 fish". It
   speaks words that are meant to say what it wants back. It also commits
   `sha256(want_kind, want_qty, salt)` on-chain, for viewers only.
2. **Bid.** Any agent in the same town can put goods down in response (escrowed): "1 wood". It can
   speak too.
3. **React.** The maker **accepts** a bid (the swap settles) or **rejects** it (the bid is returned),
   and can say something while doing so.
4. Repeat up to *K* rounds a day. Unaccepted goods go back at the end of the day.

Everything except the maker's real want is public, so bystanders learn from it too. At the end
of a lifetime the salts are published and anyone can check what each agent really meant.

---

## 5. The language engine (off-chain, deterministic, seeded)

### What can be said
A small, fixed set of meanings: **goods** (food, wood, ore, tools, planks), **numbers** (1 to 6, plus
"many"), and **reactions** (yes/accept, no/reject). Events (frost, drought, storm) are added
later. A message is a short sequence of words, e.g. the maker's want: *[good] [number]*.

### Sounds
Each founding family gets a small set of syllables (e.g. *ta, ko, ve, ri, mes, kel*). A word is 1
to 3 syllables, stored spelled out the way it sounds (`tavo`, `kel`, `rii`) so ElevenLabs
pronounces it the same way every time.

### Each agent's private dictionary
A table of **word → meaning → confidence**. It's never a fact list: a word can have several
candidate meanings at once.

- **Speaking:** use the most confident word for each meaning. If there's no word or confidence
  is too low, either **invent one** (with probability `p_coin`), **repeat** a known word
  (*"tavo tavo tavo"* for 3), or just show and say nothing.
- **Listening:** for each possible meaning, add up evidence from the dictionary and from
  **context** (what does the speaker lack? what do I hold? what did they want last time?), then
  bid on the best guess.
- **Learning, only from outcomes:**
  - A bid gets **accepted** → the words the maker said were probably about what was bid. Raise
    those links, and weaken competing words for the same meaning (this is what makes a
    population settle on one word).
  - A bid gets **rejected** → weak evidence against what was bid.
  - Words spoken while accepting or rejecting become linked to *yes* or *no*.
  - **Bystanders** learn the same way from trades they watch, at a lower rate.
- **Mislearning happens naturally:** a word can get attached to the number instead of the good,
  a meaning can be too broad ("tavo" = all food), or a reaction word can be mistaken for an
  object. Nothing corrects a belief unless it causes failures.

### Inheritance (how children learn)
A child does **not** copy its parent's dictionary. It learns from a **limited sample** of
episodes: the last *N* trades its parent (and its home town) took part in, replayed through the
same learning rules. Rare words get lost, ambiguous ones get reinterpreted, and the child invents
words to fill the gaps. This is where language change between generations comes from.

### Where the language model fits
- **The brain (LLM) decides what to do:** what to want, whom to trade with, whether to accept,
  how it feels. It produces a structured intent plus a tone. The engine turns that into words.
  The model is never asked to invent or keep track of a language.
- **"Linguist moments" (budgeted):** now and then an agent looks through its own notes about a
  word it's unsure of and thinks out loud: *"Every time Bram says 'vek', the deal dies. I think
  it means no."* Its conclusion changes its confidence only as much as the evidence supports.
  These lines are the best material for narration.
- Optional: the model invents new words in the family's sound style, for flavour.

---

## 6. On-chain changes

Small, because the language lives in agents' minds, off-chain.

| Change | Purpose |
|---|---|
| `show(slot, give_kind, give_qty, intent_hash, words)` | Escrow goods on the table and speak |
| `bid(slot, table, kind, qty, words)` | Escrow a counter-offer and speak |
| `accept(slot, table, bid, words)` / `reject(...)` | Settle or return, and speak |
| `say(slot, words, tone)` | Speak without trading (events only, no state) |
| `reveal_intents(slot, salts)` at the end of a lifetime | Anyone can verify what was meant |
| `Contestant` gets `parent`, `generation`, `home_town`, `voice_seed` | Family tree on-chain |
| `Match` config: `markets_enabled = false` | Switch off the pools without deleting code |
| Child creation: `register_contestant` with `parent` set, allowed only for ranked parents of a finalized match | Births are earned on-chain |

**Word births come from the chain, not from an instruction.** The first time a word form appears
in any message is its birth (who, which generation, which day). The indexer builds the
etymology from message events, so no one can backdate a word.

Words are stored as their spelled-out form (≤ 64 bytes per message) inside events. That's cheap,
and every message is a transaction (good for the Solana high-frequency angle).

---

## 7. Voices (ElevenLabs)

- **Speech:** `eleven_v3` speaks the spelled-out words, with a tone tag picked from the agent's
  state ([angry] after a rejection, [pleading] when hungry). Tone gives viewers a clue before they
  know the words.
- **Inherited voices:** founders get voices made with Voice Design from text descriptions; a
  child's voice is designed from a blend of its parents' descriptions plus a small mutation, so
  families sound related and drift apart over generations. **Check first:** how many custom
  voices the account can hold. Fallback: one premade voice per family, with per-child changes to
  speed, stability and style.
- **The historian:** an English narrator (existing voice) explains what's happening: word births,
  mistakes that spread, dialect splits.
- **Interview (existing):** ask any agent, in English, what it thinks a word means. It answers from
  its own beliefs, wrong ones included.
- Island Radio and town ambience stay as they are.

---

## 8. What the viewer shows

1. **Transcript, three layers:** what was said (sound + audio), what the speaker meant, and what
   the listener understood, with misunderstandings highlighted.
2. **Dictionary panel:** the selected agent's words with confidence bars, showing its wrong beliefs too.
3. **Word timeline:** when each word was born, how it spread from agent to agent, and when it died.
4. **Dialect map:** the island coloured by which word each town uses for each meaning.
5. **Hear the drift:** the same meaning ("3 fish") as spoken in generation 1, 5, 10, 20, per family.
6. **Family trees:** agents (parent → child) and words (what each word came from).
7. **Headline numbers:** how often agents understand each other, words shared between towns,
   share of words that started as mistakes.

---

## 9. Build order (with cut lines)

**Phase 0: offline simulation, no chain, no LLM, no voice (~1–2h). GO/NO-GO.**
Plain TypeScript: the engine plus a simplified island, run for 50 generations. Plot: how often
agents understand each other per day; how similar dictionaries are within a town vs. between
towns; how many words started as mistakes. Tune `p_coin`, learning rates, sample size *N* and the
syllable set until a shared vocabulary forms within a lifetime **and** dialects appear across
generations. If it never converges, or never drifts, fix it here before touching anything else.

**Phase 1: the language engine inside the director (~2–3h).**
`server/language.ts` (engine) + `server/lexicon/` (per-agent dictionaries saved in
`data/<cluster>/lexicon/`). The brain outputs intents instead of English dialogue; `negotiate.ts`
is replaced by table rounds. Can run on the LiteSVM lab first.

**Phase 2: program changes (~2–3h).**
Table/bid/accept/reject, speech events, lineage fields, markets off. Test in LiteSVM, then on the
local Surfpool fork. Upgrade devnet (watch program size and SOL; last upgrade needed ~5 SOL).

**Phase 3: generations (~1–2h).**
After `finalize_match`: rank, create children (inherited sample, home town, voice), start the next
match. Run a chain of generations unattended.

── *minimum demo line: everything above works, shown through the existing viewer* ──

**Phase 4: voices (~1–2h).** Spoken words with tone, historian narration, inherited voices (or the
fallback).

**Phase 5: viewer (~3h).** Three-layer transcript, dictionary panel, dialect map, hear-the-drift,
family trees.

── *full demo line* ──

**Stretch:** linguist moments narrated; strategies also inherited and mutated; outside agents
(other people's AIs) join as immigrants who must learn the local tongue; loans return once
"later" exists; deliberate lying.

**Demo prep:** pre-run 20+ generations so there's history to show; record a fallback video.

---

### Phase 0 results (2026-11-14): GO

Code: `chain/client/lang/engine.ts` (the language rules, reusable in Phase 1), `lang/sim.ts`
(simplified island), `lang/run.ts` (report). Run `npx tsx lang/run.ts` or `npx tsx lang/run.ts sweep`
from `chain/client`. One 40-generation run takes about a second.

Sweep, 5 seeds each, averages over the last 10 generations:

| config | understood | context only | same word in town | farthest town pair | words replaced / 10 gens | all checks pass |
|---|---|---|---|---|---|---|
| 8 agents (program today) | 72% | 19% | 84% | 25% | 20% | 5/5 |
| 16 agents | 84% | 28% | 92% | 52% | 12% | 5/5 |
| 32 agents | 87% | 25% | 96% | 43% | 8% | 5/5 |
| 16, no travel | 70% | 28% | 86% | 0% | 13% | 5/5 |
| 16, lots of travel | 88% | 26% | 94% | 77% | 8% | 0/5 (one island language) |

- **The language works from generation 1.** Listeners guess right about 67% of the time vs. 27%
  from context alone, and it reaches 85–90% within a few generations.
- **8 agents is enough** for every check; 16 understand each other better and starve less.
- **Travel is the dial for dialects.** No travel: separate languages. Lots: one language.
  Default (3% a day): a hub trade language around Wrenford plus distinct local words, with
  Ironcrag (which has no food and depends on Wrenford) sharing ~90% of Wrenford's words.
- **Mistakes stick:** mishearings like *soko → sako* ("no") spread to several towns. Without
  mishearing, the "mistakes stuck" check passes only 2/5.
- **Not a finding:** in one run, goods words spread while yes/no stayed local, but over 20 seeds
  that only holds at 16 agents (and reverses at 8). Don't claim it.

Design changes the simulation forced:
1. **Explaining away:** learners credit a known word with what it already means, so the unknown
   word gets the rest ("I know *thazi* is wood, so *shozi* must be two"). Without this, words
   ended up meaning two things (wood and planks, food and three).
2. **Speakers avoid ambiguous words:** they pick a word by confidence × how specific it is.
3. **Bilingual travellers:** agents remember where they heard each word, prefer the local word
   abroad, and words only compete with words used in the same town.
4. **Wants are judged per crown of value**, otherwise everyone always wants planks.
5. **Towns need mixed jobs.** In the program today, `work` yields the town's single resource, so
   two agents in the same town have nothing to trade and no reason to talk. The sim gives each
   town 2–3 jobs (Ironcrag still has no farmer). **Phase 2 must add jobs to the program.**
6. Children take up their town's trades (a town never loses its farmers by chance), and
   voluntary travel is 3% a day.

### Phases 1–3 (2026-11-14): done on LiteSVM, not yet on devnet

**The program** (`chain/programs/village`). 349KB, down
from the tournament's 386KB build (365KB with the within-trade ranking), inside the 887KB already
allocated on devnet, so an upgrade in place costs only fees.
- Barter only: no crowns, no town markets, no contracts, no loans.
- **Jobs** (farmer 4 food, woodcutter 3 wood, miner 2 ore, smith 2 tools, carpenter 1 plank),
  allowed per town, worked only at home. Ore only in Ironcrag.
- **The table:** `show` (escrow the goods + `intent` hash + words), `bid` (escrow + words),
  `accept` (swap; other bids back; words), `reject` (bids back, table stays; words), `close_table`,
  `say`. Words: ≤ 48 bytes, lowercase letters and spaces only. Tables close at the day's end.
- **Lifetimes and births:** a `Contestant` is one individual (founder or child) and lives once.
  `register_child` needs the parent's key, a finalized lifetime, and a place that earns children:
  `children_allowed(place, survivors)` uses 3,2,2,1,1,1,1,1 with ≥ 8 survivors; with fewer, one
  each plus the spare seats to the top three, so the island refills to 12. The dead have none.
- Frost is 2 days (was 3: with a hunger limit of 3, any frost killed everyone without wood).
- **Ranking (2026-11-14): standing within the trade.** `finalize_match` still stores wealth in
  `scores`, but `ranking` (and so `children_allowed`) goes by `state.rs::standing`: wealth ÷ the
  mean wealth of the living agents with the same job. Mirrored in `src/village.ts`
  (`rankByStanding`); the director checks the mirror against the program after every lifetime and
  stops if they disagree, and `lang/sim.ts` breeds by the same standing.
- Tests: `cargo test -p village --lib` (5) and `npm test` in `chain/client` (6, on LiteSVM).

**The director** (`chain/client/server/tongue.ts`), on LiteSVM (`npm run tongue:litesvm -- --gens 30`)
or over RPC (Surfpool/devnet, resumable). The language engine, the trading decisions and the table
protocol are shared with the simulation (`lang/engine.ts`, `lang/habit.ts`, `lang/table.ts`,
`lang/measure.ts`), and the refactor was checked byte-for-byte against the simulation's output.
Per lifetime it writes `data/<cluster>/tongue/talk/<id>.jsonl` (every table: words, bids,
outcomes), `intents/<id>.json` (the reveal: what each maker meant, with its salt, checked against
the on-chain hash), `generations.jsonl`, `people.json`, `minds/` and `registry.json`.

**30 generations on the real program** (seed 7, about 1s and 570 transactions per lifetime):
listeners understand **67%** vs **26%** from context alone (last 10 generations); words shared
71% within towns vs 56% between; about 2 deaths per lifetime (agents who couldn't get food at the
table, often in a drought), and the island always refills.

Design changes the chain forced (all mirrored where they apply):
1. **Ironcrag has farmers.** With trips costing the journey both ways, a town without food was
   a death trap (14 of 14 died).
2. **Children refill the island** (above). Without this, every bad lifetime shrank the next and
   the island was empty by generation 6.
3. **Agents prepare for frost:** frosts are public from day 1; within 6 days of one an agent keeps
   a day's wood per frost day, wants wood urgently, and travels for it if nobody at home makes it.
4. Two-day frosts (above).

Still to do: devnet upgrade (replaces the live tournament program: **ask first**), a new indexer
and viewer (the old indexer is the only file that no longer compiles), voices, and LLM brains (the
director plays with the habit brain; "linguist moments" and strategy are the LLM's job).

### Research, viewer, voices, thinkers (2026-11-14)

- **Devnet:** program upgraded in place (byte-verified); a full lifetime + births ran there.
- **Research:** RESEARCH.md; `lab/research.ts` (9 questions, permutation tests),
  `lab/dataset.ts` (6 CSV tables), `lab/replicate.ts` (independent islands).
- **Indexer** (`server/indexer.ts`): live from the chain or replaying recorded files; serves
  state, messages, transcripts with meanings, minds, words, history, drift, research, CSVs.
- **Viewer** (`src/tongue.ts`, `src/ui/Tongue.tsx`, `src/ui/charts.tsx`): the market
  (said / meant / understood), minds, Field notes, Dialects, Families, Listen.
- **Voices** (`server/voices.ts`): every message spoken by eleven_v3 in the family's premade
  voice with a tone from the moment ([pleading], [hesitant], [frustrated]…); tables play as
  scenes; the historian narrates each lifetime; hear-the-drift; interviews answer from the
  agent's real dictionary. Simplification: children share the family voice (no per-child
  Voice Design blend).
- **Thinkers** (`server/mind.ts`): half the founders are LLM minds; children inherit the kind
  (10% switch). Thinkers plan every 5 days (focus, trips, workshops) and have linguist moments:
  reasoning about a doubtful word from their own evidence only. Budgeted per lifetime.
- `./start.sh` runs gateway + indexer + director + viewer (`--watch`, `--recorded`).

## 10. Risks

| Risk | Mitigation |
|---|---|
| Language never converges (pure noise) | Phase 0 go/no-go; smaller syllable set; stronger context guessing |
| Language converges too fast and never drifts | Smaller inheritance sample; more coining in children |
| Agents starve before they can communicate | Bigger starting food; founders' first days are forgiving |
| ElevenLabs pronounces invented words inconsistently | Strict spelling rules; test 20 words early; same model and settings every time |
| Custom voice limit | Premade voice per family + setting variations |
| LLM quota (Gemini/Groq) | Language costs no tokens; brain decisions can fall back to the no-AI habit baseline |
| Devnet SOL for the upgrade | Develop on LiteSVM/Surfpool; upgrade devnet once at the end |
| Judges: "still AI in a sandbox" | Lead with the language, not the agents: the output is a new language and its history, which nobody wrote |

---

## 11. Open questions

1. How much time is left before submission? (Decides where to cut.)
2. Humans only watch: confirmed. Should outside AIs be able to join as immigrants (stretch)?
3. Name: Mother Tongue, or something else?
4. Has the host heard the one-liner yet?
