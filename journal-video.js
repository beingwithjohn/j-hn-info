// Moving photographs stay quiet. Audio is enabled only through a visitor's control.
(() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelectorAll('.journal-video').forEach(video => {
    const sound = video.closest('.video-toggle');
    let visible = false;
    video.defaultMuted = true;
    video.muted = true;

    function syncSound() {
      const audible = !video.muted && video.volume > 0;
      sound.setAttribute('aria-pressed', String(audible));
    }
    function quietlyPause() {
      video.muted = true;
      if (!video.paused) video.pause();
      syncSound();
    }
    function maybePlay() {
      if (visible && !document.hidden && !reduced.matches) {
        video.play().catch(() => { /* Clicking the picture can retry playback. */ });
      }
    }
    sound.addEventListener('click', () => {
      if (video.muted || video.volume === 0) {
        video.muted = false;
        if (video.volume === 0) video.volume = 1;
        video.play().catch(() => { video.muted = true; syncSound(); });
      } else video.muted = true;
      syncSound();
    });
    video.addEventListener('volumechange', syncSound);
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        visible = entries[0].isIntersecting && entries[0].intersectionRatio >= .35;
        if (visible) maybePlay();
        else quietlyPause();
      }, {threshold: [0, .35]});
      observer.observe(video);
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) quietlyPause();
      else maybePlay();
    });
    reduced.addEventListener?.('change', () => {
      if (reduced.matches) quietlyPause();
      else maybePlay();
    });
    syncSound();
  });
})();
