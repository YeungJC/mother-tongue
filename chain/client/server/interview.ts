// A live voice interview with one islander (ElevenLabs Conversational AI). Among themselves they
// share no English; for the interview a visitor asks, in English, why it did what it did and what
// it thinks its words mean. It answers ONLY from its real record: what it saw and did at every
// table, its logged thoughts (thinkers), its private dictionary (wrong beliefs included). It never
// sees what others really meant (the sealed meanings): the viewer's receipts panel shows those, so
// a visitor can check its explanations against the truth.
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { CLUSTER } from '../src/rpc.ts';
import { familyVoice } from './voices.ts';

const INDEXER = process.env.INDEXER_URL ?? (CLUSTER === 'local' ? 'http://localhost:8411' : 'http://localhost:8410');
const AGENT_FILE = new URL('../data/interview-agent.json', import.meta.url).pathname;
const elKey = () => readFileSync(`${homedir()}/.elevenlabs_env`, 'utf8').match(/ELEVENLABS_API_KEY=["']?([^"'\s]+)/)![1];
const TOWNS = ['Wrenford', 'Oakhollow', 'Ironcrag', 'Saltmere'];
const JOBS = ['farmer', 'woodcutter', 'miner', 'smith', 'carpenter'];

export async function interviewSession(key: string, indexer = INDEXER) {
  if (!existsSync(AGENT_FILE)) throw new Error('run scripts/create-interview-agent.ts first');
  const { agent_id } = JSON.parse(readFileSync(AGENT_FILE, 'utf8'));
  const people: { key: string; name: string; family: string; generation: number; home: number; job: number; parent: string | null; place: number | null; survived: boolean | null; children: number; brain?: string }[] =
    await fetch(`${indexer}/people`).then((r) => r.json());
  const me = people.find((p) => p.key === key);
  if (!me) throw new Error('unknown islander');
  const mind: { words: { word: string; means: { meaning: string; s: number }[]; heardIn: string[] }[]; remembered: number } | null = await fetch(`${indexer}/mind/${encodeURIComponent(key)}`).then((r) => r.json()).catch(() => null);
  const parent = me.parent ? people.find((p) => p.key === me.parent) : null;
  const founders = people.filter((p) => p.generation === 1).map((p) => p.name);
  const belief = (w: { word: string; means: { meaning: string; s: number }[]; heardIn: string[] }) => {
    const [a, b] = w.means;
    const sure = a.s >= 0.7 ? 'sure' : a.s >= 0.4 ? 'fairly sure' : 'unsure';
    return `- "${w.word}": ${a.meaning} (${sure}${b && b.s > 0.2 ? `; maybe ${b.meaning}` : ''}; heard in ${w.heardIn.join(', ') || 'nowhere yet'})`;
  };
  const words = (mind?.words ?? []).slice(0, 24).map(belief);
  type Entry = { day: number; town: string; role: 'offered' | 'bid'; shows: string; said: string; maker?: string; outcome: string; got?: string | null; from?: string | null; guessed?: { good: string; qty: number } | null; offered?: string; falseBlame?: boolean };
  const rec: { entries: Entry[]; thoughts: { day: number; kind: string; thought: string }[] } | null = await fetch(`${indexer}/record/${encodeURIComponent(key)}`).then((r) => r.json()).catch(() => null);
  // What it SAW and DID, never what others meant: it never knew that.
  const seen = (e: Entry) => e.role === 'offered'
    ? `day ${e.day}, ${e.town}: you put ${e.shows} on the table and said "${e.said}"; ${e.got ? `${e.from} gave you ${e.got}` : 'nobody gave you what you wanted (no deal)'}`
    : `day ${e.day}, ${e.town}: ${e.maker} showed ${e.shows} and said "${e.said}"; you took it to mean ${e.guessed ? `${e.guessed.qty} ${e.guessed.good}` : 'nothing you knew'}, offered ${e.offered}, and ${e.outcome === 'taken' ? 'the trade was made' : e.outcome === 'outbid' ? 'they took someone else\'s offer' : 'they said no, so you trusted those words a little less'}`;
  const entries = rec?.entries ?? [];
  const picked = [...entries.filter((e) => e.falseBlame), ...entries.filter((e) => !e.falseBlame).slice(-20)].sort((a, b) => a.day - b.day).slice(-28);
  const thinker = me.brain === 'thinker';
  const thoughts = (rec?.thoughts ?? []).slice(-10).map((t) => `- day ${t.day}: "${t.thought}"`);
  const prompt = [
    `You are ${me.name}, a ${JOBS[me.job]} of ${TOWNS[me.home]} on a small island, generation ${me.generation} of ${me.family}'s line${parent ? `, child of ${parent.name}` : ', one of the first, born speaking nothing'}.`,
    'Your people have no shared language from anywhere else: they invented their words from scratch to trade (food, wood, ore, tools, planks, numbers, yes and no), and children learn them from what they overheard. A visitor from outside is interviewing you aloud, in English.',
    'Speak in first person, warmly and simply, 1 to 3 short sentences per answer: this is spoken. Sprinkle in your own words where natural, and say what you think they mean.',
    'Your beliefs about words are below, with how sure you are. Answer from them ONLY: if you are unsure, say so; if you have no word for something, say your people have none yet. Some of your beliefs may be wrong; you cannot know which. Never invent words that are not on your list.',
    `Your words:\n${words.join('\n') || '- (you have barely any words yet)'}`,
    `What you saw and did at the trading table (your whole record; nothing else happened to you that you know of):\n${picked.map((e) => `- ${seen(e)}`).join('\n') || '- (nothing yet)'}`,
    thinker
      ? `You think things through. Your own thoughts, as you had them:\n${thoughts.join('\n') || '- (none recorded)'}\nWhen asked why you did something, answer from these thoughts and your record. If nothing in them explains it, say you don't remember a reason.`
      : 'You do not plan or reason in words: you act by habit. You put on the table what you have most to spare, ask for what you lack most, offer what you think the other means if you can spare it, and when an offer is turned down you trust the words you heard a little less. When asked why you did something, explain it this way, simply, from your record. Never make up other reasons, feelings, plans or events.',
    'You never learn what others really meant: you only saw what was shown, said and handed over. If asked whether you understood someone, say what you guessed and how it went, and that you cannot be sure.',
    me.place !== null ? `Your life is over: you placed ${me.place + 1} of 12${me.survived === false ? ' (you starved)' : ''} and had ${me.children} children.` : 'Your life is going on now.',
  ].join('\n\n');
  const yes = mind?.words.find((w) => w.means[0]?.meaning === 'yes')?.word;
  const signed = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agent_id}`, { headers: { 'xi-api-key': elKey() } });
  if (!signed.ok) throw new Error(`signed url ${signed.status}: ${(await signed.text()).slice(0, 200)}`);
  const { signed_url } = (await signed.json()) as { signed_url: string };
  return {
    name: me.name,
    signedUrl: signed_url,
    overrides: {
      agent: { prompt: { prompt }, firstMessage: `${yes ? `${yes.charAt(0).toUpperCase() + yes.slice(1)}! ` : ''}I mean, hello. I'm ${me.name}. Ask me what our words mean.` },
      tts: { voiceId: familyVoice(me.family, founders) },
    },
    diaryDays: [],
  };
}
