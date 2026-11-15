// Text-mode smoke test of a villager interview over the ElevenLabs Agents websocket.
//   npx tsx scripts/test-interview.ts <agentAddress> "question"
export {};
const [agent, question = 'Why did you buy food instead of building on the bridge?'] = process.argv.slice(2);
const s = await fetch(`http://localhost:8402/interview/${agent}`).then((r) => r.json());
if (s.error) throw new Error(s.error);

const ws = new WebSocket(s.signedUrl);
const done = new Promise<void>((resolve) => {
  let asked = false;
  const timer = setTimeout(() => { console.log('(timeout)'); ws.close(); resolve(); }, 45_000);
  ws.onopen = () => {
    ws.send(JSON.stringify({
      type: 'conversation_initiation_client_data',
      conversation_config_override: {
        agent: { prompt: { prompt: s.overrides.agent.prompt.prompt }, first_message: s.overrides.agent.firstMessage },
        tts: { voice_id: s.overrides.tts.voiceId },
      },
    }));
  };
  ws.onmessage = (m) => {
    const ev = JSON.parse(String(m.data));
    if (ev.type === 'ping') ws.send(JSON.stringify({ type: 'pong', event_id: ev.ping_event?.event_id }));
    if (ev.type === 'conversation_initiation_metadata') console.log('session started:', ev.conversation_initiation_metadata_event?.conversation_id);
    if (ev.type === 'agent_response') {
      console.log(`${s.name}:`, ev.agent_response_event?.agent_response);
      if (!asked) {
        asked = true;
        console.log('You:', question);
        ws.send(JSON.stringify({ type: 'user_message', text: question }));
      } else {
        clearTimeout(timer);
        ws.close();
        resolve();
      }
    }
  };
  ws.onerror = (e) => { console.error('ws error', (e as ErrorEvent).message ?? e); clearTimeout(timer); resolve(); };
});
await done;
