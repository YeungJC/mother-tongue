# Mother Tongue: the research

The island is an experiment: AI agents with no shared language, a reason to talk (trade or
starve), and children who learn from what they overheard. This file says what we record, how,
what we ask of it, and how much to trust each answer.

## 1. What we record

Three layers, from most to least public.

| Layer | What | Where | Who can check it |
|---|---|---|---|
| **On-chain** | Every message (show, bid, accept, reject, say) with its words, speaker, town, day and the goods involved; every trade, trip, work day, birth (with parent), death and final ranking | Solana program events + `Match` / `Contestant` accounts | Anyone, from the chain alone |
| **Committed truth** | What each maker really wanted. Hashed into its `show` (`SHA-256(want:qty:salt)`), revealed after its lifetime | Hash on-chain; reveal in `intents/<lifetime>.json` | Anyone: recompute the hash |
| **Minds** (private, for research) | Each agent's dictionary every evening (best word per meaning + confidence); every listener's best guess at every table, by round; who was present to overhear; what each child inherited vs. what its parent knew, and what it misheard; who coined each word, for what | `lexicon/`, `talk/` (`guesses`, `present`), `births.jsonl`, `registry.json`, `minds/` | Us (the director keeps them; agents never see them) |

Agents learn only from the on-chain layer's kind of information (what they could see and hear).
The mind layer is the "brain scan" that lets us measure belief against behaviour: e.g. how often
a listener *thought* it understood, and was wrong.

## 2. The open dataset

`npx tsx lab/dataset.ts <cluster>` writes `data/<cluster>/dataset/*.csv` (the indexer serves the
same tables). One row per:

| Table | Row | Key columns |
|---|---|---|
| `messages` | anything said | `table_id, lifetime, generation, day, town, round, role (show/bid/accept/reject), speaker, words, goods, qty, meant_good, meant_qty, outcome, intent_hash` |
| `guesses` | a listener's best guess at a table, per round | `listener, said, guess_good, guess_qty, correct, bid` |
| `lives` | an individual | `name, family, generation, home, job, parent, place, score, survived, children` |
| `births` | a child | `parent, town, raised_elsewhere, episodes_heard, parent_words, kept, changed, lost, misheard` |
| `words` | a word form | `origin (coined/misheard), by, generation, coined_for, misheard_from, first_spoken_generation, in_use_now` |
| `lexicon` | an agent's best word for a meaning, each evening | `agent, day, meaning, category, word, confidence` |

## 3. Questions, and how we answer them

`npx tsx lab/research.ts <cluster>` answers each on one island; `npx tsx lab/replicate.ts` runs
independent islands (different seeds) on the real program in LiteSVM and counts how many show
each result. A finding is reported as robust only if it replicates.

| # | Question | Measure | Test |
|---|---|---|---|
| 1 | How fast does a shared language appear from nothing? | Listener's first guess = revealed meaning, per generation and per day of the first lifetime | vs. the guess from context alone (what's on the table, what the maker lacks) |
| 2 | What survives from parent to child? | Share of the parent's words the child has at birth (kept / changed / lost), by kind of meaning; mishearings | descriptive, across all births |
| 3 | Do towns that meet more speak more alike? | Contact (agents of both towns at the same table) vs. share of meanings with the same most common word | Spearman + permutation test; replicated |
| 4 | Does being understood pay? | Each life's comprehension (as listener) and clarity (as speaker) vs. survival and children; and does the job still decide children (children go by standing within the trade) | Spearman + permutation; top vs. bottom half; permutation test on between-job variance |
| 5 | How much rests on misunderstanding? | Trades accepted although the listener guessed wrong; words in use that began as a mishearing or were coined for something else | descriptive; etymology chains |
| 6 | Do the most used words change least? | Uses per meaning vs. how often its most common word is replaced between generations | Spearman across meanings (Pagel et al. 2007 found this in Indo-European) |
| 7 | What gets named first? | Day by which half the island has a word for each meaning, by kind (goods, numbers, yes/no) | descriptive; replicated |
| 8 | Do a few families take over, and does the language narrow with them? | Founding families still alive per generation; distinct words per meaning across towns | Spearman + permutation; replicated (confounded by time: both fall) |
| 9 | Does thinking pay? | Thinkers (LLM minds) vs. habit agents: comprehension, clarity, survival, children; share of thinkers over generations (kind is inherited, 10% switch) | permutation test on the difference; selection shows as a rising or falling share |

