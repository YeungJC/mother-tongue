// Records the demo video's shots (DEMO.md) as silent 1920×1080 MP4 clips, one per shot, by
// driving a visible Chrome window over the DevTools protocol and encoding its screencast with
// ffmpeg (headless Chrome only captures ~1 frame/s of the 3D island; a window gets ~18-24).
// Needs: ./start.sh --recorded running (viewer :5173, indexer :8412, gateway :8402), ffmpeg.
//   node scripts/record-demo.mjs            every shot
//   node scripts/record-demo.mjs 2 7        just shots 2 and 7
// The interview shot types the question into the live ElevenLabs conversation (the microphone is a
// silent fake); the agent answers live, its words appear as text (no audio is recorded).
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, linkSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, 'demo-video');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:5173/?indexer=http://localhost:8412';
const EXPLORER = 'https://explorer.solana.com/tx/3988nr5d6Y5ALosP4oLNdbxiNmDQU8gqucWMK9zNwdEepWRRbNBgUP2iH9jZbyPXEm8exfZCirWdBm9CxJxGb6JS?cluster=devnet';
const W = 1920, H = 1080, FPS = 30;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------- Chrome + CDP
const profile = join(OUT, '.chrome-profile');
rmSync(profile, { recursive: true, force: true });
const chrome = spawn(CHROME, [
  ...(process.env.HEADLESS ? ['--headless=new'] : []), '--no-first-run', '--no-default-browser-check', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--remote-debugging-port=9340', `--window-size=${W},${H}`, `--user-data-dir=${profile}`,
  process.env.SOFTWARE_GL ? '--use-angle=swiftshader' : '--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required',
  '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${join(OUT, 'silence.wav')}`,
  'about:blank',
], { stdio: 'ignore' });
let tabs;
for (let i = 0; i < 120; i++) { try { tabs = await (await fetch('http://127.0.0.1:9340/json')).json(); if (tabs.some((t) => t.type === 'page')) break; if (i > 8) await fetch('http://127.0.0.1:9340/json/new?about:blank', { method: 'PUT' }); } catch {} await sleep(250); }
const ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let nextId = 0;
const pending = new Map();
let onFrame = null;
let onSound = null;
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.method === 'Runtime.bindingCalled' && d.params.name === '__snd') onSound?.(JSON.parse(d.params.payload));
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result ?? d.error); pending.delete(d.id); }
  if (d.method === 'Page.screencastFrame') {
    send('Page.screencastFrameAck', { sessionId: d.params.sessionId });
    onFrame?.(d.params);
  }
};
const send = (method, params = {}) => new Promise((r) => { const i = ++nextId; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }))?.result?.value;
await send('Page.enable');
await send('Runtime.enable');
// Sound: every <audio> the page plays (voice lines) is reported here with its timing, so the
// soundtrack can be rebuilt from the same files afterwards (the screencast carries no audio).
await send('Runtime.addBinding', { name: '__snd' });
await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
  const P = HTMLMediaElement.prototype, play = P.play; let n = 0;
  const say = (o) => { try { window.__snd(JSON.stringify(o)); } catch {} };
  P.play = function () {
    if (!this.__sid) {
      const id = this.__sid = String(++n) + Math.random().toString(36).slice(2, 7); let vol = this.volume, started = false;
      this.addEventListener('volumechange', () => { vol = Math.max(vol, this.volume); });
      this.addEventListener('playing', () => { if (started) return; started = true; say({ ev: 'start', id, url: this.currentSrc || this.src, t: Date.now() / 1000, at: this.currentTime, loop: this.loop }); });
      const stop = () => say({ ev: 'stop', id, t: Date.now() / 1000, at: this.currentTime, vol });
      this.addEventListener('pause', stop); this.addEventListener('ended', stop);
    }
    return play.call(this);
  };
})()` });
// 125% zoom: the page lays out at 1536×864 CSS px and renders at 1920×1080 real px (readable text).
await send('Emulation.setDeviceMetricsOverride', { width: Math.round(W / 1.25), height: Math.round(H / 1.25), deviceScaleFactor: 1.25, mobile: false });
await send('Browser.grantPermissions', { permissions: ['audioCapture'], origin: 'http://localhost:5173' }).catch(() => {});

const go = async (url, wait = 8000) => { await send('Page.navigate', { url }); await sleep(wait); };
/** Click the first button (or element) whose text starts with `text`. */
const click = (text, sel = 'button') => js(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => x.textContent.trim().startsWith(${JSON.stringify(text)})); if (!b) return false; b.click(); return true; })()`);
/** Smoothly scroll whichever ancestor of `target` actually scrolls, so `target` sits `offset` px from its top. */
const scrollTo = (target, ms = 1800, _container = null, offset = 90) => js(`new Promise((done) => {
  const el = ${target}; if (!el) return done(false);
  let sc = el.parentElement;
  while (sc && !(sc.scrollHeight > sc.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
  sc = sc ?? document.scrollingElement;
  const top = sc === document.scrollingElement ? 0 : sc.getBoundingClientRect().top;
  const from = sc.scrollTop, to = Math.max(0, from + el.getBoundingClientRect().top - top - ${offset});
  const t0 = performance.now();
  const step = (t) => { const k = Math.min(1, (t - t0) / ${ms}); const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2; sc.scrollTop = from + (to - from) * e; k < 1 ? requestAnimationFrame(step) : done(true); };
  requestAnimationFrame(step);
})`);
/** The page's main scroll container (the report pages scroll inside .page). */
const pageBox = '.page';
/** The innermost element whose own text contains `text` (so scrolling targets the row, not the page). */
const leafText = (text) => `[...document.querySelectorAll('body *')].filter((x) => x.textContent.includes(${JSON.stringify(text)}) && ![...x.children].some((c) => c.textContent.includes(${JSON.stringify(text)}))).pop()`;
const byText = (sel, text) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => x.textContent.includes(${JSON.stringify(text)}))`;

// ---------------------------------------------------------------- recording
async function record(name, act) {
  const dir = join(OUT, `.frames-${name}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const frames = [];
  const sounds = [];
  onSound = (s) => sounds.push(s);
  onFrame = (p) => { const f = join(dir, `${String(frames.length).padStart(6, '0')}.jpg`); writeFileSync(f, Buffer.from(p.data, 'base64')); frames.push({ f, t: Date.now() / 1000 }); }; // arrival time: the screencast's own timestamps jump across page loads
  await send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  const t0 = Date.now() / 1000;
  await act();
  await sleep(300);
  await send('Page.stopScreencast');
  onFrame = null;
  const end = Date.now() / 1000;
  if (!frames.length) { console.log(`  ${name}: no frames!`); return; }
  // Constant frame rate, built by hand: output frame k (at k/FPS s) is the latest captured frame
  // at that moment. (The screencast only sends changes, at an irregular ~18-24 fps.)
  const seq = join(dir, 'cfr');
  mkdirSync(seq, { recursive: true });
  const start = frames[0].t, n = Math.max(1, Math.round((end - start) * FPS));
  for (let k = 0, j = 0; k < n; k++) {
    const at = start + k / FPS;
    while (j + 1 < frames.length && frames[j + 1].t <= at) j++;
    linkSync(frames[j].f, join(seq, `${String(k).padStart(6, '0')}.jpg`));
  }
  const kept = frames;
  const mp4 = join(OUT, `${name}.mp4`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(seq, '%06d.jpg'), '-vf', `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`, '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-r', String(FPS), mp4]);
  onSound = null;
  await addSound(mp4, sounds, start, n / FPS, name);
  if (process.env.KEEP) console.log(`    kept ${kept.length} frames, durations sum ${(end - kept[0].t).toFixed(2)}s, first frame ${(kept[0].t - t0).toFixed(2)}s after start`); else rmSync(dir, { recursive: true, force: true });
  console.log(`  ${name}.mp4  ${(end - t0).toFixed(1)}s, ${frames.length} frames`);
}

