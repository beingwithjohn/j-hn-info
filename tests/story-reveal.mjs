import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const html = read('index.html');
const css = read('unfold.css');
const source = read('unfold.js');
// Exercise the real controller with deterministic layout and animation doubles.
const controller = source.slice(source.indexOf('  function setPanel('), source.indexOf('\n  function reveal('));
assert.ok(controller.length > 1000);

function setup({reducedMotion = false, project = false, chapter = false, animations = true} = {}) {
  const effects = [], desired = new Map(), running = new Map();
  const animate = target => (frames, options) => {
    const effect = {target, frames, options, cancelled: false,
      cancel() { this.cancelled = true; },
      finish() { this.onfinish?.(); }
    };
    effects.push(effect);
    return effect;
  };
  const body = {inert: true, opacity: '1', transform: 'none', animate: animate('body')};
  const classes = new Set();
  const panel = {
    id: chapter ? 'more-story' : project ? 'space-to-be' : 'story',
    open: false, style: {}, parentElement: {closest: () => null},
    classList: {toggle: (name, on) => on ? classes.add(name) : classes.delete(name), remove: name => classes.delete(name)},
    querySelector: selector => selector.includes('disclosure-body') ? body : {getBoundingClientRect: () => ({height: project || chapter ? 44 : 0})},
    getBoundingClientRect: () => ({height: panel.measuredHeight ?? (panel.open ? (chapter ? 1600 : 5500) : project || chapter ? 44 : 0)}),
    animate: animations ? animate('panel') : undefined
  };
  desired.set(panel, false);
  const setPanel = vm.runInNewContext('(' + controller.trim() + ')', {
    story: project || chapter ? {} : panel, desired, running,
    reduced: {matches: reducedMotion}, lastPanel: undefined,
    sync() {},
    getComputedStyle: node => ({opacity: node.opacity, transform: node.transform})
  });
  return {panel, body, effects, running, set: (next, immediate) => setPanel(panel, next, immediate)};
}

const story = setup();
let done = story.set(true);
assert.equal(story.effects[0].target, 'body');
assert.equal(story.effects[0].options.duration, 900);
assert.equal(story.effects[0].frames[0].opacity, 0);
assert.equal(story.effects[0].frames[1].opacity, 1);
assert.equal(story.panel.style.height, '', 'The long gallery keeps natural height instead of animating thousands of pixels');
assert.equal(story.panel.style.overflow, '');
assert.equal(story.body.inert, false);
story.effects[0].finish();
assert.equal(await done, true);
assert.equal(story.panel.open, true);
done = story.set(false);
assert.equal(story.effects[1].options.duration, 240);
assert.equal(story.effects[1].frames[1].opacity, 0);
assert.equal(story.body.inert, true);
story.effects[1].finish();
assert.equal(await done, true);
assert.equal(story.panel.open, false);

const interrupted = setup();
const first = interrupted.set(true);
interrupted.body.opacity = '0.42';
interrupted.body.transform = 'matrix(1, 0, 0, 1, 0, 7)';
const second = interrupted.set(false);
assert.equal(await first, false);
assert.equal(interrupted.effects[0].cancelled, true);
assert.equal(interrupted.effects[1].frames[0].opacity, '0.42', 'Fast toggles continue from the visible frame');
assert.equal(interrupted.effects[1].frames[0].transform, interrupted.body.transform);
interrupted.effects[1].finish();
await second;
assert.equal(interrupted.panel.open, false);
assert.equal(interrupted.running.size, 0);

for (const options of [{reducedMotion: true}, {animations: false}, {chapter: true, reducedMotion: true}, {chapter: true, animations: false}]) {
  const direct = setup(options);
  await direct.set(true);
  assert.equal(direct.effects.length, 0);
  assert.equal(direct.panel.open, true);
  await direct.set(false);
  assert.equal(direct.panel.open, false);
}
const route = setup();
await route.set(true, true);
assert.equal(route.effects.length, 0, 'Restored routes do not replay reveal animation');

