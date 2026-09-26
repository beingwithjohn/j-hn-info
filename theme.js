// Apply before first paint; follow the system until the visitor chooses a theme.
(() => {
  const root = document.documentElement;
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  const key = 'jhn-theme';
  let preference;
  let toggle;
  const valid = value => value === 'light' || value === 'dark';
  try {
    const saved = localStorage.getItem(key);
    if (valid(saved)) preference = saved;
  } catch { /* Private browsing and file previews may restrict storage. */ }

  function apply() {
    const theme = preference || (system.matches ? 'dark' : 'light');
    root.setAttribute('data-theme', theme);
    if (!toggle) return;
    toggle.setAttribute('aria-pressed', String(theme === 'dark'));
    toggle.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  }
  apply();
  system.addEventListener?.('change', apply);
  window.addEventListener('storage', event => {
    if (event.key !== key && event.key !== null) return;
    preference = valid(event.newValue) ? event.newValue : undefined;
    apply();
  });
  document.addEventListener('DOMContentLoaded', () => {
    toggle = document.querySelector('.theme-toggle');
    if (!toggle) return;
    toggle.hidden = false;
    toggle.addEventListener('click', () => {
      preference = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(key, preference); } catch { /* Still works for this visit. */ }
      apply();
    });
    apply();
  });
})();
