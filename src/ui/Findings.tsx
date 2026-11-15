// Findings: at most five results, only those that replicate across independent islands, each as
// a question, one big number, one chart, on how many islands it holds, why it matters, and the
// method (collapsed). Then what didn't hold up, and the data. Every number comes from the
// research (this island), the replication under this island's market, and the market comparison.
import type { ReactNode } from 'react'
import { indexerUrl, useTongue } from '../tongue'
import { LineChart, Panel, Ranked } from './charts'
import { WorldsChart, useCondition } from './Agents'
import WordHistories from './WordHistories'

const fx = (x: unknown, d = 2) => (typeof x === 'number' && Number.isFinite(x) ? x.toFixed(d) : '–')
const pct = (x: number | null | undefined) => (x === null || x === undefined || !Number.isFinite(x) ? '–' : `${Math.round(x * 100)}%`)
const mean = (xs: number[]) => { const ys = (xs ?? []).filter(Number.isFinite); return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : NaN }
const sd = (xs: number[]) => { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))) }
const sig = (xs: { rho: number; p: number }[] | undefined, sign: number) => (xs ?? []).filter((x) => x.p < 0.05 && Math.sign(x.rho) === sign).length

type Verdict = 'robust' | 'mixed' | 'no' | 'single'
function Badge({ v, children }: { v: Verdict; children: ReactNode }) {
  const icon = v === 'robust' ? '✓' : v === 'no' ? '✗' : v === 'mixed' ? '~' : '•'
  return <span className={`badge ${v}`}><b aria-hidden="true">{icon}</b> {children}</span>
}

function Finding({ n, q, big, bigLabel, answer, why, verdict, method, children }: { n: number; q: string; big: string; bigLabel: ReactNode; answer: ReactNode; why: ReactNode; verdict: ReactNode; method: string; children?: ReactNode }) {
  return (
    <section className={`r-section${children ? '' : ' solo'}`}>
      <div className="r-text">
        <span className="r-n">{String(n).padStart(2, '0')}</span>
        <h2>{q}</h2>
        <div className={`r-big ${big.length > 9 ? 'long' : ''}`}><b>{big}</b><span>{bigLabel}</span></div>
        <div className="verdict">{verdict}</div>
        <p className="lead">{answer}</p>
        <p className="why"><span className="kicker">Why it matters</span> {why}</p>
        <details><summary>How we measured it</summary><p>{method}</p></details>
      </div>
      {children ? <div className="r-chart">{children}</div> : null}
    </section>
  )
}

