// King Wen order. Bit 0 is the bottom line; 1 is solid (yang), 0 broken (yin).
// Symbol/name reference: https://www.unicode.org/charts/PDF/U4DC0.pdf
// Traditional text: https://ctext.org/book-of-changes/ens (James Legge translation).
// This is a date-selected symbol, not a coin/yarrow casting or changing-line reading.
(() => {
  const HEXAGRAMS = [
    [63, 'The Creative Heaven'], [0, 'The Receptive Earth'],
    [17, 'Difficulty at the Beginning'], [34, 'Youthful Folly'],
    [23, 'Waiting'], [58, 'Conflict'], [2, 'The Army'], [16, 'Holding Together'],
    [55, 'Small Taming'], [59, 'Treading'], [7, 'Peace'], [56, 'Standstill'],
    [61, 'Fellowship'], [47, 'Great Possession'], [4, 'Modesty'], [8, 'Enthusiasm'],
    [25, 'Following'], [38, 'Work on the Decayed'], [3, 'Approach'], [48, 'Contemplation'],
    [41, 'Biting Through'], [37, 'Grace'], [32, 'Splitting Apart'], [1, 'Return'],
    [57, 'Innocence'], [39, 'Great Taming'], [33, 'Mouth Corners'], [30, 'Great Preponderance'],
    [18, 'The Abysmal Water'], [45, 'The Clinging Fire'], [28, 'Influence'], [14, 'Duration'],
    [60, 'Retreat'], [15, 'Great Power'], [40, 'Progress'], [5, 'Darkening of the Light'],
    [53, 'The Family'], [43, 'Opposition'], [20, 'Obstruction'], [10, 'Deliverance'],
    [35, 'Decrease'], [49, 'Increase'], [31, 'Breakthrough'], [62, 'Coming to Meet'],
    [24, 'Gathering Together'], [6, 'Pushing Upward'], [26, 'Oppression'], [22, 'The Well'],
    [29, 'Revolution'], [46, 'The Cauldron'], [9, 'The Arousing Thunder'], [36, 'The Keeping Still Mountain'],
    [52, 'Development'], [11, 'The Marrying Maiden'], [13, 'Abundance'], [44, 'The Wanderer'],
    [54, 'The Gentle Wind'], [27, 'The Joyous Lake'], [50, 'Dispersion'], [19, 'Limitation'],
    [51, 'Inner Truth'], [12, 'Small Preponderance'], [21, 'After Completion'], [42, 'Before Completion']
  ];
  const TRIGRAMS = ['Earth', 'Thunder', 'Water', 'Lake', 'Mountain', 'Fire', 'Wind', 'Heaven'];
  const DAY = 86400000;

  function orderForCycle(cycle) {
    // A deterministic shuffle, independent of browser, timezone and local storage.
    let seed = 2166136261;
    for (const character of `j-hn.info:daily-hexagram:v1:${cycle}`) {
      seed = Math.imul(seed ^ character.charCodeAt(0), 16777619) >>> 0;
    }
    const random = () => {
      seed = (seed + 0x6D2B79F5) >>> 0;
      let mixed = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
      return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
    const order = Array.from({length: 64}, (_, index) => index);
    for (let index = 63; index > 0; index--) {
      const other = Math.floor(random() * (index + 1));
      [order[index], order[other]] = [order[other], order[index]];
    }
    return order;
  }

  function forDay(timestamp = Date.now()) {
    if (!Number.isFinite(timestamp)) return null;
    const date = new Date(timestamp);
    if (!Number.isFinite(date.getTime())) return null;
    const day = Math.floor(timestamp / DAY);
    const cycle = Math.floor(day / 64);
    const order = orderForCycle(cycle);
    // Each 64-day cycle visits every symbol. Prevent a repeat at the boundary too.
    if (order[0] === orderForCycle(cycle - 1)[63]) [order[0], order[1]] = [order[1], order[0]];
    const index = order[day - cycle * 64];
    const [bits, name] = HEXAGRAMS[index];
    return {number: index + 1, bits, name, upper: TRIGRAMS[bits >> 3], lower: TRIGRAMS[bits & 7], date: date.toISOString().slice(0, 10)};
  }

  function lineMarkup(bits) {
    return Array.from({length: 6}, (_, row) => {
      const line = 5 - row;
      const solid = (bits >> line) & 1;
      const y = row * 10;
      return `<g data-line="${line + 1}" data-yang="${solid}">${solid
        ? `<rect x="0" y="${y}" width="60" height="6"/>`
        : `<rect x="0" y="${y}" width="24" height="6"/><rect x="36" y="${y}" width="24" height="6"/>`}</g>`;
    }).join('');
  }

  // Keep the date and symbol math directly testable without a browser dependency.
  if (typeof module === 'object' && module.exports) module.exports = {HEXAGRAMS, TRIGRAMS, forDay, lineMarkup, orderForCycle};
  if (typeof document === 'undefined') return;
  const panel = document.getElementById('daily-hexagram');
  if (!panel) return;
  const summary = panel.querySelector('summary');
  let renderedDay;
  let timer;

  function refresh() {
    clearTimeout(timer);
    if (document.hidden) return;
    const now = Date.now();
    const hexagram = forDay(now);
    if (!hexagram) return;
    if (hexagram.date !== renderedDay) {
      const markup = lineMarkup(hexagram.bits);
      document.querySelectorAll('[data-hexagram-symbol]').forEach(symbol => { symbol.innerHTML = markup; });
      panel.querySelector('.hexagram-number').textContent = `I Ching · ${hexagram.number}`;
      panel.querySelector('.hexagram-name').textContent = hexagram.name;
      panel.querySelector('.hexagram-trigrams').textContent = `${hexagram.upper} above. ${hexagram.lower} below.`;
      summary.setAttribute('aria-label', `Today’s I Ching hexagram: ${hexagram.number}, ${hexagram.name}`);
      summary.setAttribute('title', `${hexagram.number} · ${hexagram.name}`);
      panel.dataset.day = hexagram.date;
      panel.dataset.number = String(hexagram.number);
      panel.hidden = false;
      panel.parentElement.classList.add('has-hexagram');
      renderedDay = hexagram.date;
    }
    timer = setTimeout(refresh, DAY - (now % DAY) + 50);
  }

  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('pageshow', refresh);
  window.addEventListener('focus', refresh);
  window.addEventListener('pagehide', () => clearTimeout(timer));
  refresh();
})();