/** Rebuilds the clip's soundtrack from the logged voice lines (same files, same timings) and
 *  muxes it in. Clips with no sound get a silent track, so every clip has audio for editing. */
// A quiet ElevenLabs town ambience under the island shots (cached by the gateway in data/sfx).
const BED_FILE = join(ROOT, 'chain/client/data/sfx/island.mp3'), BED_VOL = 0.8;
const BED_SHOTS = new Set(['01-cold-open', '02-exchange', '04-generations']);
async function addSound(mp4, sounds, t0, dur, name) {
  const cache = join(OUT, '.audio');
  mkdirSync(cache, { recursive: true });
  const segs = [];
  if (BED_SHOTS.has(name) && existsSync(BED_FILE)) segs.push({ file: BED_FILE, offset: 0, from: 0, len: dur, vol: BED_VOL, loop: true });
  for (const s of sounds.filter((x) => x.ev === 'start')) {
    const stop = sounds.find((x) => x.ev === 'stop' && x.id === s.id && x.t >= s.t);
    let offset = s.t - t0, from = s.at;
    if (offset < 0) { from -= offset; offset = 0; }
    if (offset >= dur) continue;
    const len = stop ? Math.max(0, stop.at - s.at - (from - s.at)) : dur - offset;
    if (len <= 0.05) continue;
    const file = join(cache, s.url.replace(/[^a-z0-9.]+/gi, '_').slice(-120));
    if (!existsSync(file)) { const r = await fetch(s.url); if (!r.ok) { console.log(`    sound ${s.url}: ${r.status}`); continue; } writeFileSync(file, Buffer.from(await r.arrayBuffer())); }
    segs.push({ file, offset, from, len, vol: stop?.vol ?? 1, loop: s.loop });
  }
  const tmp = mp4.replace(/\.mp4$/, '.tmp.mp4');
  const args = ['-y', '-loglevel', 'error', '-i', mp4];
  let filter;
  if (!segs.length) { args.push('-f', 'lavfi', '-t', String(dur), '-i', 'anullsrc=r=44100:cl=stereo'); filter = '[1:a]anull[aout]'; }
  else {
    for (const g of segs) args.push(...(g.loop ? ['-stream_loop', '-1'] : []), '-i', g.file);
    const parts = segs.map((g, i) => `[${i + 1}:a]aresample=44100,atrim=start=${g.from.toFixed(3)}:duration=${g.len.toFixed(3)},asetpts=PTS-STARTPTS,volume=${g.vol.toFixed(2)},adelay=${Math.round(g.offset * 1000)}:all=1[a${i}]`);
    filter = `${parts.join(';')};${segs.map((_, i) => `[a${i}]`).join('')}amix=inputs=${segs.length}:normalize=0:dropout_transition=0,apad[aout]`;
  }
  args.push('-filter_complex', filter, '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', dur.toFixed(3), tmp);
  execFileSync('ffmpeg', args);
  renameSync(tmp, mp4);
  console.log(`    sound: ${segs.filter((g) => !g.loop).length} voice lines${segs.some((g) => g.loop) ? ' + ambience' : ''}`);
}

