import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../unfold.js', import.meta.url), 'utf8');
const offsetFunction = source.slice(source.indexOf('  function updateRailOffset('), source.indexOf('\n  function toggle('));
let height = 300, offset;
const viewport = {innerHeight: 720};
const update = vm.runInNewContext('(' + offsetFunction.trim() + ')', {
  window: viewport,
  utility: {getBoundingClientRect: () => ({height: 64})},
  rail: {
    getBoundingClientRect: () => ({height}),
    style: {setProperty(name, value) { assert.equal(name, '--rail-top-limit'); offset = value; }}
  }
});
update();
assert.equal(offset, '340px', 'Short rails leave room for the regular top inset');
height = 900;
update();
assert.equal(offset, '-260px', 'A tall rail can travel up enough to reveal its bottom above the footer');
viewport.innerHeight = 600;
update();
assert.equal(offset, '-380px', 'The offset adapts to shorter viewports');
height = 300;
update();
assert.equal(offset, '220px', 'Closing a section restores the short-rail offset');
assert.ok(source.includes('railObserver.observe(rail)') && source.includes('railObserver.observe(utility)'), 'Size changes are observed throughout disclosure animations');
assert.ok(source.includes("rail.style.position = 'static'"), 'Browsers without size observation retain normal document scrolling');

const visibleFunction = source.slice(source.indexOf('  function keepVisible('), source.indexOf('\n  function updateRailOffset('));
let scrolled = 0, top = 100;
const keepVisible = vm.runInNewContext('(' + visibleFunction.trim() + ')', {window: viewport, reduced: {matches: false}});
const panel = {
  getBoundingClientRect: () => ({top}),
  scrollIntoView(options) { assert.equal(options.behavior, 'smooth'); scrolled++; }
};
keepVisible(panel);
assert.equal(scrolled, 0, 'Visible activities do not reposition the page');
top = 570;
keepVisible(panel);
assert.equal(scrolled, 1, 'An offscreen activity scrolls into view through the document');
top = -30;
keepVisible(panel);
assert.equal(scrolled, 2);
console.log('Page scrolling checks passed: one scroll area, short/tall rails, resizing, collapse, fallback and activity navigation.');
