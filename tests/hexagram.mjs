import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {HEXAGRAMS, TRIGRAMS, forDay, lineMarkup, orderForCycle} = require('../daily-hexagram.js');
let checks = 0;
function check(value, label) { assert.ok(value, label); checks++; console.log('✓ ' + label); }
const DAY = 86400000;
const day = Date.parse('2026-09-14T00:00:00Z');
check(HEXAGRAMS.length === 64 && new Set(HEXAGRAMS.map(item => item[0])).size === 64, 'All 64 patterns occur once in the King Wen table');
check(HEXAGRAMS.every(([bits, name]) => Number.isInteger(bits) && bits >= 0 && bits < 64 && name), 'All entries have valid six-line data and a name');
check(TRIGRAMS.length === 8, 'Eight trigrams are available');
check(HEXAGRAMS[0][0] === 63 && HEXAGRAMS[1][0] === 0, 'Creative is all solid, Receptive all broken');
check(HEXAGRAMS[10][0] === 7 && HEXAGRAMS[11][0] === 56, 'Peace is earth above heaven, not its inverse Standstill');
check(HEXAGRAMS[62][0] === 21 && HEXAGRAMS[63][0] === 42, 'Completion pair has the correct opposing alternating lines');
for (let index = 0; index < 64; index++) {
  const [bits] = HEXAGRAMS[index];
  const markup = lineMarkup(bits);
  const rows = [...markup.matchAll(/data-line="(\d)" data-yang="(\d)"/g)];
  assert.equal(rows.length, 6);
  rows.forEach((row, i) => { assert.equal(+row[1], 6-i); assert.equal(+row[2], (bits >> (5-i)) & 1); });
  const solid = rows.filter(row => +row[2] === 1).length;
  assert.equal([...markup.matchAll(/<rect /g)].length, solid + (6-solid)*2);
}
check(true, 'Every diagram renders from line six at the top to line one at the bottom');
check(JSON.stringify(forDay(day)) === JSON.stringify(forDay(day+DAY-1)), 'Selection is stable from midnight through the final millisecond');
check(forDay(day).number !== forDay(day-1).number, 'Midnight changes the selection');
check(JSON.stringify(forDay(Date.parse('2026-09-14T13:00:00+13:00'))) === JSON.stringify(forDay(day)), 'Equivalent instants in different time zones match');
check(forDay(day).date === '2026-09-14', 'The date key is explicitly UTC');
check(forDay(NaN) === null && forDay(Infinity) === null && forDay(1e99) === null, 'Invalid dates fail safely');
check(forDay(-DAY).date === '1969-12-31', 'Dates before the epoch still select correctly');
let previous;
const seen = new Set();
for (let offset = 0; offset < 36525; offset++) {
  const item = forDay(day + offset*DAY);
  assert.notEqual(item.number, previous);
  previous = item.number; seen.add(item.number);
}
check(seen.size === 64, 'A hundred years has no consecutive repeat and includes every hexagram');
for (let cycle = -10; cycle <= 400; cycle++) {
  const selections = Array.from({length:64}, (_, offset) => forDay((cycle*64+offset)*DAY).number);
  assert.equal(new Set(selections).size, 64);
  assert.deepEqual(orderForCycle(cycle), orderForCycle(cycle));
}
check(true, 'Each date-seeded cycle is reproducible and covers all 64 symbols');

function fixture(start) {
  let now = start, id = 0;
  const timers = new Map(), docEvents = {}, winEvents = {};
  const elements = Object.fromEntries(['summary','.hexagram-number','.hexagram-name','.hexagram-trigrams'].map(key => [key, { attrs:{}, setAttribute(name,value) {this.attrs[name] = value;} }]));
  const classes = new Set();
  const panel = { hidden:true, dataset:{}, parentElement:{classList:{add: name => classes.add(name)}}, querySelector: selector => elements[selector] };
  const symbols = [{innerHTML:''}];
  const document = {hidden:false, getElementById: () => panel, querySelectorAll: () => symbols, addEventListener: (name, fn) => {docEvents[name] = fn;} };
  class Clock extends Date { static now() { return now; } }
  vm.runInNewContext(fs.readFileSync(new URL('../daily-hexagram.js', import.meta.url), 'utf8'), {
    Date: Clock, document, window:{addEventListener:(name, fn) => {winEvents[name] = fn;}},
    setTimeout: (fn, delay) => {timers.set(++id, {fn,delay}); return id;}, clearTimeout:key => timers.delete(key)
  });
  return {panel, symbols, elements, document, timers, classes, docEvents, winEvents, setTime: value => {now = value;}};
}
const app = fixture(day);
check(!app.panel.hidden && app.classes.has('has-hexagram'), 'Widget appears only after its daily content is ready');
check(app.symbols[0].innerHTML.includes('data-line="6"'), 'Homepage uses the precise six-line SVG');
check(app.elements.summary.attrs['aria-label'].includes(forDay(day).name), 'The icon has a descriptive accessible name');
check(app.elements['.hexagram-trigrams'].textContent === `${forDay(day).upper} above. ${forDay(day).lower} below.`, 'Visible trigram labels agree with the line data');
check(app.timers.size === 1 && [...app.timers.values()][0].delay === DAY+50, 'Only one timer, scheduled just beyond UTC midnight');
const original = app.panel.dataset.number;
app.panel.open = true;
app.setTime(day+DAY); [...app.timers.values()][0].fn();
check(app.panel.dataset.number !== original && app.panel.dataset.day === '2026-09-15', 'A page left open updates at midnight');
check(app.panel.open, 'Rollover does not close the disclosure or move focus');
app.document.hidden = true; app.docEvents.visibilitychange();
check(app.timers.size === 0, 'Hidden pages do not keep a daily timer running');
app.setTime(day+3*DAY); app.document.hidden = false; app.docEvents.visibilitychange();
check(app.panel.dataset.day === '2026-09-17' && app.timers.size === 1, 'Returning after sleep catches up to the current day');
app.setTime(day+4*DAY); app.winEvents.pageshow();
check(app.panel.dataset.day === '2026-09-18', 'Back-forward cache restoration refreshes the symbol');
app.winEvents.focus(); app.winEvents.focus();
check(app.timers.size === 1, 'Repeated focus events cannot multiply timers');
app.winEvents.pagehide();
check(app.timers.size === 0, 'Navigation cleans up the pending timer');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
check([...html.matchAll(/data-hexagram-symbol/g)].length === 1 && !html.includes('intro-hexagram'), 'Hexagram appears only on the homepage, never in the loading screen');
check(!html.includes('explore the I Ching'), 'No outbound I Ching link in the disclosure');
check(!html.slice(html.indexOf('<body>')).includes('Being + Curiosity'), 'Old visible slogan is gone, including the intro caption');
check(html.indexOf('daily-hexagram.js') < html.indexOf('src="unfold.js'), 'Daily content prepares before in-page disclosure routing');
check(html.includes('id="daily-hexagram" hidden') && html.includes('class="hexagram-copy"'), 'Existing native details flow handles the reading, not an overlay');
console.log(`Passed ${checks} hexagram checks.`);
