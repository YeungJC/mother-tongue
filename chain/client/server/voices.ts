// Mother Tongue voices: invented words, spoken aloud by ElevenLabs (eleven_v3).
// - Voices run in families: a founder gets a premade voice and every descendant inherits it, so
//   you can hear the bloodlines. (Never the account owner's cloned voices.)
// - The tone is a real clue: chosen from the speaker's situation (hungry, rejected again, unsure
//   of its guess), it reaches the listener before the words make sense.
// Lines are registered here and only synthesised when someone listens (voice.ts).
import { NARRATOR_VOICE, registerLine } from './voice.ts';

/** ElevenLabs premade voices, one per founding family. */
export const FAMILY_VOICES = [
  'pNInz6obpgDQGcFmaJgB', // adam
  'EXAVITQu4vr4xnSDxMaL', // sarah
  'TX3LPaxmHKxFdv7VOQHJ', // liam
  'Xb7hH8MSUJpSbSDYk0k2', // alice
  'pqHfZKP75CvOlQylNhV4', // bill
  'FGY2WhTYpPnrIDTdsKH5', // laura
  'JBFqnCBsd6RMkjVDRZzb', // george
  'cgSgspJ2msm6clMCkdW9', // jessica
  'bIHbv24MWmeRgasZH58o', // will
  'pFZP5JQG7iQjIQuC4Bku', // lily
  'nPczCjzI2devNBz1zQrb', // brian
  'IKne3meq5aSn9XLyUdCD', // charlie
];
export { NARRATOR_VOICE };

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
/** A family's voice: fixed by the founder's name, so it is the same in every process. */
export const familyVoice = (family: string, founders?: string[]) => {
  const i = founders?.indexOf(family) ?? -1;
  return FAMILY_VOICES[(i >= 0 ? i : hash(family)) % FAMILY_VOICES.length];
};

/** Invented words as a spoken line: capitalised, punctuated by mood, with one audio tag. */
export function spoken(words: string, tone: string, end: '.' | '!' | '?' | '…' = '.') {
  if (!words) return '';
  const w = words.charAt(0).toUpperCase() + words.slice(1);
  return `[${tone}] ${w}${end}`;
}

export interface Voiced { hash: string; text: string }
export const voice = (family: string, text: string, by: string, founders?: string[]): Voiced | null => {
  if (!text) return null;
  const line = registerLine(familyVoice(family, founders), text, by, 'tongue');
  return { hash: line.hash, text: line.text };
};

/** The tone of each moment at a table, from what the speaker can feel. */
export const TONE = {
  show: (hungry: boolean, wantsFood: boolean) => (hungry && wantsFood ? ['pleading', '…'] : hungry ? ['urgent', '!'] : ['hopeful', '.']) as [string, '.' | '!' | '?' | '…'],
  bid: (sure: boolean) => (sure ? ['confident', '.'] : ['hesitant', '?']) as [string, '.' | '!' | '?' | '…'],
  reject: (round: number) => (round <= 1 ? ['firmly', '.'] : round === 2 ? ['frustrated', '!'] : ['exasperated', '!']) as [string, '.' | '!' | '?' | '…'],
  accept: (understood: boolean) => (understood ? ['pleased', '!'] : ['reluctantly', '.']) as [string, '.' | '!' | '?' | '…'],
};
