// Animate real document height, not overlays. Native details are the fallback.
(() => {
  const panels = [...document.querySelectorAll('details[id]')];
  const projects = panels.filter(panel => panel.classList.contains('project'));
  const known = new Map(panels.map(panel => [panel.id, panel]));
  const desired = new Map(panels.map(panel => [panel, panel.open]));
  const running = new Map();
  const origins = new Map();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const page = document.querySelector('.page');
  const stack = document.querySelector('.feature-stack');
  const story = known.get('story');
  const space = known.get('space-to-be');
  const mark = document.querySelector('.space-mark');
  let lastPanel;
  let restoring = false;

  function sync() {
    const expanded = desired.get(story);
    stack.classList.toggle('expanded', expanded);
    page.classList.toggle('has-feature', expanded);
    document.querySelectorAll('a[aria-controls="story"]').forEach(link => {
      link.setAttribute('aria-expanded', String(desired.get(story)));
    });
    mark.setAttribute('aria-expanded', String(desired.get(space)));
    mark.setAttribute('aria-label', desired.get(space) ? 'Close Space to Be' : 'About Space to Be');
  }

  function setPanel(panel, next, immediate = false) {
    if (desired.get(panel) === next && !running.has(panel) && panel.open === next) return Promise.resolve(true);
    const parent = panel.parentElement.closest('details');
    if (parent && running.has(parent)) running.get(parent).animation.finish();
    const startHeight = panel.getBoundingClientRect().height;
    const previous = running.get(panel);
    if (previous) {
      running.delete(panel);
      previous.animation.cancel();
      previous.resolve(false);
    }
    desired.set(panel, next);
    if (next) lastPanel = panel;
    const body = panel.querySelector(':scope > .disclosure-body');
    body.inert = !next;
    panel.open = true;
    panel.style.height = '';
    panel.style.overflow = '';
    panel.classList.toggle('is-closing', !next);
    const summaryHeight = panel.querySelector(':scope > summary').getBoundingClientRect().height;
    const endHeight = next ? panel.getBoundingClientRect().height : summaryHeight;
    sync();
    if (immediate || reduced.matches || typeof panel.animate !== 'function') {
      panel.open = next;
      panel.classList.remove('is-closing');
      return Promise.resolve(true);
    }
    panel.style.height = `${endHeight}px`;
    panel.style.overflow = 'hidden';
    return new Promise(resolve => {
      const animation = panel.animate(
        [{height: `${startHeight}px`}, {height: `${endHeight}px`}],
        {duration: 640, easing: 'cubic-bezier(.22,.75,.2,1)'}
      );
      running.set(panel, {animation, resolve});
      animation.onfinish = () => {
        if (running.get(panel)?.animation !== animation) return;
        running.delete(panel);
        panel.open = desired.get(panel);
        panel.style.height = '';
        panel.style.overflow = '';
        panel.classList.remove('is-closing');
        resolve(true);
      };
    });
  }

  function reveal(panel, origin, immediate = false) {
    if (origin) origins.set(panel, origin);
    // Current activities share one open slot; the personal story is independent.
    if (projects.includes(panel)) {
      projects.forEach(other => {
        if (other !== panel) setPanel(other, false, immediate);
      });
    }
    if (panel.id === 'more-story') reveal(story, null, immediate);
    return setPanel(panel, true, immediate);
  }

  function close(panel, immediate = false) {
    return setPanel(panel, false, immediate);
  }

  function fragment() {
    try {
      const key = decodeURIComponent(location.hash.slice(1));
      return key === 'space-feature' ? 'space-to-be' : key;
    }
    catch { return ''; }
  }

  function writeHistory(panel) {
    if (restoring) return;
    const key = desired.get(panel) ? panel.id :
      [...panels].reverse().find(item => desired.get(item) && (item.id !== 'more-story' || desired.get(story)))?.id || 'home';
    if (location.hash !== `#${key}`) history.pushState(null, '', `#${key}`);
  }

  function keepVisible(panel) {
    const target = panel;
    const rect = target.getBoundingClientRect();
    const rail = target.closest('.right-rail');
    // A desktop activity should scroll its own column, not move the photo journal.
    if (rail && getComputedStyle(rail).position === 'sticky') {
      const bounds = rail.getBoundingClientRect();
      if (rect.top < bounds.top + 8 || rect.top > bounds.bottom - 100) {
        rail.scrollBy({top: rect.top - bounds.top - 12, behavior: reduced.matches ? 'auto' : 'smooth'});
      }
      return;
    }
    if (rect.top < 16 || rect.top > window.innerHeight - 140) {
      target.scrollIntoView({block: 'start', behavior: reduced.matches ? 'auto' : 'smooth'});
    }
  }

  function toggle(panel, origin) {
    const next = !desired.get(panel);
    const done = next ? reveal(panel, origin) : close(panel);
    writeHistory(panel);
    done.then(completed => {
      if (completed && next && desired.get(panel)) keepVisible(panel);
    });
  }

  panels.forEach(panel => {
    const summary = panel.querySelector(':scope > summary');
    summary.addEventListener('click', event => {
      if (event.defaultPrevented) return;
      event.preventDefault();
      toggle(panel, summary);
    });
    // Reconcile native opens from browser find-in-page and accessibility tools.
    panel.addEventListener('toggle', () => {
      if (running.has(panel) || desired.get(panel) === panel.open) return;
      const next = panel.open;
      if (projects.includes(panel) && next) reveal(panel, summary, true);
      else {
        desired.set(panel, next);
        panel.querySelector(':scope > .disclosure-body').inert = !next;
        sync();
      }
    });
  });

  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;
    if (link.dataset.close) {
      const panel = known.get(link.dataset.close);
      if (!panel) return;
      event.preventDefault();
      close(panel);
      writeHistory(panel);
      const origin = origins.get(panel) || document.querySelector('.wordmark');
      origin.focus({preventScroll: true});
      return;
    }
    let key;
    try { key = decodeURIComponent(link.getAttribute('href').slice(1)); } catch { return; }
    const panel = known.get(key);
    if (!panel) return;
    event.preventDefault();
    toggle(panel, link);
    // Keyboard activation follows the content without trapping focus.
    if (event.detail === 0 && desired.get(panel)) {
      const focusTarget = panel.querySelector('.feature-inner') || panel.querySelector('summary');
      if (focusTarget) {
        if (focusTarget.matches('.feature-inner')) focusTarget.tabIndex = -1;
        focusTarget.focus({preventScroll: true});
      }
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.target.matches('input, textarea, select, [contenteditable="true"]')) return;
    const within = event.target.closest('details');
    const panel = within && desired.get(within) ? within :
      desired.get(story) ? story : lastPanel;
    if (!panel || !desired.get(panel)) return;
    event.preventDefault();
    close(panel);
    writeHistory(panel);
    (origins.get(panel) || (panel === story ? document.querySelector('.wordmark') : panel.querySelector('summary'))).focus({preventScroll: true});
  });

  function restoreRoute(initial = false) {
    const key = fragment();
    if (key && key !== 'home' && !known.has(key)) return;
    restoring = true;
    panels.forEach(panel => setPanel(panel, false, true));
    const panel = known.get(key);
    if (panel) {
      reveal(panel, null, true);
      requestAnimationFrame(() => keepVisible(panel));
    } else if (!initial) window.scrollTo({top: 0, behavior: reduced.matches ? 'auto' : 'smooth'});
    restoring = false;
  }

  function finishMotion() {
    [...running.values()].forEach(({animation}) => animation.finish());
  }
  window.addEventListener('resize', finishMotion, {passive: true});
  reduced.addEventListener?.('change', finishMotion);
  document.fonts?.ready.then(finishMotion);
  window.addEventListener('jhn:ready', () => { finishMotion(); restoreRoute(true); });
  window.addEventListener('popstate', () => restoreRoute());
  window.addEventListener('hashchange', () => restoreRoute());
  document.documentElement.classList.add('enhanced');
  sync();
  restoreRoute(true);
})();
