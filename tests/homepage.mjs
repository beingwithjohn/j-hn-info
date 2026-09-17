import assert from 'node:assert/strict';
import fs from 'node:fs';
const root = new URL('../', import.meta.url);
const read = name => fs.readFileSync(new URL(name, root), 'utf8');
const html = read('index.html');
const css = read('unfold.css');
assert.ok(!/I Ching|hexagram|dateline/.test(html + css), 'Retired daily widget has no markup, stylesheet or script reference');
assert.ok(!fs.existsSync(new URL('daily-hexagram.js', root)), 'Retired widget script removed');
for (const [, src] of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
  if (/^(?:https?:|mailto:)/.test(src)) continue;
  assert.ok(fs.existsSync(new URL(src.split(/[?#]/)[0], root)), 'Local asset exists: ' + src);
}
assert.ok(html.includes('unfold-ambient.js?v=sparkle-1'), 'Sparkle audio remains loaded');
assert.ok(html.includes('src="entry.js?v=entry-1"'), 'Opening and preload controller remains loaded');
assert.equal([...html.matchAll(/class="loader-piece"/g)].length, 5);
assert.equal([...html.matchAll(/rel="preload" as="image"/g)].length, 4);
for (const id of ['space-to-be', 'beings-club', 'arc-network', 'wonderfool', 'creative-counsel', 'story', 'more-story', 'space-feature']) {
  assert.ok(html.includes('id="' + id + '"'), 'Existing in-page information retained: ' + id);
}
const title = html.match(/<title>(.*?)<\/title>/)[1];
assert.ok(html.includes('<span class="wordmark-name" aria-hidden="true">John Ooi</span>'), 'Name is a single text line, not stacked letters');
assert.match(css, /\.wordmark-name\{display:block;white-space:nowrap;/, 'Name stays on one horizontal line');
assert.ok(css.includes('body:not(:has(.page :is(.project,.feature)[open]))'), 'Landing fit depends on visible top-level sections, not hidden nested chapters');
assert.equal(title, 'John Ooi · Maybe we should know each other.');
assert.equal(html.match(/property="og:title" content="([^"]+)"/)[1], title);
assert.equal(html.match(/name="twitter:title" content="([^"]+)"/)[1], title);
const description = 'One-to-one work, curious gatherings, letters, conversations and creative collaboration.';
assert.equal(html.match(/name="description" content="([^"]+)"/)[1], description);
assert.equal(html.match(/property="og:description" content="([^"]+)"/)[1], description);
assert.equal(html.match(/name="twitter:description" content="([^"]+)"/)[1], description);
assert.ok(html.includes('rel="canonical" href="https://j-hn.info/"'));
JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
console.log('Homepage checks passed: widget removed, local assets valid, existing content, previews, structured data, sparkle sound and entry preserved.');
