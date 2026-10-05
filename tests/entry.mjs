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
  let now = 0, id = 0;
  const timers = new Map(), classes = new Set(), attributes = new Map();
  const listeners = {}, documentListeners = {}, emitted = [], fontLoads = [];
  const fontReady = deferred(), media = {matches: !!options.reduced};
  media.addEventListener = (_type, fn) => { media.change = fn; };
  const images = Array.from({length: 2}, (_, i) => {
    const events = {}, decoded = deferred();
    return {
      id: 'image-' + i, loading: 'lazy', complete: !!options.cached, naturalWidth: options.cached ? 400 : 0,
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
  const galleryImages = [{loading: 'lazy', complete: false}];
  const document = {
    documentElement: {
      classList: {add: (...names) => names.forEach(n => classes.add(n)), remove: (...names) => names.forEach(n => classes.delete(n))},
      setAttribute: (name, value) => attributes.set(name, value), removeAttribute: name => attributes.delete(name)
    },
    images: [...images, ...galleryImages],
    querySelectorAll: selector => {
      assert.equal(selector, 'img[data-entry-image]');
      return images;
    },
    fonts: options.noFonts ? undefined : {
      load(spec) { const request = deferred(); fontLoads.push({spec, ...request}); return request.promise; },
      ready: fontReady.promise
    },
    addEventListener: (type, fn) => { documentListeners[type] = fn; }
  };
  const window = {
    matchMedia: () => media,
    addEventListener: (type, fn) => { listeners[type] = fn; },
    dispatchEvent(event) { emitted.push(event.type); listeners[event.type]?.(event); }
  };
  const context = vm.createContext({
    document, window, Event,
    setTimeout(fn, delay) { const key = ++id; timers.set(key, {at: now + delay, fn}); return key; },
    clearTimeout(key) { timers.delete(key); }
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
  return {classes, attributes, images, galleryImages, fontLoads, finishFonts, finishImages, tick, media, emitted, listeners, documentListeners, entry: window.jhnEntry};
}

const first = setup();
check(first.classes.has('site-loading') && first.attributes.get('aria-busy') === 'true', 'Loading state precedes deferred scripts');
check(first.images.every(image => image.loading === 'eager'), 'Hidden-section images are eager');
check(first.fontLoads.length === 6, 'Both typefaces and all declared weights requested');
first.images[0].load(); first.images[0].decoded.resolve(); await flush();
check(!first.entry.closed, 'One prepared image does not release unfinished assets');
first.finishImages(); await flush();
check(first.classes.has('site-loading'), 'Fonts also gate the reveal');
first.finishFonts(); await flush();
check(first.entry.closed && !first.classes.has('site-loading'), 'Ready page starts revealing without an artificial delay');
check(first.galleryImages.every(image => image.loading === 'lazy' && !image.complete), 'Unloaded later photos never block entry or become eager');
check(first.classes.has('site-ready'), 'Prepared assets trigger the fade-in state');
check(!first.attributes.has('aria-busy') && first.emitted.join() === 'jhn:ready', 'Readiness emitted exactly once');

const cached = setup({cached: true});
cached.finishFonts(); await flush();
check(cached.images.every(image => image.decodeCalls === 1), 'Cached images are decoded too');
check(!cached.entry.closed, 'Cached download does not bypass decode');
cached.images.forEach(image => image.decoded.resolve()); await flush();
check(cached.entry.closed, 'Cached page has no artificial animation delay');
for (const options of [{reduced: true}, {noDecode: true, noFonts: true}]) {
  const app = setup(options); app.finishImages(); app.finishFonts(); await flush();
  check(app.entry.closed, 'Reduced motion and missing optional APIs do not add a delay');
}
const blocked = setup({controller: false});
await blocked.tick(9999); check(!blocked.entry.closed, 'Deadline does not fire early');
await blocked.tick(1); check(blocked.entry.closed, 'Missing entry script fails open at the deadline');
const slow = setup();
await slow.tick(10000); check(slow.entry.closed, 'Stalled images and fonts cannot trap visitors');
slow.finishImages(); slow.finishFonts(); await flush();
check(!slow.classes.has('site-loading') && slow.classes.has('site-ready') && slow.emitted.length === 1, 'Late assets never hide the page or replay readiness');
const errors = setup(); errors.finishImages(true); errors.finishFonts(true); await flush();
check(errors.entry.closed, 'Failed images and fonts still release the page');
const escape = setup(); escape.documentListeners.keydown({key: 'Escape'});
check(escape.entry.closed, 'Escape bypasses loading');
const changed = setup(); changed.media.matches = true; changed.media.change();
check(changed.entry.closed, 'Changing to reduced motion ends loading');
const restored = setup(); restored.listeners.pageshow({persisted: true});
check(restored.entry.closed, 'Back-forward cache restore clears the loading state');
first.entry.finish();
check(first.emitted.length === 1, 'Repeated finish calls do not retrigger page entry');

const entryImages = [...html.matchAll(/<img\b(?=[^>]*data-entry-image)[^>]*\bsrc="([^"]+)"/g)].map(match => match[1]);
check(entryImages.length === 2, 'Only the flower and story portrait gate entry');
for (const src of entryImages) check(html.includes('rel="preload" as="image" href="' + src + '"'), 'Preload hint for ' + src);
check([...html.matchAll(/loading="lazy"/g)].length === 9, 'All journal photos are lazy-loaded behind the story disclosure');
check(!/<html[^>]*class=/.test(html), 'No-JS page is not hidden by default');
check(!/loader-piece|intro-art-ready|reference-bg/.test(html + css + source), 'Retired artwork and animation have no page references');
check(!/cursor\s*:\s*(?:wait|progress)/.test(css), 'Loading never displays a busy cursor');
check(/html\.site-ready \.page,html\.site-ready \.utility>\*\{animation:page-arrive 900ms ease-out both\}/.test(css), 'Prepared page and footer contents fade in together');
check(/html\.site-loading \.page,html\.site-loading \.utility>\*,html\.site-loading \.skip\{visibility:hidden\}/.test(css), 'Loading hides footer contents but keeps the covering background visible');
check(!/html\.site-(?:loading|ready) \.utility\s*[,\{]/.test(css), 'The footer itself is never hidden or faded, so the image cannot show through');
check(/@keyframes page-arrive\{from\{opacity:0\}to\{opacity:1\}\}/.test(css), 'Entry animation only changes opacity, keeping the logo fixed');
check(/@media\(prefers-reduced-motion:reduce\)\{[\s\S]*?animation:none!important/.test(css), 'Reduced-motion users bypass entry animation');
check(!source.includes('fetch(') && !source.includes('serviceWorker'), 'No extra fetch layer or persistent service-worker cache');
console.log(`${checks} entry checks passed: preloading, fade-in, normal cursor, deadline, errors and accessibility fallbacks.`);
