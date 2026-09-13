import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root = new URL('../', import.meta.url);
const html = fs.readFileSync(new URL('index.html', root), 'utf8');
const css = fs.readFileSync(new URL('unfold.css', root), 'utf8');
const source = fs.readFileSync(new URL('entry.js', root), 'utf8');
const bootstrap = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
new vm.Script(bootstrap);
new vm.Script(source);
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
};
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

// Deterministic loading/timer doubles, not rendered-browser tests.
function setup(options = {}) {
  let now = 0, id = 0, removed = false;
  const timers = new Map(), classes = new Set(), attributes = new Map();
  const listeners = {}, documentListeners = {}, emitted = [], fontLoads = [];
  const fontReady = deferred(), media = {matches: !!options.reduced};
  media.addEventListener = (_type, fn) => { media.change = fn; };
  const storage = new Map(options.seen ? [['jhn-intro-seen', '1']] : []);
  const images = Array.from({length: 4}, (_, i) => {
    const events = {}, decoded = deferred();
    return {
      id: i === 0 ? 'artwork' : 'image-' + i,
      loading: 'lazy', complete: !!options.cached, naturalWidth: options.cached ? 400 : 0,
      decodeCalls: 0, decoded,
      decode() { this.decodeCalls++; return decoded.promise; },
      addEventListener(name, fn) { events[name] = fn; },
      removeEventListener(name, fn) { if (events[name] === fn) delete events[name]; },
      load(error = false) {
        this.complete = true; this.naturalWidth = error ? 0 : 400;
        events[error ? 'error' : 'load']?.();
      }
    };
  });
  if (options.noDecode) images.forEach(image => { image.decode = undefined; });
  const document = {
    documentElement: {
      classList: {add: (...names) => names.forEach(n => classes.add(n)), remove: (...names) => names.forEach(n => classes.delete(n))},
      setAttribute: (name, value) => attributes.set(name, value), removeAttribute: name => attributes.delete(name)
    },
    images,
    fonts: options.noFonts ? undefined : {
      load(spec) { const request = deferred(); fontLoads.push({spec, ...request}); return request.promise; },
      ready: fontReady.promise
    },
    getElementById(name) { return name === 'artwork' ? images[0] : name === 'site-intro' ? {remove() { removed = true; }} : null; },
    addEventListener: (type, fn) => { documentListeners[type] = fn; }
  };
  const window = {
    matchMedia: () => media,
    addEventListener: (type, fn) => { listeners[type] = fn; },
    dispatchEvent(event) { emitted.push(event.type); listeners[event.type]?.(event); }
  };
  const context = vm.createContext({
    document, window, location: {search: options.replay ? '?intro=1' : ''}, URLSearchParams, Event,
    setTimeout(fn, delay) { const key = ++id; timers.set(key, {at: now + delay, fn}); return key; },
    clearTimeout(key) { timers.delete(key); },
    sessionStorage: {
      getItem(key) { if (options.storageBlocked) throw Error('Unavailable'); return storage.get(key); },
      setItem(key, value) { if (options.storageBlocked) throw Error('Unavailable'); storage.set(key, value); }
    }
  });
  vm.runInContext(bootstrap, context);
  if (options.controller !== false) vm.runInContext(source, context);
  const tick = async ms => {
    await flush();
    const target = now + ms;
    while (true) {
      const next = [...timers].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at; timers.delete(next[0]); next[1].fn(); await flush();
    }
    now = target; await flush();
  };
  const finishFonts = (error = false) => { fontLoads.forEach(f => error ? f.reject(Error('Missing font')) : f.resolve([])); fontReady.resolve(); };
  const finishImages = (error = false) => images.forEach(image => { image.load(error); image.decoded.resolve(); });
  return {classes, attributes, images, fontLoads, finishFonts, finishImages, tick, media, storage, emitted, listeners, documentListeners, entry: window.jhnEntry, removed: () => removed};
}

