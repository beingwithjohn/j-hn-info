import assert from 'node:assert/strict';
import fs from 'node:fs';
const root = new URL('../', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8');
const html = read('index.html');
const css = read('unfold.css');
const js = read('unfold.js');
const gallery = html.match(/<section class="photo-journal"[\s\S]*?<\/section>/)[0];
assert.ok(!gallery.includes('<h2') && !gallery.includes('photographs-heading'), 'The journal has no visible heading');
assert.match(gallery, /aria-label="Photos and films"/, 'The untitled journal still has an accessible region name');
const figures = [...gallery.matchAll(/<figure class="journal-photo" data-photo="(\d+)"[^>]*>([\s\S]*?)<\/figure>/g)];
assert.equal(figures.length, 12, 'Ten photographs and two videos have their own figures');
assert.equal(new Set(figures.map(([, id]) => id)).size, 12, 'Every photograph or video has a stable, unique identity');
assert.ok(!gallery.includes('data-photo="10"') && !gallery.includes('10-sunset.jpg'), 'Brazil is removed');
assert.equal(figures[0][1], '11', 'Malaysia is the first photo');
assert.ok(!gallery.includes('data-photo="9"') && !gallery.includes('09-leaves.jpg'), 'The UK leaves photograph is removed');
assert.ok(gallery.includes('01-spain.jpg') && !gallery.includes('01-arches.jpg'), 'Spain uses the replacement photograph');
const years = figures.map(([, , figure]) => Number(figure.match(/datetime="(\d{4})"/)[1]));
assert.deepEqual(years, [...years].sort(), 'Photographs run from oldest to newest');
const captions = {1: ['Spain', 2022], 2: ['Portugal', 2022], 3: ['England', 2021], 4: ['England', 2021], 5: ['Scotland', 2020], 6: ['Nepal', 2020], 7: ['China', 2025], 8: ['China', 2025], 10: ['Brazil', 2019], 11: ['Malaysia', 2019], 12: ['Philippines', 2024], 13: ['Argentina', 2023], 14: ['New Zealand', 2023]};
for (const [, id, figure] of figures) {
  const [country, year] = captions[id];
  assert.ok(figure.includes(`<span>${country}</span><time datetime="${year}">${year}</time>`), 'Caption matches John’s information for photo ' + id);
  assert.match(figure, /<figcaption[^>]*>.+<\/figcaption>/, 'Photo or video ' + id + ' has a caption');
  if (figure.includes('<video')) {
    const video = figure.match(/<video ([^>]+)>/)[1];
    assert.match(video, /preload="none" muted loop playsinline/, 'Video starts muted, loops and waits to load');
    assert.ok(!/\bcontrols\b/.test(video), 'No native playback or seek controls');
    assert.match(figure, /<button class="video-toggle" type="button" aria-label="Sound for [^"]+" aria-pressed="false"/, 'The picture is a keyboard-accessible sound toggle');
    assert.ok(!/title=|video-sound|sound off/.test(figure), 'No hover tooltip or separate sound label');
    assert.ok(fs.existsSync(new URL(video.match(/poster="([^"]+)"/)[1], root)), 'Video poster exists');
    const src = figure.match(/<source src="([^"]+)"/)[1];
    assert.ok(fs.statSync(new URL(src, root)).size < 20 * 1024 * 1024, 'Video has an optimized web copy');
    continue;
  }
  const image = figure.match(/<img ([^>]+)>/)[1];
  assert.match(image, /alt="[^"]{20,}"/, 'Photo ' + id + ' has descriptive alt text');
  assert.match(image, /width="\d+" height="\d+"/, 'Photo ' + id + ' reserves its natural aspect ratio');
  assert.ok(fs.existsSync(new URL(image.match(/src="([^"]+)"/)[1], root)));
}
assert.match(css, /\.journal-photo img,\.journal-photo video\{[^}]*width:100%;height:auto/, 'The whole frame stays visible without cropping');
assert.match(css, /@media\(min-width:861px\)\{\s*\.right-rail\{position:sticky;[^}]*max-height:[^}]*overflow-y:auto/, 'Expanded desktop activities remain reachable within the pinned column');
assert.ok(html.indexOf('class="opening"') < html.indexOf('class="right-rail"') && html.indexOf('class="right-rail"') < html.indexOf('class="photo-journal"'), 'Mobile opening contains the introduction and activities before the journal');
assert.match(css, /--journal-peek:calc\(var\(--journal-width\) \/ 15\)/, 'A tenth of the 3:2 first photo peeks above the footer');
assert.match(css, /grid-template-rows:minmax\(calc\(100svh - var\(--page-top\) - var\(--bar\) - var\(--journal-peek\)\),auto\)/, 'The desktop opening reserves space before the journal');
assert.ok(js.includes("getComputedStyle(rail).position === 'sticky'") && js.includes('rail.scrollBy('), 'Activity navigation scrolls its own rail on desktop');
assert.ok(!/\.video-toggle[^{}]*:hover/.test(css), 'Hovering does not alter the video');
console.log('Journal checks passed: ten photographs, two silent looping videos, captions, chronology and a subtle gallery peek.');
