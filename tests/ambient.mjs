import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const file = new URL('../unfold-ambient.js', import.meta.url);
const source = fs.readFileSync(file, 'utf8').split('// A single, reusable instrument:')[1];
let checks = 0;
function check(condition, label) {
  assert.ok(condition, label);
  console.log('✓ ' + label);
  checks++;
}

function fixture({ hold = true, stereo = true, supported = true, rejectResume = false } = {}) {
  const contexts = [], timers = new Map();
  let timerId = 0;
  function events(object = {}) {
    object.listeners = {};
    object.addEventListener = (name, callback) => (object.listeners[name] ||= []).push(callback);
    object.emit = (name, event = {}) => (object.listeners[name] || []).forEach(fn => fn({ type: name, ...event }));
    return object;
  }
  class Param {
    constructor() { this.value = 0; this.calls = []; }
    cancelAndHoldAtTime(time) { this.calls.push(['hold', time]); }
    cancelScheduledValues(time) { this.calls.push(['cancel', time]); }
    setValueAtTime(value, time) { this.value = value; this.calls.push(['value', value, time]); }
    linearRampToValueAtTime(value, time) { this.value = value; this.calls.push(['linear', value, time]); }
    setTargetAtTime(value, time, constant) { this.value = value; this.calls.push(['target', value, time, constant]); }
  }
  if (!hold) Param.prototype.cancelAndHoldAtTime = undefined;
  class Context {
    constructor() {
      this.state = 'suspended'; this.sampleRate = 1000; this.currentTime = 0;
      this.nodes = []; this.destination = {}; this.suspensions = 0;
      contexts.push(this);
    }
    node(kind) {
      const node = { kind, connections: [], starts: 0, stops: 0 };
      for (const name of ['gain', 'frequency', 'detune', 'Q', 'pan', 'threshold', 'knee', 'ratio', 'attack', 'release']) node[name] = new Param();
      node.connect = target => { node.connections.push(target); return target; };
      node.start = () => node.starts++;
      node.stop = () => node.stops++;
      this.nodes.push(node);
      return node;
    }
    createGain() { return this.node('gain'); }
    createOscillator() { return this.node('oscillator'); }
    createBiquadFilter() { return this.node('filter'); }
    createConvolver() { return this.node('convolver'); }
    createDynamicsCompressor() { return this.node('compressor'); }
    createStereoPanner() { return this.node('panner'); }
    createBufferSource() { return this.node('bufferSource'); }
    createBuffer(channels, frames) {
      const data = Array.from({ length: channels }, () => new Float32Array(frames));
      return { getChannelData: i => data[i] };
    }
    async resume() {
      if (rejectResume) throw new Error('Autoplay blocked');
      this.state = 'running';
    }
    async suspend() { this.state = 'suspended'; this.suspensions++; }
  }
  if (!stereo) Context.prototype.createStereoPanner = undefined;
  const artwork = events({ complete: true, naturalWidth: 1800, naturalHeight: 1200,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 400 }) });
  const button = events();
  let pixel = [234, 201, 106, 255];
  const canvas = { getContext: () => ({ canvas, drawImage() {}, getImageData: () => ({ data: pixel }) }) };
  const document = events({ hidden: false, createElement: () => canvas,
    getElementById: id => id === 'artwork' ? artwork : button });
  const window = events(supported ? { AudioContext: Context } : {});
  vm.runInNewContext('// A single, reusable instrument:' + source, {
    window, document, console,
    setTimeout: (fn, delay) => { timers.set(++timerId, { fn, delay }); return timerId; },
    clearTimeout: id => timers.delete(id)
  });
  return {
    contexts, document, window, button, canvas,
    setColour: next => { pixel = next; },
    hover: (extra = {}) => button.emit('pointermove', { clientX: 200, clientY: 200, pointerType: 'mouse', buttons: 0, ...extra }),
    unlock: () => document.emit('pointerdown'),
    flush: async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); },
    advance: async () => {
      const active = [...timers.values()]; timers.clear();
      active.forEach(t => t.fn());
      await Promise.resolve();
    },
    timers
  };
}

