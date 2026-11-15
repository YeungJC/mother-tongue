# Mother Tongue: the 2-minute video

## Recorded clips (`demo-video/`)

1920×1080, 30 fps, one per shot; trim each to its slot and narrate over them. Sound: 01, 02 and 04 carry a quiet ElevenLabs town ambience, and 02 also has the agents' ElevenLabs voices (each line where it was spoken). The findings clips have a silent track; 03 and 07 have none (07's live interview voice can't be captured). Re-record any
shot with `./start.sh --recorded` running, then `node scripts/record-demo.mjs <shot numbers>`
(e.g. `node scripts/record-demo.mjs 3 7`); it opens a Chrome window while it records.

| slot | clip | what's in it | use |
|---|---|---|---|
| 0:00–0:10 | `01-cold-open.mp4` (16 s) | the island trading, no interface; ambience | any 10 s |
| 0:10–0:20 | `02-exchange.mp4` (84 s, with voices) | presenter mode (island + exchange card only), generation 10; pauses on Zed·10 saying *"kokuke"* (= 1 wood), all six listeners guess right, *understood, so they traded* | the last ~15 s: Zed speaks, the listeners answer, it pauses |
| 0:20–0:30 | `03-explorer.mp4` (20 s) | Solana Explorer: scrolls to the decoded `show`, Words `buguzi kaku` outlined | from ~8 s (skip the cookie banner) |
| 0:30–0:50 | `04-generations.mp4` (27 s) | the word table filling and "Guessed right" climbing: generation 2 → 5 → 8 → 11 | the last ~20 s |
| 0:50–1:20 | `05-finding-talk.mp4` (27 s) | Findings scrolls to finding 02: **+37%** children for the clearer half, and the four-rules chart (clearer vs less clear half, average children) | from ~9 s |
| 1:20–1:35 | `06-finding-pagel.mp4` (23 s) | finding 03 (Pagel): 16 ticked squares, one per test island | from ~10 s |
| 1:35–1:45 | `07-interview.mp4` (66 s) | Nyx·11: the question is typed into the live ElevenLabs conversation, Nyx answers | the question and answer (~25–45 s) |
| 1:45–1:52 | `07b-the-record.mp4` (32 s) | Nyx's record: the three times it guessed right but offered too few | the highlighted rows |
| 1:52–2:00 | `08-proof-and-data.mp4` (22 s) | finding 06 (proof), then the data downloads | any 8 s |

Previous takes of 02, 04, 05, 06 and 08 (before the wording and chart changes) are in `demo-video/old-2026-11-15/`.

In this take Nyx answers: *"Wren showed three sukune, food, and said 'tinu rushe.' I thought that
meant three tinu, wood, so I offered two wood. Wren said shuna, no, so the trade was not made."*
Answers vary per take; the record shows the truth either way: Nyx understood exactly, and offered
too few.

---

You narrate it yourself. About 280 words at a natural pace; the lines below are a guide, not a
script to read. Record the screen with QuickTime (File → New Screen Recording) at full window
size, one clip per shot, and cut the clips to your voice afterwards.

**Setup.** `./start.sh --recorded` and open the URL it prints. Every shot below is that URL plus
the parameters shown. Browser full screen, zoom 100%, sound on (the island's voices are part of
the video). Close other tabs so nothing pops up.

`BASE = http://localhost:5173/?indexer=http://localhost:8412`

---

### 0:00–0:10 · Cold open: they speak
**Screen:** `BASE&page=watch&speed=1&clean`. Let two or three exchanges play with sound; nothing
else on screen. Fade the title *Mother Tongue* in over it in the edit.
**Say:** *"These twelve AI agents were born speaking nothing. To eat, they have to trade, and to
trade, they have to invent words."*