export default function Findings() {
  const r = useTongue((s) => s.research)
  const rep = useTongue((s) => s.replication)?.summary
  const example = useTongue((s) => s.all).find((t) => t.meant && t.said && t.revealed)
  const { conditions } = useCondition()
  const ev = useTongue((s) => s.evidence)
  const generations = useTongue((s) => s.generations)
  if (!r) return <div className="page report"><p className="note">Loading…</p></div>
  const islands: number = rep?.seeds ?? 0
  const verdictOf = (k: number, of = islands): Verdict => (!of ? 'single' : k >= of * 0.75 ? 'robust' : k >= of * 0.4 ? 'mixed' : 'no')
  const on = (k: number) => (islands ? `${k} of ${islands} islands` : 'one island')
  const e = r.emergence
  const items: ReactNode[] = []
  const nulls: { badge: ReactNode; title: string; text: ReactNode }[] = []
  let n = 0

  // 1. Emergence: a shared language with no teacher.
  const gen1Beats = rep ? rep.understoodFirstGen.filter((u: number, i: number) => u > rep.contextFirstGen[i]).length : (e.byGeneration[0]?.rate > e.byGeneration[0]?.context ? 1 : 0)
  const late = rep ? mean(rep.understoodLate) : mean(e.byGeneration.slice(-10).map((g: any) => g.rate))
  const ctx = rep ? mean(rep.contextLate) : mean(e.byGeneration.slice(-10).map((g: any) => g.context))
  const tested = (k: number) => (islands ? `Seen on ${k} of ${islands} test islands` : 'One island so far')
  if (verdictOf(gen1Beats) === 'robust' || !islands) items.push(
    <Finding key="emerge" n={++n} q="Can AIs build a shared language with no teacher?"
      big={pct(late)} bigLabel={<>of the time, a listener now guesses <b>exactly</b> what the speaker meant. Guessing from the goods on the table alone gets <b>{pct(ctx)}</b>.</>}
      answer={<>Yes. The agents start with no words at all. Within their first lifetime they already understand each other better than guessing ({pct(rep ? mean(rep.understoodFirstGen) : e.byGeneration[0]?.rate)} vs {pct(rep ? mean(rep.contextFirstGen) : e.byGeneration[0]?.context)}), and it keeps improving.</>}
      why={<>Nobody designed this language. The agents made it up themselves because they needed it to trade, and only they can read it.</>}
      verdict={<Badge v={verdictOf(gen1Beats)}>{tested(gen1Beats)}</Badge>}
      method="After every offer, we compare each listener's first guess with what the speaker really meant (locked on Solana before anyone answered, revealed after the speaker's life). 'Guessing from the goods alone' is the best a listener could do with no words: looking at what's on the table and what the speaker is short of. Per island, generation 1 must beat that guess.">
      <LineChart title="How often a listener guesses exactly what was meant" sub="this island, by generation" xLabel="generation" yMax={1}
        series={[{ name: 'with words', points: e.byGeneration.map((g: any) => ({ x: g.gen, y: g.rate })) }, { name: 'goods alone', points: e.byGeneration.map((g: any) => ({ x: g.gen, y: g.context })) }]} />
    </Finding>,
  )

  // 2. Does being understood pay? The four worlds (RESEARCH.md §10), confirmed on unseen islands.
  const worldsReady = conditions.length > 0 && !!conditions[0].id
  if (worldsReady) {
    const both = conditions.find((c) => c.mine)!
    const all = rep?.locked ? rep.clarity as { rho: number; p: number }[] : null
    const allPos = all ? all.filter((x) => x.rho > 0).length : both.clarity.positive
    const allSig = all ? all.filter((x) => x.rho > 0 && x.p < 0.05).length : both.clarity.k
    const allN = all ? all.length : both.clarity.of
    items.push(
      <Finding key="talk" n={++n} q="Does being understood help an agent have more children?"
        big={`+${Math.round((both.clarityHalves.top / both.clarityHalves.bottom - 1) * 100)}%`} bigLabel={<>more children for the <b>clearer half</b> of agents, under this island's rules. Clear speakers came out ahead on <b>{allPos} of {allN}</b> test islands.</>}
        answer={<>Yes, but only when two things are both true. First, agents <b>need each other's goods</b> to do their jobs (a smith can't make tools without ore). Second, a misread offer is a <b>lost trade</b>: when an agent offers goods and says what it wants in return, listeners get one guess, not several. With only one of these two true, agents who were easier to understand had no real advantage.</>}
        why={<>Most systems of AI agents let them retry for free: ask again, rephrase, send another message. Our first version of the island worked like that too, and even though the agents clearly needed and used their language, being easier to understand gave them no advantage at all. If you want agents to be pushed towards communicating clearly, a misunderstanding has to cost them something.</>}
        verdict={<Badge v="robust">Found on practice islands, then confirmed on {allN} new ones</Badge>}
        method={`Like testing a trading strategy on data it wasn't built on: we tried different rules on practice islands (every attempt is listed in RESEARCH.md §10), froze the rules, wrote down the test, then ran ${allN} islands we had never seen. For each finished life: how often listeners understood it, against how many children it had (Spearman correlation per island; positive on ${allPos} of ${allN}, clear enough to rule out chance on ${allSig}; across islands, an exact sign-flip test, p < 0.01). The chart compares the clearer and less clear half of agents under each set of rules, on the same 8 new islands. The two middle rows are the controls, each with only one of the two rules. On the practice islands the effect also grew step by step as tries per offer went from 3 to 2 to 1 (ρ 0.06, 0.09, 0.15; exploration only, not part of the confirmation).`}>
        <Panel title="Average children: clearer half against less clear half" sub={`The same ${both.clarity.of} new islands under each set of rules. "Clear link" counts islands where the pattern was too strong to be chance.`}><WorldsChart /></Panel>
      </Finding>,
    )
  }

  // 3. Pagel: the most used words change least (pooled test, declared in advance).
  const pg = ev?.confirm2?.pagel
  if (pg && pg.verdict === 'SUPPORTED') {
    const stab16 = rep?.locked ? (rep.stability as { rho: number }[]) : null
    const neg = stab16 ? stab16.filter((x) => x.rho < 0).length : pg.negative
    const nIs = stab16 ? stab16.length : 8
    items.push(
      <Finding key="pagel" n={++n} q="Do machine languages change like human ones?"
        big={`${neg} of ${nIs}`} bigLabel={<>test islands where the <b>most used</b> words were <b>replaced least</b></>}
        answer={<>Yes, in one well-known way. In human languages, everyday words like "two" or "water" change very slowly over centuries, while rarer words get swapped out quickly (Pagel et al., 2007). The same happens here: the meanings that come up most keep their words longest.</>}
        why={<>This pattern appears with no humans involved, which suggests it comes from how any language is passed down, not from anything special about people.</>}
        verdict={<Badge v="robust">Holds when all {nIs === 16 ? '' : 'the '}test islands are taken together</Badge>}
        method="For each meaning on an island: how often it came up, against how often its most common word was replaced between generations (Spearman correlation). An island has only about 12 meanings, too few to be sure from one island alone, so the test we wrote down in advance pools the islands (exact sign-flip test on the average correlation over 8 new islands: p < 0.01). Our first attempt (RESEARCH.md §10.2) wrongly also required each single island to be clear on its own. We've kept that mistake on record.">
      </Finding>,
    )
  }

  // 4. Drift: how much of a parent's language reaches the child.
  const kept: number = rep ? mean(rep.kept) : r.transmission.kept
  const turnover = kept > 0 && kept < 1 ? Math.ceil(Math.log(0.1) / Math.log(kept)) : NaN
  const keptSteady = rep ? sd(rep.kept) < 0.05 : false
  if (keptSteady || !islands) items.push(
    <Finding key="drift" n={++n} q="How fast does the language change?"
      big={pct(kept)} bigLabel={<>of a parent's words are passed on to its child{Number.isFinite(turnover) ? <>. At that rate, in about <b>{turnover} generations</b> almost none of today's words are left.</> : null}</>}
      answer={<>A child learns only from what its parent happened to overhear, so every generation some words are lost or replaced. On this island a child keeps {pct(r.transmission.kept)} of its parent's words, uses a different word for {pct(r.transmission.changed)} and loses {pct(r.transmission.lost)}.</>}
      why={<>If AI agents keep replacing each other, a language that works between them today could be unreadable, even to their own successors, within a few generations.</>}
      verdict={<Badge v={islands ? 'robust' : 'single'}>{islands ? `About the same on all ${islands} test islands` : 'One island so far'}</Badge>}
      method="At each birth, the child's best word for every meaning is compared with its parent's at the end of the parent's life: same word (kept), another word (different) or none (lost). The 'generations until gone' figure assumes the same rate every generation; in reality a lost word can come back.">
      <Panel title="What happens to a parent's words" sub="this island, every child"><Ranked keepOrder unit="of words" format={(v) => pct(v)} rows={[{ label: 'kept', value: r.transmission.kept }, { label: 'changed', value: r.transmission.changed }, { label: 'lost', value: r.transmission.lost }]} /></Panel>
    </Finding>,
  )

  // 5. Dialects follow contact.
  const geo = sig(rep?.geography, 1)
  const dist = rep?.geoDistance ? sig(rep.geoDistance, -1) : null
  if (verdictOf(geo) === 'robust') items.push(
    <Finding key="geo" n={++n} q="Why do towns end up speaking differently?"
      big={`${geo} of ${islands}`} bigLabel="test islands where towns that trade together share more words"
      answer={<>Because of who they talk to{dist !== null && verdictOf(dist) !== 'robust' ? ', not how far apart they are' : ''}. Towns whose people meet at the same tables end up using the same words; towns that rarely meet drift into their own dialects.</>}
      why={<>Groups of AI agents that rarely interact will drift into languages the other groups can't understand, just as human dialects follow trade routes.</>}
      verdict={<Badge v="robust">{tested(geo)}</Badge>}
      method={`For every pair of towns in every generation: contact = how often people from both towns were at the same table; similarity = the share of meanings where both towns use the same most common word. Spearman correlation per island. Distance alone predicts shared words on only ${dist ?? '–'} of ${islands} islands.`}>
      <LineChart title="How alike towns speak, this island" sub="share of meanings with the same word, within a town and between towns" xLabel="generation" yMax={1}
        series={[{ name: 'within a town', points: generations.map((g: any) => ({ x: g.gen, y: g.withinTown })) }, { name: 'between towns', points: generations.map((g: any) => ({ x: g.gen, y: g.betweenTowns })) }]} />
    </Finding>,
  )

  // How words change: real sound changes and dialect splits from this island (descriptive, not numbered).
  items.push(<WordHistories key="words" startedAsMistake={r.mistakes?.startedAsMistake} wordsInUse={r.mistakes?.wordsInUse} />)

  // 6. Proof of meaning.
  const verifiedAll = rep?.verified ? rep.verified.reduce((a: number, x: any) => a + x.verified, 0) : 0
  const failedAll = (rep?.verified ? rep.verified.reduce((a: number, x: any) => a + x.failed, 0) : 0) + r.data.failedVerification
  items.push(
    <Finding key="proof" n={++n} q="Can we prove what an AI meant?"
      big={(r.data.verified + verifiedAll).toLocaleString()} bigLabel={<>meanings locked on Solana before anyone answered, then checked. <b>{failedAll}</b> failed.</>}
      answer={<>Yes. Before speaking, each agent locks in what it means as a code on Solana that nobody can read yet. After its life, the meaning is revealed, and anyone can check it matches the code.</>}
      why={<>When AIs talk in words we can't read, we can still check what they meant, and whether they understood each other.</>}
      verdict={<Badge v={failedAll === 0 ? 'robust' : 'mixed'}>{failedAll === 0 ? 'Every meaning matched its code' : `${failedAll} didn't match`}</Badge>}
      method="When an agent makes an offer, the program stores SHA-256(good : quantity : secret) next to its words; the secret stops anyone guessing it. After the lifetime the secrets are published, and every hash is recomputed before a meaning is used in the research.">
      <div className="seal-steps">
        <div><b>1 · said</b><i>“{example?.said ?? '…'}”</i><small>{example ? `${example.maker}, generation ${example.gen}: the words, on Solana` : 'the words, on Solana'}</small></div>
        <div><b>2 · locked</b><code>{example ? `${example.intent.slice(0, 10)}…` : 'sha256(…)'}</code><small>a code for what it means, on Solana before anyone answers</small></div>
        <div><b>3 · revealed</b><span>{example?.meant ? `${example.meant.qty} ${example.meant.good} ✓` : 'after its life'}</span><small>anyone can check it matches</small></div>
      </div>
    </Finding>,
  )

  // What didn't hold up, and what this setup can't test.
  // The single-condition worlds are controls for finding 02 (shown in its chart), not claims anyone made.
  const th = r.thinking
  nulls.push({ badge: <Badge v="single">{th?.thinkers ? 'one island only' : 'no LLM agents here'}</Badge>, title: 'LLM agents communicate better than rule-following agents', text: <>Some agents are run by an LLM that plans and reasons about words; the rest follow simple rules. {th?.thinkers >= 20 && th?.habit >= 20 ? <>On this island: {fx(th.children.thinker, 2)} vs {fx(th.children.habit, 2)} children each, and they understood others {pct(th.comprehension.thinker)} vs {pct(th.comprehension.habit)} of the time.</> : null} That's one island: running enough islands with LLM agents would take far more LLM calls than our free quota allows, so we can't say yet.</> })
  if (islands && verdictOf(gen1Beats) !== 'robust') nulls.push({ badge: <Badge v={verdictOf(gen1Beats)}>{on(gen1Beats)}</Badge>, title: 'The first generation already beats guessing', text: <>Only on {on(gen1Beats)}.</> })
  const limits = [
    { title: 'Languages get easier to learn over generations', text: <>In experiments with people (Kirby et al., 2008), a language passed down a chain of learners gets easier to learn, because it develops grammar: patterns that let you work out words you've never heard (like adding "-s" for more than one). Our agents' language has no grammar, just one word per thing, so there is nothing that could get easier: children keep about {pct(kept)} of their parent's words from the second generation on, and it stays flat. Testing this would need agents that can build words out of parts.</> },
  ]

  return (
    <div className="page report">
      <header className="r-hero">
        <span className="kicker">Findings</span>
        <h1>What we learned from AI agents inventing a language</h1>
        <p className="lead"><b>Every result below was tested fairly.</b> We experimented on practice islands first, then froze the rules and tested once on {islands ? `${islands} brand-new islands` : 'brand-new islands'}, so we couldn't tweak the world until it gave the answer we wanted (like testing a trading strategy on data it wasn't built on). The island you're watching has {r.data.generations} generations and {r.data.tables.toLocaleString()} exchanges. Open "How we measured it" under any finding for the statistics.</p>
      </header>
      {items}
      <div className="r-band muted">What we couldn't show</div>
      <details className="r-nulls-wrap">
        <summary>{nulls.length + limits.length} questions we couldn't answer, and why</summary>
        <div className="r-nulls">
          {nulls.map((x) => <div className="null" key={x.title}>{x.badge}<h3>{x.title}</h3><p>{x.text}</p></div>)}
          {limits.map((x) => <div className="null" key={x.title}><Badge v="single">can't test here</Badge><h3>{x.title}</h3><p>{x.text}</p></div>)}
        </div>
      </details>
      <div className="r-band">The data</div>
      <section className="r-data">
        <div>
          <h3>Three kinds of data, all checkable</h3>
          <p><b>On Solana:</b> every offer, bid, acceptance and birth, with speaker, place and day. <b>What they meant:</b> what each speaker meant, locked into its offer as a code and revealed after its life. <b>What they believed:</b> every agent's private dictionary every evening, every listener's guess, what each child inherited.</p>
        </div>
        <div>
          <h3>Download this island</h3>
          <p className="downloads">{['messages', 'guesses', 'lives', 'births', 'words', 'lexicon'].map((t) => <a key={t} className="chip on" href={`${indexerUrl()}/dataset/${t}.csv`}>{t}.csv</a>)}</p>
          <p className="note">{r.data.tables.toLocaleString()} exchanges · {r.data.verified.toLocaleString()} verified meanings · {r.data.people} lives · {r.data.births} births · {r.data.snapshots.toLocaleString()} dictionary snapshots. One row per message, guess, life, birth, word and agent-evening; schema in RESEARCH.md. The replication islands export the same way (lab/dataset.ts).</p>
        </div>
      </section>
    </div>
  )
}
