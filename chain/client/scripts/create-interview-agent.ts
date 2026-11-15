// Creates (once) the ElevenLabs Conversational AI agent used for villager interviews.
// Each interview overrides its prompt, greeting and voice with one villager's real state.
//   npx tsx scripts/create-interview-agent.ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';

const OUT = new URL('../data/interview-agent.json', import.meta.url).pathname;
if (existsSync(OUT)) {
  console.log('already created:', readFileSync(OUT, 'utf8'));
  process.exit(0);
}
const key = readFileSync(`${homedir()}/.elevenlabs_env`, 'utf8').match(/ELEVENLABS_API_KEY=["']?([^"'\s]+)/)![1];
const body = {
  name: 'The Invisible Hand — villager interview',
  conversation_config: {
    agent: {
      first_message: 'Aye? Who goes there?',
      language: 'en',
      prompt: { prompt: 'You are a villager in a small medieval economy. (Replaced per interview.)', llm: process.env.EL_LLM ?? 'gemini-2.5-flash', temperature: 0.8 },
    },
    tts: { voice_id: 'JBFqnCBsd6RMkjVDRZzb', model_id: 'eleven_flash_v2' },
    conversation: { max_duration_seconds: 240 },
  },
  platform_settings: {
    overrides: {
      conversation_config_override: {
        agent: { prompt: { prompt: true }, first_message: true },
        tts: { voice_id: true },
      },
    },
  },
};
const res = await fetch('https://api.elevenlabs.io/v1/convai/agents/create', {
  method: 'POST',
  headers: { 'xi-api-key': key, 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
const text = await res.text();
if (!res.ok) {
  console.error(res.status, text.slice(0, 800));
  process.exit(1);
}
writeFileSync(OUT, text);
console.log('created', text);
