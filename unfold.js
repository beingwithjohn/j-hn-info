// Animate real document height, not overlays. Native details are the fallback.
(() => {
  const panels = [...document.querySelectorAll('details[id]')];
  const known = new Map(panels.map(panel => [panel.id, panel]));
  const desired = new Map(panels.map(panel => [panel, panel.open]));
  const running = new Map();
  const origins = new Map();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const page = document.querySelector('.page');
  const stack = document.querySelector('.visual-stack');
  const story = known.get('story');
  const feature = known.get('space-feature');
  const space = known.get('space-to-be');
  const spaceCopy = document.getElementById('space-copy');
  const spaceHome = space.querySelector('.disclosure-body');
  const featureCopy = feature.querySelector('.feature-copy');
  const mark = document.querySelector('.space-mark');
  const markHome = document.querySelector('.mark-home');
  const markDestination = document.querySelector('.circle-destination');
  let markMotion;
  let lastPanel;
  let restoring = false;

  function sync() {
    const expanded = desired.get(story) || desired.get(feature);
    stack.classList.toggle('expanded', expanded);
    page.classList.toggle('has-feature', expanded);
    document.querySelectorAll('a[aria-controls="story"]').forEach(link => {
      link.setAttribute('aria-expanded', String(desired.get(story)));
    });
    mark.setAttribute('aria-expanded', String(desired.get(feature)));
    mark.setAttribute('aria-label', desired.get(feature) ? 'Close Space to Be' : 'About Space to Be');
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

  function markPosition() {
    return markMotion?.rect() || mark.getBoundingClientRect();
  }

  function moveMark(destination, immediate = false, from = markPosition()) {
    markMotion?.cancel();
    destination.append(mark);
    if (immediate || reduced.matches || !from.width) return;
    // Only the SVG travels above the layout. All information stays in normal flow.
    // Track the destination as the artwork shrinks and the page makes room.
    const flight = mark.querySelector('svg').cloneNode(true);
    flight.classList.add('circle-flight');
    flight.setAttribute('aria-hidden', 'true');
    document.body.append(flight);
    mark.style.opacity = '0';
    let frame;
    let finished = false;
    const started = performance.now();
    const finish = () => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(frame);
      flight.remove();
      mark.style.opacity = '';
      if (markMotion?.flight === flight) markMotion = null;
    };
    markMotion = {flight, rect: () => flight.getBoundingClientRect(), finish, cancel: finish};
    const tick = now => {
      if (finished) return;
      const progress = Math.min(1, (now - started) / 740);
      const eased = 1 - Math.pow(1 - progress, 4);
      const to = mark.getBoundingClientRect();
      flight.style.left = `${from.left + (to.left - from.left) * eased}px`;
      flight.style.top = `${from.top + (to.top - from.top) * eased}px`;
      flight.style.width = `${from.width + (to.width - from.width) * eased}px`;
      flight.style.height = `${from.height + (to.height - from.height) * eased}px`;
      if (progress === 1) finish();
      else frame = requestAnimationFrame(tick);
    };
    tick(started);
  }

  function closeFeature(immediate = false, restoreNow = false) {
    const from = markPosition();
    const done = setPanel(feature, false, immediate);
    if (mark.parentElement !== markHome) moveMark(markHome, immediate, from);
    const restore = () => {
      if (!desired.get(feature)) spaceHome.append(spaceCopy);
    };
    if (restoreNow) restore();
    else done.then(restore);
    return done;
  }

  function reveal(panel, origin, immediate = false) {
    if (origin) origins.set(panel, origin);
    if (panel === feature) {
      const from = markPosition();
      setPanel(story, false, immediate);
      setPanel(space, false, true);
      featureCopy.append(spaceCopy);
      markDestination.append(mark);
      const done = setPanel(feature, true, immediate);
      moveMark(markDestination, immediate, from);
      return done;
    }
    if (panel === story || panel === space) closeFeature(immediate, panel === space);
    if (panel.id === 'more-story') reveal(story, null, immediate);
    return setPanel(panel, true, immediate);
  }

  function close(panel, immediate = false) {
    if (panel === feature) return closeFeature(immediate);
    return setPanel(panel, false, immediate);
  }

  function fragment() {
    try { return decodeURIComponent(location.hash.slice(1)); }
    catch { return ''; }
  }

  function writeHistory(panel) {
    if (restoring) return;
    const key = desired.get(panel) ? panel.id :
      [...panels].reverse().find(item => desired.get(item) && (item.id !== 'more-story' || desired.get(story)))?.id || 'home';
    if (location.hash !== `#${key}`) history.pushState(null, '', `#${key}`);
  }

  function keepVisible(panel) {
    const target = panel === feature ? mark : panel;
    const rect = target.getBoundingClientRect();
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
      if (panel === feature && next) reveal(panel, summary, true);
      else if (panel === feature) closeFeature(true);
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
      const origin = origins.get(panel) || (panel === feature ? mark : document.querySelector('.wordmark'));
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
      const focusTarget = panel === feature ? mark : panel.querySelector('.feature-inner');
      if (focusTarget) { focusTarget.tabIndex = -1; focusTarget.focus({preventScroll: true}); }
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.target.matches('input, textarea, select, [contenteditable="true"]')) return;
    const within = event.target.closest('details');
    const panel = within && desired.get(within) ? within :
      desired.get(feature) ? feature : desired.get(story) ? story : lastPanel;
    if (!panel || !desired.get(panel)) return;
    event.preventDefault();
    close(panel);
    writeHistory(panel);
    (origins.get(panel) || (panel === feature ? mark : panel === story ? document.querySelector('.wordmark') : panel.querySelector('summary'))).focus({preventScroll: true});
  });

  function restoreRoute(initial = false) {
    const key = fragment();
    if (key && key !== 'home' && !known.has(key)) return;
    restoring = true;
    closeFeature(true, true);
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
    markMotion?.finish();
  }
  window.addEventListener('resize', finishMotion, {passive: true});
  reduced.addEventListener?.('change', finishMotion);
  document.fonts?.ready.then(finishMotion);
  window.addEventListener('popstate', () => restoreRoute());
  window.addEventListener('hashchange', () => restoreRoute());
  document.documentElement.classList.add('enhanced');
  mark.setAttribute('href', '#space-feature');
  sync();
  restoreRoute(true);
})();