const project = setup({project: true});
done = project.set(true);
assert.equal(project.effects[0].target, 'panel');
assert.equal(project.effects[0].options.duration, 640, 'Activity animations keep their existing timing');
assert.ok('height' in project.effects[0].frames[0]);
project.effects[0].finish();
await done;

const chapter = setup({chapter: true});
done = chapter.set(true);
assert.equal(chapter.effects.length, 2, 'The biography height and content animate together');
assert.equal(chapter.effects[0].target, 'panel');
assert.equal(chapter.effects[0].frames[0].height, '44px');
assert.equal(chapter.effects[0].frames[1].height, '1600px');
assert.equal(chapter.effects[1].target, 'body');
assert.equal(chapter.effects[1].frames[0].opacity, 0);
assert.equal(chapter.effects[1].frames[1].opacity, 1);
assert.equal(chapter.effects[0].options.duration, 900);
assert.equal(chapter.effects[1].options.duration, 900);
assert.equal(chapter.panel.style.overflow, 'hidden');
chapter.effects[0].finish();
assert.equal(await done, true);
assert.equal(chapter.effects[1].cancelled, true, 'Finishing, resizing or changing motion preferences releases both effects');
assert.equal(chapter.panel.style.height, '');
assert.equal(chapter.panel.style.overflow, '');
assert.equal(chapter.running.size, 0);
done = chapter.set(false);
assert.equal(chapter.effects[2].options.duration, 500);
assert.equal(chapter.effects[3].frames[1].opacity, 0);
assert.equal(chapter.body.inert, true);
chapter.effects[2].finish();
await done;
assert.equal(chapter.panel.open, false);

const chapterReverse = setup({chapter: true});
const opening = chapterReverse.set(true);
chapterReverse.panel.measuredHeight = 600;
chapterReverse.body.opacity = '0.35';
chapterReverse.body.transform = 'matrix(1, 0, 0, 1, 0, 8)';
const closing = chapterReverse.set(false);
assert.equal(await opening, false);
assert.equal(chapterReverse.effects[0].cancelled, true);
assert.equal(chapterReverse.effects[1].cancelled, true);
assert.equal(chapterReverse.effects[2].frames[0].height, '600px');
assert.equal(chapterReverse.effects[3].frames[0].opacity, '0.35');
assert.equal(chapterReverse.effects[3].frames[0].transform, chapterReverse.body.transform);
await chapterReverse.set(true, true);
assert.equal(await closing, false);
assert.equal(chapterReverse.effects[2].cancelled, true);
assert.equal(chapterReverse.effects[3].cancelled, true);
assert.equal(chapterReverse.running.size, 0);
assert.equal(chapterReverse.panel.style.height, '');
assert.equal(chapterReverse.panel.open, true);

assert.ok(html.indexOf('class="right-rail"') < html.indexOf('class="feature-stack"'), 'Reading and mobile layout order put all story content after activities');
assert.match(css, /\.right-rail\{grid-column:2;grid-row:1 \/ span 2\}/, 'Desktop activities span the intro and story rows');
assert.match(css, /\.feature-stack\{grid-column:1;grid-row:2;/, 'Desktop story remains below the introduction in the left column');
assert.match(css, /@media\(max-width:860px\)[\s\S]*\.opening\{display:flex;flex-direction:column;gap:36px\}/, 'Narrow layouts follow the same reading order');
assert.ok(source.includes("const isStory = panel === story || panel.id === 'more-story';"));
assert.ok(source.includes('if (next && isStory) keepVisible(panel);'), 'Any needed story scroll starts with the reveal, not afterwards');
assert.match(css, /\.introduction\{[^}]*container-type:inline-size/);
assert.match(css, /\.introduction>p\{[^}]*font-size:min\(1\.35rem,3\.25cqi\)[^}]*white-space:nowrap/);
assert.match(css, /\.story-heading h2\{[^}]*font-size:min\(3\.2rem,6\.4cqi\)[^}]*white-space:nowrap/);
console.log('Story checks passed: responsive reading order, single-line headings, natural-height reveal, nested biography motion, quick reversals, reduced motion, routes and unchanged activities.');