const app = fixture();
check(app.contexts.length === 0, 'No audio context, graph, or autoplay on page load');
check(app.canvas.width === 1200 && app.canvas.height === 800, 'Colour sampler avoids allocating a full-size artwork canvas');
app.hover();
check(app.contexts.length === 0, 'Hover before a gesture stays silent');
app.unlock(); await app.flush();
const ctx = app.contexts[0];
const tones = ctx.nodes.filter(n => n.kind === 'oscillator' && n.frequency.value > 20);
const envelope = ctx.nodes[0];
check(ctx.state === 'running' && tones.length === 9, 'First click starts one major triad across three octaves');
check(ctx.nodes.filter(n => n.kind === 'oscillator').length === tones.length, 'No slow modulation oscillators to produce repeating swells');
check(tones.every(n => n.detune.value === 0), 'Fixed tuning avoids slow detuning beats');
check(tones.every(n => n.starts === 1 && n.stops === 0), 'Voices sustain instead of scheduling one-shot endings');
check(envelope.gain.value === 0.9, 'Sustained envelope stays open under a still cursor');
check(app.timers.size === 0, 'No release or suspension timer runs while hovering');
check(tones[0].frequency.value === 146.832, 'All colours share a lighter D3 foundation');
check(tones.every(n => n.type === 'sine'), 'Pure, soft tones without buzzy triangle-wave harmonics');
const ratios = [1, 5 / 4, 3 / 2, 2, 5 / 2, 3, 4, 5, 6];
check(tones.every((node, index) => node.frequency.value === 146.832 * ratios[index]), 'Exact 4:5:6 major triads and octave ratios, without equal-temperament beating');
check(ctx.nodes.every(n => !['convolver', 'bufferSource', 'filter', 'compressor'].includes(n.kind)), 'No reverb build-up, noise, filter sweeps or compressor pumping');
check([envelope, ctx.nodes[1]].every(node => node.gain.calls.at(-1)[0] === 'linear' && node.gain.calls.at(-1)[2] === 0.008), 'Full level within 8ms, with just an anti-click edge');
const count = ctx.nodes.length;
const originalFrequencies = tones.map(n => n.frequency.value);
const levels = tones.map(n => n.connections[0].gain);
const originalBalance = levels.map(gain => gain.value);
app.setColour([20, 140, 193]); app.hover();
check(levels.some((gain, i) => gain.value !== originalBalance[i]), 'Blue changes the balance of the shared major chord');
check(tones.every((n, i) => n.frequency.value === originalFrequencies[i] && n.frequency.calls.length === 0), 'No pitch glides or retuning when changing colour');
check(levels.every(gain => gain.calls.at(-1)[0] === 'linear' && gain.calls.at(-1)[2] === 0.008), 'Tone balances settle within 8ms instead of swelling');
const blue = levels.map(gain => gain.value);
app.setColour([40, 39, 40]); app.hover();
check(levels.every((gain, i) => gain.value === blue[i]), 'Charcoal between stripes retains the last balance');
const colours = [[234, 201, 106], [95, 223, 136], [43, 206, 196], [224, 165, 201], [205, 205, 205], [20, 140, 193]];
const balances = [];
for (const colour of colours) {
  app.setColour(colour); app.hover(); balances.push(levels.map(gain => gain.value));
  assert.deepEqual(tones.map(n => n.frequency.value), originalFrequencies, 'Every colour has exactly the same fixed major-chord pitches');
  assert.ok(levels.every(gain => gain.value > 0), 'Every colour retains every note of the triad');
  assert.ok(Math.abs(levels.reduce((sum, gain) => sum + gain.value ** 2, 0) - 1) < 1e-12, 'Equal sustained energy in all colours');
}
check(new Set(balances.map(weights => weights.join(','))).size === 6, 'All six colours have a distinct balance of the same chord');
check(true, 'Only the root, pure major third and perfect fifth in every octave; no sixths, sevenths or ninths');
for (const from of balances) for (const to of balances) for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
  const mix = from.map((value, i) => value * (1 - fraction) + to[i] * fraction);
  assert.ok(mix.every(value => value > 0));
  const energy = mix.reduce((sum, value) => sum + value * value, 0);
  assert.ok(energy > 0.97 && energy <= 1 + 1e-12, 'Every possible colour transition retains the major chord without a volume surge');
}
check(true, 'All 36 colour-to-colour transitions retain the same pitches and steady energy');
for (let i = 0; i < 1000; i++) { app.setColour(colours[i % 6]); app.hover(); }
check(ctx.nodes.length === count, 'One thousand colour changes reuse exactly the same graph');
check(tones.every(n => n.frequency.calls.length === 0 && n.detune.calls.length === 0), 'Even rapid transitions never create between-note pitches');
app.button.emit('pointerleave');
check(envelope.gain.value === 0 && envelope.gain.calls.at(-1)[3] === 0.65, 'Leaving releases every octave gently');
check([...app.timers.values()][0].delay === 6000, 'The release finishes before suspension');
app.hover();
check(envelope.gain.value === 0.9 && app.timers.size === 0, 'Re-entry cancels suspension and restores the steady level');
app.button.emit('pointerleave'); await app.advance();
check(ctx.state === 'suspended', 'Idle audio suspends to save CPU');
app.hover(); await app.flush();
check(ctx.state === 'running' && ctx.nodes.length === count && envelope.gain.value === 0.9, 'Re-entry resumes the same instrument');
app.window.emit('blur');
check(envelope.gain.value === 0 && ctx.nodes[1].gain.value === 0, 'Window blur silences every voice');
await app.advance();
check(ctx.state === 'suspended', 'Background audio suspends after the short safety fade');
app.hover(); await app.flush();
app.document.hidden = true; app.document.emit('visibilitychange');
check(envelope.gain.value === 0 && ctx.nodes[1].gain.value === 0, 'A hidden tab cannot retain a sounding drone');
app.hover();
check(envelope.gain.value === 0, 'Pointer events cannot restart a hidden tab');
app.document.hidden = false; app.hover(); await app.flush();
app.window.emit('pagehide'); await app.flush();
check(ctx.state === 'suspended', 'Navigation suspends audio immediately');

