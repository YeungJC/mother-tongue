// The Compute Gateway: an OpenAI-compatible LLM endpoint that agents pay per
// call in devnet USDC over x402. Thinking is the scarce resource.
//   npx tsx server/gateway.ts
//
// - POST /v1/chat/quick        $0.001  small model
// - POST /v1/chat/deliberate   $0.01   bigger model
// - GET  /logs/:hash           the exact request+response behind a memo hash
// - GET  /health
//
// The facilitator runs in-process (no third party): it verifies each signed USDC
// transfer, co-signs as fee payer and submits it to Solana.

import express from 'express';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { paymentMiddleware, x402ResourceServer } from '@x402/express';
import { x402Facilitator } from '@x402/core/facilitator';
import { registerExactSvmScheme as registerFacilitator } from '@x402/svm/exact/facilitator';
import { ExactSvmScheme as ExactSvmServer } from '@x402/svm/exact/server';
import { toFacilitatorSvmSigner } from '@x402/svm';
import { CLUSTER, RPC_URL, loadKeypair } from '../src/rpc.ts';
import { agentKey } from './keys.ts';
import { DEVNET, SPEAK_PRICE_MICRO_USDC, TIERS, USDC_DEVNET } from './compute.ts';
import { BudgetExceeded, type Chain, chat } from './llm.ts';
import { ambienceFor, audioFor, registerLine } from './voice.ts';
import { interviewSession } from './interview.ts';

const PORT = Number(process.env.GATEWAY_PORT ?? 8402);
const LOG_DIR = new URL(`../data/${CLUSTER}/gateway/`, import.meta.url).pathname;
mkdirSync(LOG_DIR, { recursive: true });


// Fee payer for settlements (agents need no SOL to pay) and the treasury that earns.
const feePayer = await loadKeypair();
const treasury = await agentKey('gateway-treasury');

const facilitator = new x402Facilitator();
registerFacilitator(facilitator, {
  signer: toFacilitatorSvmSigner(feePayer, { defaultRpcUrl: RPC_URL }),
  networks: DEVNET,
});
// Say why a payment was refused (otherwise a bare 402 reaches the agent).
facilitator.onVerifyFailure(async (ctx: unknown) => { console.log('verify failed:', JSON.stringify(ctx, (_k, v) => (typeof v === 'bigint' ? String(v) : v)).slice(0, 400)); });
facilitator.onSettleFailure(async (ctx: unknown) => { console.log('settle failed:', JSON.stringify(ctx, (_k, v) => (typeof v === 'bigint' ? String(v) : v)).slice(0, 400)); });
const localFacilitator = {
  verify: facilitator.verify.bind(facilitator),
  settle: facilitator.settle.bind(facilitator),
  getSupported: async () => facilitator.getSupported(),
};
const resourceServer = new x402ResourceServer(localFacilitator as never).register(DEVNET, new ExactSvmServer({ rpcUrl: RPC_URL }));

const accept = (micro: number) => [{ scheme: 'exact', price: { asset: USDC_DEVNET, amount: String(micro) }, network: DEVNET, payTo: treasury.address, maxTimeoutSeconds: 120 }];
const routes = {
  ...Object.fromEntries(
    Object.entries(TIERS).map(([tier, t]) => [`POST /v1/chat/${tier}`, { accepts: accept(t.priceMicroUsdc), description: `${tier} thinking (${t.model})` }]),
  ),
  'POST /v1/speak': { accepts: accept(SPEAK_PRICE_MICRO_USDC), description: 'say a line aloud (ElevenLabs voice)' },
};

