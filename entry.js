// All inline disclosures are already in the document. Prepare their media too.
(() => {
  const entry = window.jhnEntry;
  if (!entry) return;
  const root = document.documentElement;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let play = !reduced.matches;
  try {
    play = play && (new URLSearchParams(location.search).has('intro') || !sessionStorage.getItem('jhn-intro-seen'));
  } catch { /* Storage can be unavailable; the page still works. */ }
  if (!play) root.classList.add('intro-still');

  const pause = duration => new Promise(resolve => setTimeout(resolve, duration));
  const prepareImage = image => {
    image.loading = 'eager';
    const loaded = image.complete ? Promise.resolve() : new Promise(resolve => {
      const done = () => {
        image.removeEventListener('load', done);
        image.removeEventListener('error', done);
        resolve();
      };
      image.addEventListener('load', done, {once: true});
      image.addEventListener('error', done, {once: true});
      if (image.complete) done();
    });
    return loaded.then(() => image.naturalWidth && image.decode ? image.decode().catch(() => {}) : undefined);
  };

  const images = new Map([...document.images].map(image => [image, prepareImage(image)]));
  const artwork = document.getElementById('artwork');
  const assembly = (images.get(artwork) || Promise.resolve()).then(() => {
    if (entry.closed || !artwork?.naturalWidth) return;
    root.classList.add('intro-art-ready');
    return play ? pause(1700) : undefined;
  });

  // Hidden disclosures use weights that document.fonts.ready alone may not load.
  const fonts = document.fonts ? Promise.allSettled([
    ...[400, 500, 600, 700].map(weight => document.fonts.load(`${weight} 1em "Space Grotesk"`)),
    ...[300, 400].map(weight => document.fonts.load(`${weight} 1em "JetBrains Mono"`))
  ]).then(() => document.fonts.ready) : Promise.resolve();

  // Do not wait on the unrelated music-status request or external destinations.
  Promise.allSettled([...images.values(), fonts, assembly]).then(() => {
    if (entry.closed) return;
    try { sessionStorage.setItem('jhn-intro-seen', '1'); } catch { /* Optional. */ }
    if (reduced.matches || !play) { entry.finish(); return; }
    root.classList.add('intro-leaving');
    root.classList.remove('site-loading');
    setTimeout(entry.finish, 700);
  }).catch(entry.finish);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !entry.closed) entry.finish();
  });
  reduced.addEventListener?.('change', () => { if (reduced.matches) entry.finish(); });
})();
