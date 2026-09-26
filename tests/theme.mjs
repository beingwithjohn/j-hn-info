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
  return {attributes, stored, button, buttonAttributes, ready: events.DOMContentLoaded, click: () => buttonEvents.click(), changeSystem: dark => {system.matches = dark; system.change();}, storage: windowEvents.storage};
}
const defaultLight = setup();
assert.equal(defaultLight.attributes.get('data-theme'), 'light', 'System light applies before the button exists');
assert.equal(defaultLight.button.hidden, true);
defaultLight.ready();
assert.equal(defaultLight.button.hidden, false);
assert.equal(defaultLight.buttonAttributes.get('aria-pressed'), 'false');
defaultLight.click();
assert.equal(defaultLight.attributes.get('data-theme'), 'dark');
assert.equal(defaultLight.stored.get('jhn-theme'), 'dark');
assert.equal(defaultLight.buttonAttributes.get('aria-pressed'), 'true');
assert.equal(defaultLight.button.title, 'Switch to light mode');
defaultLight.changeSystem(false);
assert.equal(defaultLight.attributes.get('data-theme'), 'dark', 'Explicit preference wins over the system');
defaultLight.click();
assert.equal(defaultLight.attributes.get('data-theme'), 'light');
assert.equal(defaultLight.stored.get('jhn-theme'), 'light');
const defaultDark = setup({dark: true});
assert.equal(defaultDark.attributes.get('data-theme'), 'dark');
defaultDark.changeSystem(false);
assert.equal(defaultDark.attributes.get('data-theme'), 'light', 'System changes followed before an explicit choice');
assert.equal(setup({saved: 'light', dark: true}).attributes.get('data-theme'), 'light');
assert.equal(setup({saved: 'dark'}).attributes.get('data-theme'), 'dark', 'Saved choice restored synchronously');
assert.equal(setup({saved: 'invalid', dark: true}).attributes.get('data-theme'), 'dark', 'Invalid saved values ignored');
const privateMode = setup({blocked: true});
privateMode.ready();
privateMode.click();
assert.equal(privateMode.attributes.get('data-theme'), 'dark', 'Toggle still works when storage throws');
defaultLight.storage({key: 'jhn-theme', newValue: 'dark'});
assert.equal(defaultLight.attributes.get('data-theme'), 'dark', 'Other tabs synchronize their choice');
defaultLight.storage({key: null, newValue: null});
assert.equal(defaultLight.attributes.get('data-theme'), 'light', 'Clearing preference returns to system mode');
console.log('Theme checks passed: initial paint, system preference, persistence, controls, cross-tab sync and blocked storage.');
