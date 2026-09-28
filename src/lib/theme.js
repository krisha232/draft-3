// Light / dark mode. "system" follows the device setting.
const KEY = 'neev-theme';

export function savedTheme() {
  try {
    return localStorage.getItem(KEY) || 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;
  try {
    if (theme === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    /* storage unavailable: the choice lasts until the page is closed */
  }
}

export function isDark() {
  const t = document.documentElement.dataset.theme;
  if (t) return t === 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}