const SHOTS = {
  // 0:00 Cold open: the island trading, nothing else on screen.
  1: ['01-cold-open', async () => {
    await go(`${BASE}&page=watch&speed=1&clean&voices`, 0);
    await sleep(16000);
  }],
  // 0:10 One exchange card, late in the island's life (the words mean something by then).
  // Presenter mode, first stage: only the island and the exchange card on screen.
  2: ['02-exchange', async () => {
    await go(`${BASE}&page=watch&speed=1&present&voices`, 7000);
    await js(`(() => { const st = document.createElement('style'); st.textContent = '.present-chip { display: none !important; }'; document.head.appendChild(st); })()`);
    await js(`(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.title || '').startsWith('Generation 10:')); b?.click(); return !!b })()`);
    await sleep(9000);
    // Pause on an exchange that was understood (green card), so the shot shows talking working.
    for (let i = 0; i < 600; i++) { if (await js(`!!document.querySelector('.now-x.ok .lchip.yes')`)) break; await sleep(100); }
    await js(`document.querySelector('button[aria-label="Pause"]')?.click()`);
    console.log('    paused on:', await js(`document.querySelector('.now-x')?.innerText.replace(/\\s+/g, ' ')`));
    await sleep(7000);
  }],
  // 0:20 The same kind of offer on devnet, decoded by Solana Explorer.
  3: ['03-explorer', async () => {
    await go(EXPLORER, 9000);
    await js(`(() => { const b = [...document.querySelectorAll('button, a, div, span')].find((x) => /^accept$/i.test(x.textContent.trim())); b?.click(); return !!b })()`);
    await sleep(1500);
    // The first "buguzi kaku" on the page is the decoded instruction's Words argument; Explorer
    // renders sections as they come into view, so glide down until it exists.
    const words = `[...document.querySelectorAll('body *')].find((x) => x.children.length === 0 && x.textContent.trim() === 'buguzi kaku')`;
    for (let i = 0; i < 40; i++) {
      if (await js(`!!(${words})`)) break;
      await js(`new Promise((d) => { const sc = document.scrollingElement, from = sc.scrollTop, t0 = performance.now(); const f = (t) => { const k = Math.min(1, (t - t0) / 400); sc.scrollTop = from + 220 * k; k < 1 ? requestAnimationFrame(f) : d(); }; requestAnimationFrame(f); })`);
      await sleep(200);
    }
    console.log('    words row found:', await js(`!!(${words})`));
    await scrollTo(words, 2000, null, 430);
    await js(`(() => { const el = ${words}; if (el) { el.style.outline = '3px solid #14f195'; el.style.outlineOffset = '3px'; el.style.borderRadius = '4px'; } })()`);
    await sleep(7000);
  }],
  // 0:30 Generations roll: 16×.
  4: ['04-generations', async () => {
    await go(`${BASE}&page=watch&speed=16`, 7000);
    await sleep(1500);
    for (const g of [2, 5, 8, 11]) {
      await js(`(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.title || '').startsWith('Generation ${g}:')); b?.click(); return !!b })()`);
      await sleep(4500);
    }
  }],
  // 0:50 Finding 02: when does talking pay?
  5: ['05-finding-talk', async () => {
    await go(`${BASE}&page=findings`, 8000);
    await sleep(1500);
    await scrollTo(byText('section.r-section h2', 'help an agent have more children'), 2500, pageBox);
    await sleep(14000);
  }],
  // 1:20 Finding 03: Pagel.
  6: ['06-finding-pagel', async () => {
    await go(`${BASE}&page=findings`, 8000);
    await scrollTo(byText('section.r-section h2', 'help an agent have more children'), 10, pageBox);
    await sleep(2500);
    await scrollTo(byText('section.r-section h2', 'change like human ones'), 2200, pageBox);
    await sleep(10000);
  }],
  // 1:35 Ask Nyx·11 why, then the record.
  7: ['07-interview', async () => {
    await go(`${BASE}&page=agents`, 9000);
    await click('all ');
    await sleep(1200);
    await scrollTo(byText('button.name-link', 'Nyx·11'), 1500, pageBox, 300);
    await sleep(500);
    await click('Nyx·11', 'button.name-link');
    await sleep(3000);
    await click('🎙 Interview');
    await sleep(2500);
    console.log('    start button:', await click('🎙 Start talking'));
    // Wait for Nyx's greeting, then type the question into the live conversation.
    for (let i = 0; i < 120; i++) { if (await js(`!!document.querySelector('.interview-ask input')`)) break; await sleep(100); }
    await sleep(200);
    const Q = 'Why did Wren turn down your wood on day twelve?';
    for (let i = 1; i <= Q.length; i++) {
      await js(`(() => { const el = document.querySelector('.interview-ask input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, ${JSON.stringify(Q)}.slice(0, ${i})); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      await sleep(18);
    }
    await sleep(250);
    await click('Ask');
    // Wait for the answer (an agent line after the question).
    for (let i = 0; i < 120; i++) {
      const ok = await js(`(() => { const ps = [...document.querySelectorAll('.transcript p')]; const q = ps.findIndex((p) => p.classList.contains('user') && /wren/i.test(p.textContent)); return q >= 0 && ps.slice(q + 1).some((p) => p.classList.contains('agent') && p.textContent.length > 40); })()`);
      if (ok) break;
      await sleep(500);
    }
    await sleep(7000);
    await click('End');
    await sleep(1000);
    await js(`document.querySelector('.receipts')?.scrollIntoView({ behavior: 'smooth', block: 'start' })`);
    await sleep(9000);
    console.log('    transcript:', await js(`[...document.querySelectorAll('.transcript p')].map((p) => p.textContent).join(' | ')`));
  }],
  // 1:45 The record under the interview: what Nyx saw, against what was really meant (no ElevenLabs call).
  9: ['07b-the-record', async () => {
    await go(`${BASE}&page=agents`, 9000);
    await click('all ');
    await sleep(1000);
    await scrollTo(byText('button.name-link', 'Nyx·11'), 10, null, 300);
    await click('Nyx·11', 'button.name-link');
    await sleep(2500);
    await click('🎙 Interview');
    await sleep(2000);
    await js(`document.querySelector('.receipts')?.scrollIntoView({ behavior: 'smooth', block: 'start' })`);
    await sleep(3000);
    // Linger on each highlighted row in turn.
    for (let i = 0; i < 3; i++) {
      await js(`document.querySelectorAll('.receipt.blame')[${i}]?.scrollIntoView({ behavior: 'smooth', block: 'center' })`);
      await sleep(3500);
    }
  }],
  // 1:52 Proof, then the data.
  8: ['08-proof-and-data', async () => {
    await go(`${BASE}&page=findings`, 8000);
    await scrollTo(byText('section.r-section h2', 'prove what an AI meant'), 10, pageBox);
    await sleep(6000);
    await scrollTo(byText('.r-band', 'The data'), 2000, pageBox);
    await sleep(5000);
  }],
};

const pick = process.argv.slice(2).map(Number).filter(Boolean);
for (const [k, [name, act]] of Object.entries(SHOTS)) {
  if (pick.length && !pick.includes(Number(k))) continue;
  console.log(`shot ${k}: ${name}`);
  try { await record(name, act); } catch (e) { console.log(`  failed: ${e.message}`); }
}
ws.close();
await new Promise((r) => { chrome.once('exit', r); chrome.kill(); setTimeout(r, 3000); });
try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { /* leftover profile is harmless */ }
console.log(`\nclips in ${OUT}`);
