// All inline disclosures are already in the document. Prepare their media too.
(() => {
  const entry = window.jhnEntry;
  if (!entry) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
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

  // Hidden disclosures use weights that document.fonts.ready alone may not load.
  const fonts = document.fonts ? Promise.allSettled([
    ...[400, 500, 600, 700].map(weight => document.fonts.load(`${weight} 1em "Space Grotesk"`)),
    ...[300, 400].map(weight => document.fonts.load(`${weight} 1em "JetBrains Mono"`))
  ]).then(() => document.fonts.ready) : Promise.resolve();

  // Do not wait on the unrelated music-status request or external destinations.
  Promise.allSettled([...images.values(), fonts]).then(entry.finish).catch(entry.finish);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !entry.closed) entry.finish();
  });
  reduced.addEventListener?.('change', () => { if (reduced.matches) entry.finish(); });
})();
