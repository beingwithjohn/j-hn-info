import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

const file = new URL('../unfold-ambient.js', import.meta.url);
const source = fs.readFileSync(file, 'utf8').split('// Artwork sound:')[1];
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
    exponentialRampToValueAtTime(value, time) { this.value = value; this.calls.push(['exponential', value, time]); }
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
      node.start = time => { node.starts++; node.startAt = time; };
      node.stop = time => { node.stops++; node.stopAt = time; };
      node.disconnect = () => { node.disconnected = true; node.connections = []; };
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
    tick(seconds) {
      this.currentTime += seconds;
      for (const node of this.nodes) if (node.kind === 'oscillator' && !node.ended && node.stopAt <= this.currentTime) {
        node.ended = true;
        node.onended?.();
      }
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
  vm.runInNewContext('// Artwork sound:' + source, {
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
      contexts.forEach(ctx => ctx.tick(1));
      active.forEach(t => t.fn());
      await Promise.resolve();
    },
    timers
  };
}

const app = fixture();
const tones = ctx => ctx.nodes.filter(n => n.kind === 'oscillator');
const alive = ctx => tones(ctx).filter(n => !n.ended);
check(app.contexts.length === 0, 'No audio context, graph or autoplay on page load');
check(app.canvas.width === 1200 && app.canvas.height === 800, 'Colour sampling remains downscaled');
app.hover();
check(app.contexts.length === 0, 'Hover before a gesture stays silent');
app.unlock(); await app.flush();
const ctx = app.contexts[0];
check(ctx.state === 'running' && tones(ctx).length === 2, 'One colour creates one small chime with an octave transient');
const first = tones(ctx);
check(first[0].frequency.value === 587.328 && first[1].frequency.value === 1174.656, 'Bright D5/D6 sparkle, with no low organ foundation');
check(first.every(n => n.type === 'sine' && n.detune.value === 0), 'Soft sine partials with no detuning');
check(first.every(n => n.starts === 1 && n.stops === 1 && n.stopAt <= 0.65), 'Every note schedules its own ending within 650ms');
const firstGains = first.map(n => n.connections[0].gain);
check(firstGains.every(g => g.calls.some(c => c[0] === 'linear' && c[2] === 0.003)), 'A crisp 3ms anti-click attack, without swelling');
check(firstGains.every(g => g.calls.some(c => c[0] === 'exponential') && g.calls.at(-1)[1] === 0), 'Every partial decays completely to zero, with no sustain');
check(ctx.nodes.every(n => ['gain', 'oscillator', 'panner'].includes(n.kind)), 'No reverb, noise, compressor or modulating filter bed');
check([...app.timers.values()].length === 1 && [...app.timers.values()][0].delay === 900, 'Only a short idle-suspension timer, never a repeating sound timer');
for (let i = 0; i < 100; i++) { ctx.tick(0.01); app.hover(); }
check(tones(ctx).length === 2, 'Resting or moving within one colour cannot repeat a note');
check(alive(ctx).length === 0 && first.every(n => n.disconnected), 'Both oscillators and their nodes are cleaned up after decay');
await app.advance();
check(ctx.state === 'suspended', 'The audio sleeps even while the cursor remains over the artwork');
app.hover(); await app.flush();
check(ctx.state === 'suspended' && tones(ctx).length === 2, 'Same-colour pointer jitter does not wake audio');

const colours = [[234, 201, 106], [95, 223, 136], [43, 206, 196], [224, 165, 201], [205, 205, 205], [20, 140, 193]];
const ratios = [1, 5 / 4, 3 / 2, 2, 5 / 2, 3];
const pitches = [];
app.button.emit('pointerleave');
for (let i = 0; i < 6; i++) {
  ctx.tick(0.1); app.setColour(colours[i]); app.hover(); await app.flush();
  const latest = tones(ctx).slice(-2);
  assert.equal(latest[0].frequency.value, 587.328 * ratios[i]);
  assert.equal(latest[1].frequency.value, 587.328 * ratios[i] * 2);
  pitches.push(latest[0].frequency.value);
}
check(new Set(pitches).size === 6, 'All six colours play distinct notes of one just-tuned major triad across octaves');
check(tones(ctx).every(n => n.frequency.calls.length === 0), 'No pitch glides or in-between notes');
check(ctx.state === 'running', 'Crossing into another colour wakes the same audio context');
const beforeDark = tones(ctx).length;
app.setColour([40, 39, 40]); app.hover();
check(tones(ctx).length === beforeDark, 'Dark ground and frame make no sound');
ctx.tick(0.1); app.setColour(colours[5]); app.hover();
check(tones(ctx).length === beforeDark + 2, 'Reaching another stripe after a gap can sparkle again');

