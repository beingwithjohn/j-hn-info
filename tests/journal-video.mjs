import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../journal-video.js', import.meta.url), 'utf8');

function setup({reducedMotion = false, observer = true, rejectPlay = false} = {}) {
  const videoEvents = {}, buttonEvents = {}, documentEvents = {}, attributes = new Map();
  let observe;
  const sound = {setAttribute: (key, value) => attributes.set(key, value), addEventListener: (type, fn) => { buttonEvents[type] = fn; }};
  const video = {
    muted: false, defaultMuted: false, volume: 1, paused: true, plays: 0, currentTime: 12,
    closest: selector => { assert.equal(selector, '.video-toggle'); return sound; },
    addEventListener: (type, fn) => { videoEvents[type] = fn; },
    play() {
      this.plays++;
      if (rejectPlay) return Promise.reject(Error('Autoplay unavailable'));
      this.paused = false; videoEvents.play?.();
      return Promise.resolve();
    },
    pause() { this.paused = true; videoEvents.pause?.(); }
  };
  const reduced = {matches: reducedMotion, addEventListener: (_type, fn) => { reduced.change = fn; }};
  const document = {hidden: false, querySelectorAll: () => [video], addEventListener: (type, fn) => { documentEvents[type] = fn; }};
  class Observer {
    constructor(fn) { observe = fn; }
    observe(target) { assert.equal(target, video); }
  }
  const window = {matchMedia: () => reduced};
  if (observer) window.IntersectionObserver = Observer;
  vm.runInNewContext(source, {document, window, IntersectionObserver: Observer});
  return {
    video, sound, attributes, reduced,
    enter: () => observe([{isIntersecting: true, intersectionRatio: 1}]),
    leave: () => observe([{isIntersecting: false, intersectionRatio: 0}]),
    click: () => buttonEvents.click(),
    hide: value => { document.hidden = value; documentEvents.visibilitychange(); }
  };
}
const page = setup();
assert.equal(page.video.muted, true);
assert.equal(page.video.defaultMuted, true);
assert.equal(page.video.plays, 0, 'Offscreen video does not start downloading through play');
page.enter();
assert.equal(page.video.paused, false);
assert.equal(page.video.muted, true, 'Automatic playback is silent');
assert.equal(page.attributes.get('aria-pressed'), 'false');
page.click();
assert.equal(page.video.muted, false, 'Only an explicit sound action unmutes the video');
assert.equal(page.attributes.get('aria-pressed'), 'true');
page.click();
assert.equal(page.video.muted, true, 'A second click turns sound off');
assert.equal(page.video.paused, false, 'Clicking only changes sound, never pauses playback');
assert.equal(page.video.currentTime, 12, 'Sound toggling never seeks or restarts the video');
assert.equal(page.attributes.get('aria-pressed'), 'false');
page.click();
page.leave();
assert.equal(page.video.paused, true);
assert.equal(page.video.muted, true, 'Scrolling away stops sound and resets the mute');
page.enter();
assert.equal(page.video.paused, false);
assert.equal(page.video.muted, true, 'Re-entering never automatically restores sound');
page.click(); page.hide(true);
assert.ok(page.video.paused && page.video.muted, 'Hidden tabs pause and mute');
page.hide(false);
assert.equal(page.video.muted, true);
const reduced = setup({reducedMotion: true});
reduced.enter();
assert.equal(reduced.video.plays, 0, 'Reduced motion disables automatic playback');
reduced.click();
assert.equal(reduced.video.paused, false, 'An explicit action can still play the video');
const fallback = setup({observer: false});
assert.equal(fallback.video.plays, 0);
fallback.click();
assert.equal(fallback.video.muted, false, 'Manual controls work without IntersectionObserver');
const blocked = setup({rejectPlay: true});
blocked.enter(); blocked.click();
await Promise.resolve(); await Promise.resolve();
assert.equal(blocked.video.muted, true, 'Failed playback returns to silent state');
assert.equal(page.sound.title, undefined, 'No title tooltip appears on hover');
assert.equal(page.sound.textContent, undefined, 'No visible sound text is added');
console.log('Video checks passed: silent loops, click-to-toggle sound without pausing or seeking, reduced motion and browser fallbacks.');