const first = setup();
check(first.classes.has('site-loading') && first.attributes.get('aria-busy') === 'true', 'Loading state precedes deferred scripts');
check(first.images.every(image => image.loading === 'eager'), 'Hidden-section images are eager');
check(first.fontLoads.length === 6, 'Both typefaces and all declared weights requested');
first.images[0].load(); first.images[0].decoded.resolve(); await flush();
check(first.classes.has('intro-art-ready'), 'Assembly starts only after artwork decode');
await first.tick(1700);
check(first.classes.has('site-loading'), 'Animation alone does not release unfinished assets');
first.finishImages(); await flush();
check(first.classes.has('site-loading'), 'Fonts also gate the reveal');
first.finishFonts(); await flush();
check(first.classes.has('intro-leaving') && !first.classes.has('site-loading'), 'Ready page fades in');
await first.tick(700);
check(first.entry.closed && first.removed(), 'Opening removed after the transition');
check(!first.attributes.has('aria-busy') && first.emitted.join() === 'jhn:ready', 'Readiness emitted exactly once');
check(first.storage.get('jhn-intro-seen') === '1', 'First visit remembered for this session');

const cached = setup({cached: true, seen: true});
cached.finishFonts(); await flush();
check(cached.images.every(image => image.decodeCalls === 1), 'Cached images are decoded too');
check(!cached.entry.closed, 'Cached download does not bypass decode');
cached.images.forEach(image => image.decoded.resolve()); await flush();
check(cached.entry.closed && !cached.classes.has('intro-art-ready'), 'Repeat visit has no artificial animation delay');

for (const options of [{reduced: true, replay: true}, {noDecode: true, noFonts: true, seen: true}]) {
  const app = setup(options); app.finishImages(); app.finishFonts(); await flush();
  check(app.entry.closed, 'Reduced motion and missing optional APIs do not add a delay');
}
const replay = setup({seen: true, replay: true});
replay.finishImages(); replay.finishFonts(); await flush();
check(!replay.entry.closed && replay.classes.has('intro-art-ready'), 'Explicit replay overrides seen state');
await replay.tick(2400); check(replay.entry.closed, 'Explicit replay completes');

const blocked = setup({controller: false});
await blocked.tick(9999); check(!blocked.entry.closed, 'Deadline does not fire early');
await blocked.tick(1); check(blocked.entry.closed && blocked.removed(), 'Missing entry script fails open at the deadline');
const slow = setup();
await slow.tick(10000); check(slow.entry.closed, 'Stalled images and fonts cannot trap visitors');
slow.finishImages(); slow.finishFonts(); await flush();
check(!slow.classes.has('intro-art-ready') && slow.emitted.length === 1, 'Late assets never resurrect the opening');

const errors = setup(); errors.finishImages(true); errors.finishFonts(true); await flush();
await errors.tick(700);
check(errors.entry.closed, 'Failed images and fonts still release the page');
const storage = setup({storageBlocked: true}); storage.finishImages(); storage.finishFonts(); await storage.tick(2400);
check(storage.entry.closed, 'Storage denied does not prevent entry');
const escape = setup(); escape.documentListeners.keydown({key: 'Escape'});
check(escape.entry.closed, 'Escape bypasses the opening');
const changed = setup(); changed.media.matches = true; changed.media.change();
check(changed.entry.closed, 'Changing to reduced motion ends the opening');
const restored = setup(); restored.listeners.pageshow({persisted: true});
check(restored.entry.closed, 'Back-forward cache restore clears the loading state');

const imagePaths = [...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map(match => match[1]);
for (const src of imagePaths) check(html.includes('rel="preload" as="image" href="' + src + '"'), 'Preload hint for ' + src);
check(!html.includes('loading="lazy"'), 'No deferred image fetches on disclosure open');
check(!/<html[^>]*class=/.test(html) && css.includes('.site-intro{display:none;'), 'No-JS page is not hidden by default');
check((html.match(/class="loader-piece"/g) || []).length === 5, 'Five original artwork slices');
check(!source.includes('fetch(') && !source.includes('serviceWorker'), 'No extra fetch layer or persistent service-worker cache');
console.log(`${checks} entry checks passed: eager media, decoding, fonts, session/replay, deadline, errors, accessibility fallbacks. Browser visual QA not included.`);
