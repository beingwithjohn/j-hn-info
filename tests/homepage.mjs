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
assert.ok(html.includes('unfold-ambient.js?v=music-only-1'), 'Listening footer remains loaded without hover audio');
assert.ok(html.includes('src="entry.js?v=preload-2"'), 'Remaining media still preloads');
assert.ok(!/id="artwork"|loader-piece|reference-bg/.test(html + css), 'Striped artwork and its loading animation are removed');
assert.equal([...html.matchAll(/rel="preload" as="image"/g)].length, 2);
assert.ok(!/beings-logo/.test(html + css), 'Beings Club section has no logo or unnecessary preload');
for (const id of ['space-to-be', 'beings-club', 'arc-network', 'wonderfool', 'in-the-garden', 'story', 'more-story']) {
  assert.ok(html.includes('id="' + id + '"'), 'Existing in-page information retained: ' + id);
}
const title = html.match(/<title>(.*?)<\/title>/)[1];
assert.ok(!/creative counsel|creative-counsel/i.test(html), 'Creative counsel is no longer on the personal homepage');
assert.ok(html.includes('<span class="wordmark-name" aria-hidden="true">John Ooi</span>'), 'Name is a single text line, not stacked letters');
assert.match(css, /\.wordmark-name\{display:block;white-space:nowrap;/, 'Name stays on one horizontal line');
assert.ok(css.includes('body:not(:has(.page :is(.project,.feature)[open]))'), 'Landing fit depends on visible top-level sections, not hidden nested chapters');
assert.match(html, /<footer class="utility">[\s\S]*class="mark-home"/, 'Logo lives in the footer');
assert.match(css, /\.utility\{position:fixed;/, 'Footer keeps the logo stable while content unfolds');
assert.ok(!css.includes('--mark-bottom') && !css.includes('padding-right:'), 'No logo lane narrows either text column');
assert.match(html, /class="space-mark" href="#space-to-be"[^>]+aria-controls="space-to-be"/, 'Logo opens the existing Space to Be section');
assert.ok(!/circle-flight|circle-destination|id="space-feature"/.test(html + css + read('unfold.js')), 'Logo no longer flies away or opens duplicate content');
assert.ok(read('unfold.js').includes("key === 'space-feature' ? 'space-to-be' : key"), 'Old logo links still resolve to Space to Be');
assert.ok(html.indexOf('src="theme.js?v=2"') < html.indexOf('href="unfold.css?'), 'Remembered colour preference is applied before rendering');
assert.match(html, /<html[^>]+data-theme="dark"/, 'Page defaults to dark even before the theme script runs');
assert.equal(title, 'John Ooi · Realisation Partner');
assert.ok(!html.includes('Maybe we should know each other.'), 'Previous invitation removed from visible copy and metadata');
assert.equal(html.match(/property="og:title" content="([^"]+)"/)[1], title);
assert.equal(html.match(/name="twitter:title" content="([^"]+)"/)[1], title);
const description = 'I’m John Ooi. A little of my story, what I’m learning, and the people, practices and projects that are part of my life.';
assert.equal(html.match(/name="description" content="([^"]+)"/)[1], description);
assert.equal(html.match(/property="og:description" content="([^"]+)"/)[1], description);
assert.equal(html.match(/name="twitter:description" content="([^"]+)"/)[1], description);
assert.ok(html.includes('rel="canonical" href="https://j-hn.info/"'));
const structured = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
assert.ok(structured['@graph'].some(entity => entity['@type'] === 'AboutPage'), 'The homepage is described as a personal About page');
assert.equal(structured['@graph'].find(entity => entity['@type'] === 'AboutPage').name, title, 'Structured page title matches search and social titles');
assert.ok(!structured['@graph'].some(entity => entity['@type'] === 'Service'), 'Service schema stays off the personal homepage');
assert.ok(html.indexOf('id="introduction"') < html.indexOf('id="projects"'), 'A personal introduction comes before projects');
assert.match(html, /class="hello">\s*<img class="portrait" src="images\/colourful-flower\.png"/, 'Selected flower image appears beside the name');
assert.ok(html.includes('rel="preload" as="image" href="images/colourful-flower.png"'), 'Name image is preloaded with the landing');
for (const size of [16, 32, 180, 512]) {
  const icon = fs.readFileSync(new URL('images/favicon-' + size + '.png', root));
  assert.equal(icon.readUInt32BE(16), size, 'Favicon width matches its declared size');
  assert.equal(icon.readUInt32BE(20), size, 'Favicon height matches its declared size');
  assert.ok(html.includes('href="images/favicon-' + size + '.png?v=flower-1"'), 'Flower icon linked with a fresh cache key');
}
assert.match(html, /id="wonderfool">[\s\S]*?Letters on being/, 'Wonderfool is introduced as letters');
assert.match(html, /id="in-the-garden">[\s\S]*?My podcast/, 'In the Garden has its own podcast section');
const podcastSection = html.match(/<details class="project" id="in-the-garden">([\s\S]*?)<\/details>/)[1];
assert.match(podcastSection, /href="https:\/\/wonderfool\.substack\.com\/podcast"[^>]*>listen on Substack ↗/, 'Substack link goes directly to the podcast');
assert.match(podcastSection, /href="https:\/\/open\.spotify\.com\/show\/76dQ2wEAlHByA0dCkoe2sq"[^>]*>listen on Spotify ↗/, 'Spotify links to the continuing podcast feed');
assert.ok(!podcastSection.includes('href="https://wonderfool.substack.com"'), 'Podcast links do not send listeners to the whole publication');
assert.match(html, /href="https:\/\/jackkornfield\.com\/the-mindfulness-meditation-teacher-certification-program\/"[^>]*>MMTCP<\/a>/, 'First training links to the official MMTCP page');
assert.match(html, /href="https:\/\/www\.dharmamoon\.com\/mindfulness-meditation-teacher-training"[^>]*>Dharma Moon<\/a>/, 'Second training links directly to the Dharma Moon training');
assert.ok(!html.includes('class="letter-form"'), 'No subscription form at landing');
assert.ok(html.includes("What I'm up to:"), 'Projects are introduced as current activities');
assert.ok(!html.includes('—'), 'Copy has no em dashes');
console.log('Homepage checks passed: artwork removed, flower retained, separate letters and podcast, metadata, assets and personal content verified.');