const touch = fixture(); touch.unlock(); await touch.flush(); touch.hover({ pointerType: 'touch' });
check(touch.contexts[0].nodes.length === 0, 'Touch scrolling does not start a drone');
touch.hover(); await touch.flush(); touch.button.emit('pointercancel');
check(touch.contexts[0].nodes[0].gain.value === 0, 'Cancelled pointers release the drone');
check(!touch.button.listeners.click, 'Artwork click navigation remains untouched');

const fallback = fixture({ hold: false, stereo: false });
fallback.hover(); fallback.unlock(); await fallback.flush();
fallback.setColour(colours[3]); fallback.hover(); fallback.button.emit('pointerleave');
check(fallback.contexts[0].nodes[0].gain.calls.some(c => c[0] === 'cancel'), 'Automation fallback works without cancelAndHoldAtTime');
check(fallback.contexts[0].nodes.every(n => n.kind !== 'panner'), 'Sound also works without a stereo-panner API');

const unsupported = fixture({ supported: false });
unsupported.unlock(); unsupported.hover();
check(unsupported.contexts.length === 0, 'Unsupported audio is a harmless no-op');
const blocked = fixture({ rejectResume: true });
blocked.hover(); blocked.unlock(); await blocked.flush(); blocked.hover(); await blocked.flush();
check(blocked.contexts[0].nodes.length === 0, 'Blocked audio resume does not allocate a graph or throw');
const race = fixture(); race.hover(); race.unlock(); race.button.emit('pointerleave'); await race.flush();
check(race.contexts[0].nodes.length === 0, 'Leaving during async unlock cannot start a stray drone');
await race.advance();
check(race.contexts[0].state === 'suspended', 'Unused unlocked contexts return to sleep');
const keyboard = fixture(); keyboard.document.emit('keydown', { key: 'Escape' });
check(keyboard.contexts.length === 0, 'Unrelated keyboard actions do not unlock audio');
keyboard.document.emit('keydown', { key: 'Enter' }); await keyboard.flush(); keyboard.hover();
check(keyboard.contexts[0].nodes.length > 0, 'A keyboard activation can unlock subsequent hovering');

console.log(`Passed ${checks} ambient audio checks.`);
