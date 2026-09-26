import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../theme.js', import.meta.url), 'utf8');
function setup({saved = null, dark = false, blocked = false} = {}) {
  const attributes = new Map(), events = {}, windowEvents = {}, buttonEvents = {}, buttonAttributes = new Map();
  const stored = new Map(saved === null ? [] : [['jhn-theme', saved]]);
  const system = {matches: dark, addEventListener: (_type, callback) => { system.change = callback; }};
  const button = {hidden: true, title: '', setAttribute: (key, value) => buttonAttributes.set(key, value), addEventListener: (type, callback) => { buttonEvents[type] = callback; }};
  const document = {
    documentElement: {setAttribute: (key, value) => attributes.set(key, value), getAttribute: key => attributes.get(key)},
    querySelector: () => button,
    addEventListener: (type, callback) => { events[type] = callback; }
  };
  const localStorage = {
    getItem: key => { if (blocked) throw Error('Storage blocked'); return stored.get(key) ?? null; },
    setItem: (key, value) => { if (blocked) throw Error('Storage blocked'); stored.set(key, value); }
  };
  vm.runInNewContext(source, {document, localStorage, window: {matchMedia: () => system, addEventListener: (type, callback) => { windowEvents[type] = callback; }}});
  return {attributes, stored, button, buttonAttributes, ready: events.DOMContentLoaded, click: () => buttonEvents.click(), changeSystem: dark => {system.matches = dark; system.change?.();}, storage: windowEvents.storage};
}
const firstVisit = setup();
assert.equal(firstVisit.attributes.get('data-theme'), 'dark', 'Dark applies before the button exists, even on a light system');
assert.equal(firstVisit.button.hidden, true);
firstVisit.ready();
assert.equal(firstVisit.button.hidden, false);
assert.equal(firstVisit.buttonAttributes.get('aria-pressed'), 'true');
assert.equal(firstVisit.button.title, 'Switch to light mode');
firstVisit.click();
assert.equal(firstVisit.attributes.get('data-theme'), 'light');
assert.equal(firstVisit.stored.get('jhn-theme'), 'light');
assert.equal(firstVisit.buttonAttributes.get('aria-pressed'), 'false');
assert.equal(firstVisit.button.title, 'Switch to dark mode');
firstVisit.changeSystem(true);
assert.equal(firstVisit.attributes.get('data-theme'), 'light', 'Explicit preference wins over the system');
firstVisit.click();
assert.equal(firstVisit.attributes.get('data-theme'), 'dark');
assert.equal(firstVisit.stored.get('jhn-theme'), 'dark');
const defaultDark = setup({dark: true});
assert.equal(defaultDark.attributes.get('data-theme'), 'dark');
defaultDark.changeSystem(false);
assert.equal(defaultDark.attributes.get('data-theme'), 'dark', 'System changes do not override the dark default');
assert.equal(setup({saved: 'light', dark: true}).attributes.get('data-theme'), 'light');
assert.equal(setup({saved: 'dark'}).attributes.get('data-theme'), 'dark', 'Saved choice restored synchronously');
assert.equal(setup({saved: 'invalid', dark: true}).attributes.get('data-theme'), 'dark', 'Invalid saved values ignored');
const privateMode = setup({blocked: true});
assert.equal(privateMode.attributes.get('data-theme'), 'dark', 'Blocked storage still starts dark');
privateMode.ready();
privateMode.click();
assert.equal(privateMode.attributes.get('data-theme'), 'light', 'Toggle still works when storage throws');
firstVisit.storage({key: 'jhn-theme', newValue: 'light'});
assert.equal(firstVisit.attributes.get('data-theme'), 'light', 'Other tabs synchronize their choice');
firstVisit.storage({key: null, newValue: null});
assert.equal(firstVisit.attributes.get('data-theme'), 'dark', 'Clearing preference returns to the dark default');
console.log('Theme checks passed: dark default, saved choices, controls, cross-tab sync and blocked storage.');