const beforeRush = tones(ctx).length;
for (let i = 0; i < 1000; i++) { app.setColour(colours[i % 6]); app.hover(); }
check(tones(ctx).length === beforeRush, 'A burst of pointer events cannot schedule a burst of notes');
let maxAlive = 0;
for (let i = 0; i < 1000; i++) {
  ctx.tick(0.01); app.setColour(colours[i % 6]); app.hover();
  maxAlive = Math.max(maxAlive, alive(ctx).length);
}
check(maxAlive <= 24, 'Fast continuous movement stays within the 12-chime overlap limit');
const beforeRest = tones(ctx).length;
await app.advance();
check(tones(ctx).length === beforeRest && alive(ctx).length === 0 && ctx.state === 'suspended', 'Stopping motion leaves no queued notes or sounding tail');
check(ctx.nodes.filter(n => n.kind === 'gain' && !n.disconnected).length === 1, 'Only the reusable output remains after completed notes are disconnected');
check(tones(ctx).every(n => ratios.some(r => Math.abs(n.frequency.value / 587.328 - r) < 1e-9) || [4, 5, 6].includes(n.frequency.value / 587.328)), 'Every note and overtone stays in the same major chord during rapid crossings');

app.button.emit('pointerleave'); ctx.tick(0.1); app.hover(); await app.flush();
const leaving = alive(ctx);
app.button.emit('pointerleave');
check(leaving.every(n => n.stops === 1), 'Leaving allows only the already-short chime to finish');
app.hover(); await app.flush();
app.window.emit('blur');
check(alive(ctx).every(n => n.stopAt <= ctx.currentTime + 0.021), 'Window blur quickly silences all remaining notes');
await app.advance();
check(ctx.state === 'suspended' && alive(ctx).length === 0, 'Background audio is stopped and suspended');
ctx.tick(0.1); app.hover(); await app.flush();
app.document.hidden = true; app.document.emit('visibilitychange');
const hiddenCount = tones(ctx).length;
app.hover();
check(tones(ctx).length === hiddenCount, 'Hidden tabs cannot trigger new sparkles');
app.document.hidden = false; app.button.emit('pointerleave'); app.hover(); await app.flush();
app.window.emit('pagehide'); await app.flush();
check(ctx.state === 'suspended', 'Navigation suspends audio immediately');

const touch = fixture();
touch.document.emit('pointerdown', { pointerType: 'touch' });
touch.hover({ pointerType: 'touch' });
check(touch.contexts.length === 0, 'Touch scrolling neither unlocks nor plays audio');
touch.unlock(); await touch.flush(); touch.hover({ buttons: 1 });
check(touch.contexts[0].nodes.length === 0, 'Dragging with a pressed pointer does not play notes');
touch.hover(); await touch.flush(); touch.button.emit('pointercancel');
await touch.advance();
check(alive(touch.contexts[0]).length === 0, 'Cancelled pointers cannot leave sustained audio');
check(!touch.button.listeners.click, 'Artwork click navigation is untouched');

const fallback = fixture({ hold: false, stereo: false });
fallback.hover(); fallback.unlock(); await fallback.flush(); fallback.window.emit('blur');
check(fallback.contexts[0].nodes.some(n => n.gain.calls.some(c => c[0] === 'cancel')), 'Quieting works without cancelAndHoldAtTime');
check(fallback.contexts[0].nodes.every(n => n.kind !== 'panner'), 'Sound works without stereo-panner support');
const unsupported = fixture({ supported: false });
unsupported.unlock(); unsupported.hover();
check(unsupported.contexts.length === 0, 'Unsupported audio is a harmless no-op');
const blocked = fixture({ rejectResume: true });
blocked.hover(); blocked.unlock(); await blocked.flush();
check(blocked.contexts[0].nodes.length === 0, 'Blocked audio resume allocates no instrument');
const race = fixture(); race.hover(); race.unlock(); race.button.emit('pointerleave'); await race.flush();
check(race.contexts[0].nodes.length === 0, 'Leaving during asynchronous unlock cannot start a stray note');
await race.advance();
check(race.contexts[0].state === 'suspended', 'Unused unlocked contexts return to sleep');
const frame = fixture(); frame.setColour([40, 39, 40]); frame.hover(); frame.unlock(); await frame.flush(); await frame.advance();
check(frame.contexts[0].state === 'suspended' && frame.contexts[0].nodes.length === 0, 'Unlocking over the frame remains silent and returns to sleep');
const keyboard = fixture(); keyboard.document.emit('keydown', { key: 'Escape' });
check(keyboard.contexts.length === 0, 'Unrelated keys do not unlock audio');
keyboard.document.emit('keydown', { key: 'Enter' }); await keyboard.flush(); keyboard.hover();
check(tones(keyboard.contexts[0]).length === 2, 'Keyboard activation can unlock subsequent movement');

const root = new URL('../', import.meta.url);
const atHead = name => execFileSync('git', ['show', 'HEAD:' + name], { cwd: root, encoding: 'utf8' });
const currentAmbient = fs.readFileSync(file, 'utf8');
check(currentAmbient.split('// Artwork sound:')[0] === atHead('unfold-ambient.js').split(/\/\/ (?:A single, reusable instrument:|Artwork sound:)/)[0], 'Existing music-status integration is unchanged');
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
check(index === atHead('index.html').replace(/unfold-ambient\.js\?v=[a-z0-9-]+/, 'unfold-ambient.js?v=sparkle-1'), 'The only HTML change is the audio cache version');
check(['unfold.css', 'unfold.js', 'entry.js', 'daily-hexagram.js'].every(name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8') === atHead(name)), 'No visual, layout, entry or hexagram changes');

console.log(`Passed ${checks} sparkle audio checks.`);
