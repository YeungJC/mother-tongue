// Voice lines: registered (and paid for) when spoken, synthesised by ElevenLabs
// only when someone actually listens, then cached forever by hash.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { CLUSTER } from '../src/rpc.ts';

const DIR = new URL(`../data/${CLUSTER}/voice/`, import.meta.url).pathname;
mkdirSync(DIR, { recursive: true });
/** Voice folders of archived runs (each data/<run>/voice), so recorded islands keep their voices after a
 *  cluster's data folder is reset. Lines are found by hash; new lines are only written to DIR. */
const DATA = new URL('../data/', import.meta.url).pathname;
const ARCHIVES = readdirSync(DATA, { withFileTypes: true })
  .filter((d) => d.isDirectory() && `${DATA}${d.name}/voice/` !== DIR && existsSync(`${DATA}${d.name}/voice/`))
  .map((d) => `${DATA}${d.name}/voice/`);
/** The folder holding a line's JSON: the live one first, then the archives. */
const dirOf = (hash: string) => [DIR, ...ARCHIVES].find((d) => existsSync(`${d}${hash}.json`)) ?? null;

/** Cheapest, fastest ElevenLabs model: good enough for market chatter. */
export const TTS_MODEL = 'eleven_flash_v2_5';
/** The expressive model: understands audio tags like [laughs], [angry], [whispers]. Used for
 *  negotiations and the commentator, where emotion is the point. */
export const EXPRESSIVE_MODEL = 'eleven_v3';
/** Market shouts are short; radio bulletins and interview answers can run longer. */
export const MAX_LINE: Record<Line['kind'], number> = { say: 220, radio: 900, interview: 900, talk: 300, commentary: 1200, tongue: 120 };

export interface Line { hash: string; voice: string; text: string; by: string; kind: 'say' | 'radio' | 'interview' | 'talk' | 'commentary' | 'tongue'; at: string; model?: string }
/** Audio tags are for the voice; viewers read the line without them. */
export const stripTags = (t: string) => t.replace(/\[[a-z' -]{2,24}\]\s*/gi, '').replace(/\s+/g, ' ').trim();

export const lineHash = (voice: string, text: string) => createHash('sha256').update(`${voice}|${text}`).digest('hex');

export function registerLine(voice: string, text: string, by: string, kind: Line['kind']): Line {
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, MAX_LINE[kind]);
  const model = kind === 'talk' || kind === 'commentary' || kind === 'tongue' ? EXPRESSIVE_MODEL : TTS_MODEL;
  const line: Line = { hash: lineHash(voice, `${model}|${clean}`), voice, text: clean, by, kind, at: new Date().toISOString(), model };
  const f = `${DIR}${line.hash}.json`;
  if (!existsSync(f)) writeFileSync(f, JSON.stringify(line));
  return line;
}

export function getLine(hash: string): Line | null {
  const h = hash.replace(/[^a-f0-9]/g, '');
  const d = dirOf(h);
  return d ? JSON.parse(readFileSync(`${d}${h}.json`, 'utf8')) : null;
}

function elevenKey(): string {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
  const m = readFileSync(`${homedir()}/.elevenlabs_env`, 'utf8').match(/ELEVENLABS_API_KEY=["']?([^"'\s]+)/);
  if (!m) throw new Error('no ElevenLabs key');
  return m[1];
}

const inflight = new Map<string, Promise<Buffer>>();

/** Returns MP3 bytes for a registered line, synthesising on first request. */
export async function audioFor(hash: string): Promise<Buffer | null> {
  const line = getLine(hash);
  if (!line) return null;
  const mp3 = `${dirOf(line.hash) ?? DIR}${line.hash}.mp3`;
  if (existsSync(mp3)) return readFileSync(mp3);
  if (!inflight.has(line.hash)) {
    inflight.set(
      line.hash,
      (async () => {
        const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${line.voice}?output_format=mp3_44100_64`, {
          method: 'POST',
          headers: { 'xi-api-key': elevenKey(), 'content-type': 'application/json', accept: 'audio/mpeg' },
          body: JSON.stringify(line.model === EXPRESSIVE_MODEL
            ? { text: line.text, model_id: EXPRESSIVE_MODEL, voice_settings: { stability: 0.5 } } // v3: "creative" stability lets tags show
            : { text: stripTags(line.text), model_id: TTS_MODEL, voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.35 } }),
        });
        if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
        const buf = Buffer.from(await res.arrayBuffer());
        writeFileSync(mp3, buf);
        return buf;
      })().finally(() => inflight.delete(line.hash)),
    );
  }
  return inflight.get(line.hash)!;
}

// ---------- ambience: ElevenLabs sound effects, generated once and looped by the viewer ----------
export const AMBIENCE: Record<string, string> = {
  island: 'gentle sea waves on a rocky island shore, wind, distant gulls, faint village bell, calm loopable ambience',
  wrenford: 'busy medieval market town, crowd murmur, chickens, cart wheels on cobbles, distant blacksmith hammer, loopable ambience',
  oakhollow: 'deep forest with birdsong, axes chopping wood in the distance, creaking trees, crackling campfire, loopable ambience',
  ironcrag: 'mountain mining town, pickaxes on rock, ore carts rolling on rails, forge bellows, wind, loopable ambience',
  saltmere: 'small fishing harbour, waves against a wooden pier, creaking boats, seagulls, ropes, loopable ambience',
};
const SFX_DIR = new URL('../data/sfx/', import.meta.url).pathname;
mkdirSync(SFX_DIR, { recursive: true });
const sfxInflight = new Map<string, Promise<Buffer>>();
export async function ambienceFor(name: string): Promise<Buffer | null> {
  const prompt = AMBIENCE[name];
  if (!prompt) return null;
  const f = `${SFX_DIR}${name}.mp3`;
  if (existsSync(f)) return readFileSync(f);
  if (!sfxInflight.has(name)) {
    sfxInflight.set(name, (async () => {
      const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
        method: 'POST',
        headers: { 'xi-api-key': elevenKey(), 'content-type': 'application/json' },
        body: JSON.stringify({ text: prompt, duration_seconds: 22, prompt_influence: 0.4 }),
      });
      if (!res.ok) throw new Error(`ElevenLabs sfx ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(f, buf);
      return buf;
    })().finally(() => sfxInflight.delete(name)));
  }
  return sfxInflight.get(name)!;
}

/** The commentator and analyst (ElevenLabs premade "Daniel", a steady broadcaster). */
export const NARRATOR_VOICE = 'onwK4e9ZLuTAKqWW03F9';