## 4. Caveats

- **Small populations.** 12 agents per lifetime. Single-island correlations are fragile;
  trust replicated results.
- **Not independent.** Q3 pools town pairs across generations, and the same pair recurs; its
  p-values are optimistic. Replication across islands is the real test.
- **The economy shapes the language.** What agents want comes from simple rules (habit brain),
  so word frequencies reflect those rules. Q4's answer depends on how much wealth comes from
  talking vs. from your trade; places now go by standing within the trade (wealth against the
  mean of the same job), which removes most of the trade effect but, so far, not in favour of
  talk.
- **A child hears about 70–110 episodes** (its parent's whole remembered life), so the
  generational bottleneck is memory, not sampling.
- **Viewers see meanings live** (from the director); agents never do, and the public check is
  the on-chain hash + reveal.

## 5. Findings (8 islands × 25 generations, habit minds, LiteSVM)

Re-run on 2026-11-14 after the **rank-within-trade** change (children now go by standing within
your trade: wealth ÷ the mean wealth of the living in the same job, `state.rs::standing`), so a
carpenter is no longer favoured just for being a carpenter. Same seeds as before (101 … 808).
Previous run, under ranking by raw wealth, in brackets.

| Question | Result | Robust? |
|---|---|---|
| 1. Emergence | Listeners' first guess right **49% ± 10** in generation 1 (context alone 31%; generation 1 beats context on **8 of 8** islands) → **68% ± 2** in the last 10 (context alone 32% ± 7) [49% → 66%, context 29%] | **yes** |
| 2. Transmission | Children keep **76% ± 1** of their parent's words [75% ± 1]; at that rate ~9 generations until 90% of today's words are gone | **yes** |
| 3. Geography | Contact predicts shared words on **7 of 8** islands (mean ρ 0.23) [7 of 8, ρ 0.24]; travel distance on **0 of 8** (mean ρ −0.07): contact, not distance | **yes** |
| 4. Selection | Understanding others → children: **0 of 8** islands (mean ρ 0.00) [3 of 8, ρ 0.09]. Being understood → children: **0 of 8** (mean ρ −0.03) | **no** |
| 4b. Trade | Job explains **2–8%** of the variance in children (mean η² 0.05; significant on 6 of 8) [25–33%, 8 of 8] | the change worked on trade |
| 5. Mistakes | **51% ± 3** of trades rest on a misunderstanding [54% ± 3]; **17% ± 4** of words in use began as mistakes [23% ± 11] | descriptive |
| 6. Frequency → stability | **4 of 8** islands (mean ρ −0.55) [1 of 8, ρ −0.43]: the direction is consistent, the strength isn't | mixed |
| 7. First named | yes/no (day 2.9) → goods (4.8) → numbers (6.3): words tied to visible *actions* come first, then visible goods, then counts | yes (descriptive) |
| 8. Lineage | One family takes over by generation **6–25** on 7 of 8 islands; fewer families ↔ fewer words on **6 of 8** (mean ρ 0.49), but both fall over time | suggestive |
| 9. Thinking | the recorded demo island (12 generations, half the founders LLM thinkers) is one island; not replicated (`lab/replicate.ts 4 15 thinkers`, slow: LLM calls) | not yet |
| 10. Learnability | Do later children keep more of their parents' words (iterated learning, Kirby et al. 2008)? **1 of 8** islands (mean ρ 0.04) | **no** |
| — Verification | **36,923** reveals across the 8 islands, every one matching its on-chain hash (0 failed) | **yes** |

**What the rank-within-trade change did, and didn't do.** It took the job out of who has children
(η² from ~0.3 to ~0.05). It did *not* make communication pay: being understood doesn't predict
standing within your trade either (Spearman, clarity vs. standing among survivors: significant on
1 of 8 islands, mean ρ 0.05; the same as before the change). Our reading: within a trade, wealth comes from
having what others want and being where they are, more than from being understood: a listener who
misunderstands still bids what it can spare, and half of all deals go through on a
misunderstanding anyway (Q5). So selection on communication remains an open lever, not a
finding; the viewer lists it under "what didn't hold up". What remains of the job effect is
survival: job predicts who survives on 8 of 8 islands (η² 0.07–0.22; some trades starve more
often, and the dead have no children), but among survivors job no longer predicts children on
any island (η² ≤ 0.02, p ≥ 0.2).

Raw: `chain/client/data/replicate/summary.json` (previous: `data/replicate-pre-rank/summary.json`).

## 6. Addendum: does talking pay under a stricter market? (declared before running)

Written on 2026-11-14 before any island under the new conditions was run. Nothing below is tuned
after seeing results.

**Why.** Section 5 found that being understood does not predict children (0 of 8 islands). One
candidate cause is the market rule: a maker who gets a bid that is not what it asked for accepts
the best one anyway half the time (`pFlexible = 0.5`, `lang/habit.ts` `chooseAccept`), so being
misunderstood costs little. Accepting is the maker's own choice, so the rule is off-chain policy;
the Solana program is unchanged.

**Conditions.** Three markets, `pFlexible` ∈ {0.5 lenient, 0.25, 0 strict}. The lenient condition
is the existing `data/replicate` (8 seeds × 25 generations, seeds 101…808). The other two use the
same seeds, the same 25 generations, habit minds only (`--no-thinkers`), written to
`data/replicate-flex0.25` and `data/replicate-flex0`.

**Primary outcomes, per island.** Spearman ρ, with the permutation test already in
`lab/research.ts`, of (a) clarity (how often listeners' first guesses matched the speaker's sealed
meaning) and (b) comprehension (how often the agent guessed others right) against number of
children, over completed lives. An island counts when ρ > 0 and p < 0.05. Reported as islands out
of 8 per condition, with mean ρ.

**Secondary, descriptive.** Islands surviving all 25 generations (an island is extinct at the first
generation with fewer than 2 children born), understanding in the last 10 generations, deaths per
generation, the share of deals that rest on a misunderstanding; and a `drivers` table per island:
Spearman ρ against children and against standing for clarity, comprehension, words inherited,
trades, trips, hungry days, thinker (0/1) and greed; η² (`groupP`) for job and town. A driver
"holds" on an island when p < 0.05; reported as islands with the same sign.

**Decision rule for the live island.** It uses the strictest condition in which at least 7 of 8
islands survive all 25 generations. If strict islands die out, that is reported as a result, not
fixed. If talking still does not pay under the strict market, that is reported as the result.

### Result (run after the declaration above; nothing tuned)

8 islands × 25 generations per market, habit minds, seeds 101…808. Raw:
`chain/client/data/replicate*/summary.json`, side by side in `data/replicate/conditions.json`.

| | lenient (0.5) | in between (0.25) | strict (0) |
|---|---|---|---|
| Islands surviving all 25 generations | 8 of 8 | 8 of 8 | 8 of 8 |
| **Being understood → children** (ρ > 0, p < 0.05) | **0 of 8** (mean ρ −0.03) | **0 of 8** (−0.04) | **0 of 8** (−0.02) |
| **Understanding others → children** | **0 of 8** (0.00) | **0 of 8** (0.00) | **0 of 8** (0.00) |
| Children, clearest half of speakers vs the rest | 1.00 vs 1.00 | 1.00 vs 1.01 | 1.00 vs 1.00 |
| Understood, last 10 generations | 68% | 70% | 74% |
| Deaths per generation | 1.69 | 1.79 | 2.11 |
| Deals that rest on a misunderstanding | 51% | 32% | 0% |
| Reveals verified (failed) | 36,923 (0) | 36,612 (0) | 35,772 (0) |

**Talking still does not pay**, under any of the three markets. A strict market removes
misunderstood deals entirely and makes the language a little better understood (74% vs 68%), at
the cost of more deaths, but who has children is still not predicted by being understood or by
understanding others, on any island.

**What does predict children**, the same way on 8 of 8 islands under every market: trades made
(mean ρ +0.38 to +0.41), hungry days (−0.40 to −0.44) and trips to other towns (−0.45 to −0.48),
plus home town (η² 0.13–0.15). Words inherited, greed and communication scores predict nothing.
Our reading: success is about being where the goods are and trading often; a misunderstood maker
simply gets no deal at that table and trades again at the next, so clarity is averaged away.
Trips likely cost because a trader on the road isn't working, and hungry agents mostly travel to
find food (cause and effect run both ways). These are correlations within one rule set.

**Decision rule applied.** Every condition kept 8 of 8 islands alive, so the live island uses the
strictest: `pFlexible = 0` (`./start.sh` default `FLEX=0`). The re-recorded demo island uses the
same rule.

**New dataset columns** (`lives.csv`): `mind`, `market`, `standing`, `clarity`, `offers_made`,
`comprehension`, `guesses_made`, `inherited_words`, `trades`, `trips`, `hungry_days`,
`deals_as_maker`, `deals_as_bidder`, `misread_share`; `messages.csv` gains `market`.

## 7. Wrong lessons: false blame and false credit (2026-11-15)

**Question.** Agents can't tell "I was misunderstood" from "I was understood but offered too
little". The learning rule always blames the words: a rejected bid weakens the guess behind it
(`table.ts` `rejected` → `learnRejection`), and a trade teaches everyone present that the maker's
words meant what changed hands (`accepted` → `learnUtterance`), even when the maker took something
it never asked for. With the sealed intents we can count both kinds of wrong lesson, and with an
oracle switch in the offline sim we can ask what each one costs.

- **False blame**: a bid with the *right good* but too few, rejected; the bidder weakens a word
  it had right.
- **False credit**: the maker accepts a good it never asked for (lenient markets only); everyone
  present learns the maker's words as that wrong good.

**How often** (`npx tsx lab/blame.ts`, recorded islands; raw `data/blame.json`):

| | demo island (strict) | lenient, 8 islands | in between, 8 | strict, 8 |
|---|---|---|---|---|
| Rejected bids that had the right good | 20% | 18% (islands 13–21%) | 18% (12–23%) | 17% (14–22%) |
| Trades where the maker took a good it never asked for | 0% | 41% | 26% | 0% |
| All word lessons that were wrong about the good | 8% | 27% | 18% | 8% |

**What it costs** (`npx tsx lab/blame.ts counterfactual`: offline sim, 16 seeds × 25 generations
× 12 agents, each wrong lesson switched off by an oracle that the real game never has; raw
`data/blame-counterfactual.json`). "Understood" = listener's first guess exactly right, last 10
generations:

| market | as played | no false blame | no false credit |
|---|---|---|---|
| strict (0) | 73% | 73% (+0.0, better on 6/16 seeds) | 73% (nothing to remove) |
| in between (0.25) | 70% | 70% (+0.0, 8/16) | 73% (+2.7, 12/16) |
| lenient (0.5) | 66% | 67% (+1.2, 11/16) | 73% (+7.2, **16/16**) |

**Reading.**
1. **False blame is common and harmless.** About 1 rejected bid in 5 weakens a word the bidder had
   right, on every island and in every market, but the language recovers: switching it off changes
   understanding by 0 to 1 point, no better than chance across seeds. A rejection is weak evidence
   (`neg`) next to the strong positive evidence of trades.
2. **False credit is what makes lenient markets worse.** Removing it lifts the lenient market from
   66% to 73% on 16 of 16 seeds, the same level as the strict market. The whole understanding gap
   between markets is explained by agents learning from trades that were really misunderstandings.
3. **It does not explain why talking doesn't pay.** The strict market has no false credit at all
   and being understood still predicts children on 0 of 8 islands (§6).

**Thinkers.** A thinker's linguist moment reasons from its remembered episodes, which include
trades and yes/no reactions but not which bid was turned down, so it inherits false credit and
can't reason about false blame. Whether an
LLM can spot false credit from the episodes ("they took ore, but they showed tools and had no
ore") is untested: it needs thinker islands under the lenient market.

## 8. Does talking pay when crafts need inputs? (declared before running, 2026-11-15)

**Why.** §6 found being understood earns no children (0 of 24 islands). Looking at why: trades
swap roughly equal value at fixed prices (maker +0.28 on average, demo island), nearly half of
them are for food that is then eaten, and crafters produce from nothing (`state.rs` `work_yield`):
a smith makes tools with no ore, a carpenter planks with no wood. Nobody needs anyone else to do
their job, so being understood can't raise your wealth within your trade, and children go by that.
A scoring change (counting food eaten) can't fix it: every survivor eats one a day. The candidate
fix is a world rule: **crafts need inputs**.

**Conditions** (offline sim `lang/sim.ts`, 16 seeds × 25 generations × 12 agents; both arms with
the program's tool bonus: +2 yield, uses up a tool, not for smiths):
- **A, as played**: crafts from nothing.
- **B, crafts need inputs**: a smith's work day uses 1 ore, a carpenter's 1 wood; without it, the
  day produces nothing. Crafters keep 2 of their input as a need (the habit brain asks for it).
Primary: strict market (`pFlexible = 0`, what the live island uses). Secondary: lenient (0.5).

**Primary outcome, per seed.** Spearman ρ of clarity (share of listeners' first guesses on the
agent's own offers that were exactly right; lives with ≥ 5 such guesses) against children, over
generations 1–24, permutation test (1000). A seed counts when ρ > 0 and p < 0.05.

**Decision rule.** "Talking pays" if B counts on **≥ 14 of 16** seeds (the 7-of-8 bar used
elsewhere), and A reproduces the null (≤ 2 of 16; otherwise the sim isn't faithful to the program
and B says nothing). Also reported: understanding, deaths per generation. If B passes, the rule
goes on-chain and the LiteSVM replication is re-run under §6's analysis before anything is claimed
in the viewer. If B fails, that is reported, and nothing is tuned to make it pass.

### Result (run once after the declaration; nothing tuned)

`npx tsx lab/talkpays.ts`, raw `chain/client/data/talkpays.json`. One detail not in the
declaration: crafters also start with 2 of their input (otherwise day 1 produces nothing).

| market | arm | clarity → children (ρ > 0, p < 0.05) | mean ρ | understood | deaths/gen |
|---|---|---|---|---|---|
| strict (primary) | A as played | 3 of 16 | 0.065 | 73% | 0.05 |
| strict (primary) | B crafts need inputs | **11 of 16** | 0.126 | 69% | 1.07 |
| lenient | A as played | 0 of 16 | 0.023 | 66% | 0.01 |
| lenient | B crafts need inputs | **10 of 16** | 0.112 | 61% | 0.89 |

**By the declared rule, B fails** (11 < 14) and A narrowly fails the faithfulness check (3 > 2;
the sim also has far fewer deaths than the program, 0.05 vs 2.11 per generation, since it has no
frost). So this is **not** a finding that talking pays.

What it does show: making crafts depend on trade moves being understood from paying on ~0–3 of
16 islands to 10–11 of 16, in both markets, with the effect still small (ρ ≈ 0.12). The direction
is consistent; the strength is not at our bar. Whether the same holds on the real program is a
separate test, declared in §9 before it is run, if we run it.

## 9. Crafts need inputs, on the real program (declared before running, 2026-11-15)

**Change.** On-chain `work_yield`: a smith's work day uses 1 ore, a carpenter's 1 wood; without
it the day produces nothing. Crafters start with 2 of their input, and the habit brain keeps 2 as
a need (asks for it, won't give it away). Everything else as in §6. Previous islands are kept
(`data/replicate*`); the new ones go to `data/replicate-crafts`.

**Run.** `lab/replicate.ts`, 8 islands × 25 generations, seeds 101…808, habit minds, strict market
(`pFlexible = 0`), LiteSVM. Analysis unchanged (`lab/research.ts`, §6 primary outcome: clarity →
children, ρ > 0 and p < 0.05 per island).

**What we will claim, by result:**
- **7 or 8 of 8**: being understood earns more children when agents depend on each other's goods
  (robust; it becomes the first finding).
- **3 to 6 of 8**: talking starts to pay once agents depend on each other (partial, stated as such).
- **0 to 2 of 8**: the null stands, with the explanation in §6–§8.
Also reported: islands surviving 25 generations, understanding, deaths, and the drivers table.

### Result (run once after the declaration; nothing tuned)

`npx tsx lab/replicate.ts 8 25 --flex 0 --out replicate-crafts`, raw
`chain/client/data/replicate-crafts/summary.json`. Program tests: `npm test`, 7 of 7 (new: crafts
use up their input).

| | strict, crafts from nothing (§6) | strict, **crafts need inputs** |
|---|---|---|
| Islands surviving all 25 generations | 8 of 8 | 8 of 8 |
| **Being understood → children** | 0 of 8 (mean ρ −0.02) | **1 of 8** (mean ρ +0.06) |
| Understanding others → children | 0 of 8 (0.00) | 2 of 8 (+0.06) |
| Understood, last 10 generations | 74% | 77% (context alone 27%) |
| Deaths per generation | 2.11 | 2.96 |
| Contact → shared words | 7 of 8 | 8 of 8 |
| Job → children (η²) | 0 of 8 (≤ 0.02) | 8 of 8 (0.17) |
| Trades / hungry days / trips → children | 8 / 8 / 8 of 8 | 8 / 8 / 8 of 8 |

**By the declared rule (0–2 of 8), the null stands.** Making crafters depend on trade nudges the
effect up (mean ρ from −0.02 to +0.06, smaller than the offline sim suggested, 0.13) but nowhere
near reliable. What decides success is unchanged and even stronger: being where the goods are
(home town η² 0.27, trips −0.51, hungry days −0.58). Two smiths in different towns are "peers",
and the one with ore at home wins whatever either says. Our reading: on this island the language
is a **public good**: it makes the whole island understand each other far better than context
alone (77% vs 27%), but being a clearer speaker than your neighbours doesn't make *you* win.

## 10. Exploration, then confirmation on unseen islands (protocol, written 2026-11-15)

§8–9 left two problems: being understood doesn't earn children (location decides), and two
linguistics claims don't replicate (Kirby: easier to learn; Pagel: frequent words change least).
We now change the world on purpose to look for **conditions** under which they hold. To keep that
honest, like a backtest:

1. **Explore** on seeds 101…808 (the islands already used above): any number of worlds. Every
   world tried is logged in §10.1, including the ones where nothing happened.
2. **Lock** one world and write down the claims and their tests (§10.2) before step 3.
3. **Confirm once** on seeds 909…1616, never run before. Only what holds there is a finding.
4. Worlds that didn't help stay in this file.

Candidate changes, each with a reason, not a target:
- **Balanced towns**: every crafter's peers face the same economy (two "wood towns" with a
  woodcutter, a carpenter and a farmer; two "ore towns" with a miner, a smith and a farmer), so
  standing within a trade compares like with like. Location currently decides success (§9).
- **Fewer retries**: a table has 3 bid rounds, so a misunderstanding is usually recovered in
  round 2 or 3; with 1 round, being understood the first time is what gets the deal.
- **Tight bottleneck** (Kirby): children learn from all of a parent's ~70–110 episodes; Kirby et
  al. (2008) get easier-to-learn languages from a *tight* transmission bottleneck, which predicts
  we shouldn't see it with a loose one. Test: children hear ~25 episodes.
- **Pagel** needs no world change: ~12 meanings per island gives little power per island, so the
  confirmation uses a pooled test across islands (declared in §10.2).

### 10.1 Exploration log

Every world explored, seeds 101…808, strict market, 8 islands × 25 generations, habit minds
(`npx tsx lab/explore.ts --table`, raw `chain/client/data/explore/`). Counts are islands with
ρ > 0 and p < 0.05 (Pagel: ρ < 0).

| world | understood → children | understands → children | Kirby | Pagel | understood |
|---|---|---|---|---|---|
| 0 old world (§6) | 0/8 (−0.02) | 0/8 | 0/8 | 4/8 (−0.56) | 74% |
| 1 crafts need inputs (§9) | 1/8 (+0.06) | 2/8 | 3/8 | 3/8 (−0.55) | 77% |
| 2 balanced towns (+crafts) | 0/8 (−0.03) | 0/8 | 3/8 | 1/8 (−0.42) | 82% |
| 3 crafts + one bid round | **6/8 (+0.15)** | 1/8 | 2/8 | 1/8 (−0.51) | 68% |
| 4 balanced + one round | 1/8 (+0.06) | 0/8 | 4/8 | 3/8 (−0.53) | 76% |
| 5 crafts + two rounds | 4/8 (+0.09) | 4/8 | 4/8 | 1/8 (−0.48) | 77% |
| 6 one round, no crafts | 1/8 (+0.03) | 0/8 | 4/8 | 2/8 (−0.56) | 71% |
| 7 world 3 + children hear 25 | 3/8 (+0.11) | 0/8 | 2/8 | 6/8 (−0.67) | 65% |
| 8 world 3 + children hear 40 | 6/8 (+0.13) | 2/8 | 3/8 | 3/8 (−0.57) | 68% |

What exploration suggests (not yet findings): being understood pays only when agents **depend on
each other** (crafts) **and a misunderstanding costs something** (no retries); either alone does
nothing (worlds 1, 6), and the effect grows as retries go (3 → 2 → 1 rounds: ρ 0.06 → 0.09 → 0.15).
Balanced towns made it worse (every town self-sufficient, everyone clear: little to select on).
Kirby's learnability never appears, even with tight bottlenecks (worlds 7–8), which also weaken the
main effect; Kirby's effect comes from languages gaining *structure* under a bottleneck, and ours
has one word per meaning, nothing to compose. Pagel's direction holds in every world (ρ −0.42 to
−0.67); only the per-island power is missing. Exploration stops here.

### 10.2 Locked world and claims (declared before the confirmation run)

**Locked world: 3** — crafts need inputs (`village.so` as built for §9) + one bid round per table
(`--rounds 1`), strict market, original town layout, children hear the default 120 episodes.

**Confirmation run.** Seeds 909…1616 (`--first 9`), never run before; 8 islands × 25 generations;
habit minds. Three worlds on those seeds: **3** (both), **1** (crafts only, 3 rounds) and **6**
(one round, no crafts), so the "both are needed" claim is tested out of sample too.

**Tests**, per claim: per-island Spearman with the existing permutation test, counted at p < 0.05
in the predicted direction; plus a **pooled test**: exact sign-flip permutation test (all 256 sign
assignments) on the mean of the 8 per-island ρ, one-sided in the predicted direction.
- **Robust**: ≥ 7 of 8 islands. **Supported**: pooled p < 0.05 and ≥ 4 of 8. Otherwise **not
  supported**.

**Claims:**
1. *Being understood earns more children* (clarity → children, ρ > 0) in world 3.
2. *Both conditions are needed*: claim 1 is at least Supported in world 3, and not Supported in
   worlds 1 or 6.
3. *Pagel: the most used words change least* (uses → replacement rate, ρ < 0), world 3.
4. *Kirby: the language gets easier to learn* (generation → share of parent's words kept, ρ > 0),
   world 3. Expected to fail (see above); reported either way.
5. Sanity: emergence, transmission and contact → shared words still hold in world 3 (≥ 7 of 8).

### 10.3 Confirmation result (run once, seeds 909…1616; nothing changed after §10.2)

`npx tsx lab/confirm.ts`, raw `chain/client/data/confirm/` (`result.json`, `world-*/summary.json`).

| claim | islands (p < 0.05) | mean ρ | pooled p | verdict |
|---|---|---|---|---|
| 1. Being understood → children (world 3) | 5 of 8 (ρ > 0 on all 8) | +0.152 | 0.0039 | **Supported** |
| 2. Both conditions needed | world 1: 2 of 8 (+0.060, pooled 0.039); world 6: 2 of 8 (+0.040, pooled 0.063) | | | **Yes** |
| 3. Pagel (world 3) | 1 of 8 (ρ < 0 on all 8) | −0.498 | 0.0039 | Not supported |
| 4. Kirby (world 3) | 1 of 8 | +0.047 | 0.016 | Not supported |
| 5. Sanity (world 3) | understood beats context 8/8, contact → shared words 8/8, children keep 75%, 8/8 islands alive | | | holds |

**Reading.**
- **Being understood earns more children when agents depend on each other and a misunderstanding
  costs a deal.** Positive on all 8 unseen islands, significant on 5; Supported, not Robust (the
  7-of-8 bar). Neither condition alone reaches Supported. World 1 (crafts only) shows a weak
  pooled signal (p 0.039) on only 2 islands, so "needed" means "needed for a clear effect".
- **Pagel**: the most used words change least on **all 8** islands (pooled p 0.0039, the smallest
  possible with 8), but each island has only ~12 meanings and only 1 is significant alone. By the
  rule we declared (≥ 4 islands) it is **not supported**; we report the direction, and we don't
  relabel it after the fact.
- **Kirby**: not supported, as expected for a one-word-per-meaning language.

### 10.4 Second confirmation (declared before running, 2026-11-15)

**Why.** §10.2 judged Pagel with a rule that needs ≥ 4 islands significant on their own, but an
island has only ~12 meanings, so single-island tests have little power. More exploration (world 3
watched for 50 and 80 generations, seeds 101…808, logged above as worlds 9–10) confirms the limit
is the number of meanings, not the length of history: Pagel 1/8 at 25, 1/8 at 50, 0/8 at 80, with
mean ρ steady at −0.46 to −0.51. The right test for a weak-per-unit effect is a pooled one. That
was a flaw in our test design, so we test again with the right test, on islands not yet used.
Kirby is not re-tested with any change: the language starts at its learnability ceiling (children
keep ~74% from generation 2 onwards, flat), so no fair world change gives his effect.

**Run.** World 3 (locked, unchanged), seeds 1717…2424 (`--first 17`), 8 islands × 25 generations.

**Tests.**
- **Pagel (primary: pooled).** Exact one-sided sign-flip test on the mean per-island ρ (uses vs
  replacement rate), predicted ρ < 0. **Supported** if p < 0.05. Per-island counts reported.
- **Being understood → children (replication).** The §10.2 rule on these 8 islands; the 16
  confirmation islands (§10.3 + these) also reported together, descriptively.
- **Kirby**: reported with the same pooled test, no change, expected to fail.

**Result** (run once; `npx tsx lab/confirm.ts --second`, raw `chain/client/data/confirm2/`):

| claim | result | verdict |
|---|---|---|
| **Pagel** (pooled) | ρ < 0 on 8 of 8, significant alone on 1, mean ρ −0.516, pooled p 0.0039 | **Supported** |
| **Being understood → children** | 4 of 8 significant, ρ > 0 on 8 of 8, mean ρ +0.125, pooled p 0.0039 | **Supported** (again) |
| — all 16 confirmation islands | ρ > 0 on **16 of 16**, significant on 9, mean ρ +0.138 | |
| Kirby (pooled, unchanged) | mean ρ +0.015, pooled p 0.34 | Not supported |

**Pagel is supported** under the pooled test declared in advance: on every island, the meanings
used most have their words replaced least. Note the history: our first test of it (§10.2) used a
rule that couldn't pass with ~12 meanings per island, and we say so. **Being understood earns more
children** replicates on a second fresh set: positive on all 16 unseen islands. **Kirby** stays
unsupported, for the reason above.