const app = express();
app.use(express.json({ limit: '256kb' }));
app.get('/health', (_req, res) => res.json({ ok: true, treasury: treasury.address, tiers: TIERS }));
app.get('/logs/:hash', (req, res) => {
  const f = `${LOG_DIR}${req.params.hash.replace(/[^a-f0-9]/g, '')}.json`;
  if (!existsSync(f)) return res.status(404).json({ error: 'not found' });
  res.type('json').send(readFileSync(f));
});
// Free: the audio of any registered line, synthesised by ElevenLabs on first listen.
app.get('/audio/:file', async (req, res) => {
  res.setHeader('access-control-allow-origin', '*');
  try {
    const buf = await audioFor(req.params.file.replace(/\.mp3$/, ''));
    if (!buf) return res.status(404).json({ error: 'unknown line' });
    res.type('audio/mpeg').setHeader('cache-control', 'public, max-age=31536000, immutable');
    res.send(buf);
  } catch (e) {
    res.status(502).json({ error: String((e as Error).message ?? e) });
  }
});
// Free: looping town ambience (ElevenLabs sound effects), generated once.
app.get('/sfx/:name', async (req, res) => {
  res.setHeader('access-control-allow-origin', '*');
  try {
    const buf = await ambienceFor(req.params.name.replace(/\.mp3$/, ''));
    if (!buf) return res.status(404).json({ error: 'unknown ambience' });
    res.type('audio/mpeg').setHeader('cache-control', 'public, max-age=86400');
    res.send(buf);
  } catch (e) {
    res.status(502).json({ error: String((e as Error).message ?? e) });
  }
});
// Starts a live voice interview with one villager (ElevenLabs Conversational AI).
app.get('/interview/:agent', async (req, res) => {
  res.setHeader('access-control-allow-origin', '*');
  try {
    // ?indexer= lets the viewer of a recorded island point at its own (local) indexer; only
    // localhost is accepted, so the gateway can't be made to fetch arbitrary URLs.
    const ix = typeof req.query.indexer === 'string' && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(req.query.indexer) ? req.query.indexer : undefined;
    res.json(await interviewSession(req.params.agent, ix));
  } catch (e) {
    res.status(502).json({ error: String((e as Error).message ?? e) });
  }
});
app.use(paymentMiddleware(routes as never, resourceServer, undefined, undefined, true));
app.post('/v1/speak', (req, res) => {
  const { voice, text } = req.body ?? {};
  if (typeof voice !== 'string' || !/^[A-Za-z0-9]{10,40}$/.test(voice) || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'voice and text required' });
  }
  const line = registerLine(voice, text, req.header('x-agent') ?? 'unknown', 'say');
  res.json({ hash: line.hash, audio: `/audio/${line.hash}.mp3` });
});

for (const [tier, t] of Object.entries(TIERS)) {
  app.post(`/v1/chat/${tier}`, async (req, res) => {
    const started = Date.now();
    try {
      // Free models with fallback (server/llm.ts). On failure we answer 5xx, so the
      // x402 middleware does not settle: an agent never pays for a thought it didn't get.
      let out;
      try {
        out = await chat(tier as Chain, req.body?.messages ?? [], { json: !!req.body?.response_format, maxTokens: Math.min(Number(req.body?.max_tokens ?? t.maxTokens), t.maxTokens) });
      } catch (e) {
        return res.status(e instanceof BudgetExceeded ? 429 : 503).json({ error: String((e as Error).message ?? e) });
      }
      const body = { ...(out.raw as object), model: out.model };
      const record = {
        tier,
        model: out.model,
        priceMicroUsdc: t.priceMicroUsdc,
        payer: req.header('x-agent') ?? null,
        at: new Date().toISOString(),
        ms: Date.now() - started,
        request: req.body,
        response: body,
      };
      const text = JSON.stringify(record);
      const hash = createHash('sha256').update(text).digest('hex');
      writeFileSync(`${LOG_DIR}${hash}.json`, text);
      res.setHeader('x-log-hash', hash);
      res.json(body);
    } catch (e) {
      res.status(500).json({ error: String((e as Error).message ?? e) });
    }
  });
}

app.listen(PORT, () => console.log(`gateway on :${PORT}  treasury ${treasury.address}  fee payer ${feePayer.address}`));