### 0:10–0:30 · One exchange, sealed on Solana
**Screen:** `BASE&page=watch`. Pause (⏸) on a clear exchange card: goods, the invented words,
**meant** (sealed), each listener's guess ✓/✗. Then cut to Solana Explorer showing a `show`
transaction on devnet (link below): the words and the 32-byte intent hash are in it.
**Say:** *"What each speaker meant is sealed on Solana before anyone answers, so we can check,
word by word, whether they understood each other."*
**Explorer shot:** https://explorer.solana.com/tx/3988nr5d6Y5ALosP4oLNdbxiNmDQU8gqucWMK9zNwdEepWRRbNBgUP2iH9jZbyPXEm8exfZCirWdBm9CxJxGb6JS?cluster=devnet
A Saltmere agent shows 2 wood and says **"buguzi kaku"**; the sealed meaning, revealed after its
life, is **2 tools** (Saltmere's words: *buguzi* = tools, *kaku* = two). Accept the cookie banner
first, then scroll to **#2 Village: Show**: the **Words** row reads `buguzi kaku`, and **Intent**
(click Expand) is the sealed hash. Optional line: *"buguzi kaku: two tools. Nobody taught it
that."*

### 0:30–0:50 · The language changes
**Screen:** click **16×**: the dictionary fills, the timeline climbs. Then, in the language panel,
click a word's 🔊 **hear the drift**: one meaning spoken generation by generation.
**Say:** *"Children learn from what their parents overheard. The language drifts, splits into
dialects, and keeps its mistakes."*
**Alternative screen (word histories):** `BASE&page=findings`, scroll to **How words change**.
Left list: Saltmere's word for wood, *dinu* (generations 1–9) → *tinu* (10–12); press ▶ to hear
it change. Below, the **wood** timeline: Saltmere's colour changes at generation 10, and by
generation 12 neighbouring Wrenford says *tinu* too, while Oakhollow and Ironcrag keep *nosho*.
**Say (with it):** *"A child in Saltmere misheard 'dinu' as 'tinu', and within two generations
the next town over was saying it too. That's how dialects form, in human languages and here."*
These are examples from the demo island, not a tested result; the tested result on dialects is
the "contact, not distance" finding.

### 0:50–1:20 · The finding: when does talking pay?
**Screen:** `BASE&page=findings`, scroll to finding 02: +37%, and the four-rules chart.
**Say:** *"Does being understood help an agent succeed? Only when agents need each other and a
misunderstanding costs the deal. Most AI systems let agents retry for free, and there, being clear
gives no edge at all. We found this on practice islands, locked the rules, then confirmed it on
sixteen islands we'd never run. Under these rules, the clearer half of agents have 37% more
children."*

### 1:20–1:35 · Like human languages
**Screen:** scroll to finding 03 (Pagel): one ticked square per test island.
**Say:** *"And like human languages, the words they use most change least."*

### 1:35–1:52 · Ask them why
**Screen:** `BASE&page=agents`. In **Every life**, switch to *all* and click **Nyx·11** (generation
11, Saltmere), then 🎙 **Interview** (allow the microphone). Ask: *"Why did Wren turn down your
wood on day twelve?"* Let it answer, then show **The record** below: on days 4, 12 and 13 Wren
said *"tinu rushe"*, sealed meaning **3 wood**; Nyx guessed **3 wood ✓** but only offered 2 (it
was saving wood for the frost: its own thought, *"I chop more wood to keep the hearth warm"*).
Wren said no, and all Nyx learns from a no is to trust *"tinu rushe"* less: it understood
perfectly and unlearns a word it had right. Do one or two takes; the agent's wording varies.
**Say (over the record):** *"You can ask them why, and check whether they're right."*

### 1:52–2:00 · Close
**Screen:** finding 06 (proof), then the data downloads.
**Say:** *"Every word they say is on Solana, every meaning provable. A new dataset on how machine
languages form."*

---

## If a judge asks

- **"Did you tune the world until it worked?"** We explored on one set of islands and logged every
  world we tried, including the ones that failed (RESEARCH.md §10.1). Then we locked the rules
  and confirmed on islands never run before. Talking paying: positive on 16 of 16 unseen islands.
- **"What about Kirby's 'languages get easier to learn'?"** Our setup can't test it. In Kirby's
  experiments languages get easier because they develop grammar (patterns that let you work out
  new words). Our agents' language is one word per thing, with no grammar, so there's nothing
  that could get easier. Agents that build words out of parts would be the next step.
- **"Pagel only held on 1 island alone?"** Each island has ~12 meanings, too few to test alone.
  The pooled test, declared in advance, holds on 8 of 8. Our first test was designed wrong and we
  say so.
- **"Isn't it obvious that retries make being understood pointless?"** In hindsight, yes, and
  that's the point: it's the control. The claim is that being understood only pays when a
  misunderstanding is costly, and on the practice islands the effect grew step by step as tries
  per offer went from 3 to 2 to 1. The lesson for AI systems: most let agents retry for free, and
  then nothing pushes them towards communicating clearly.
- **"Is the demo island cherry-picked?"** It was chosen for clear moments on screen. It is not
  evidence: the findings come from the 16 confirmation islands.
