export type ThemeMode = 'light' | 'dark' | 'system';

export function getStoredTheme(): ThemeMode {
  const stored = localStorage.getItem('theme');
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored;
  }
  return 'light'; // Default to light mode as requested
}

function isDarkMode(mode: ThemeMode): boolean {
  return (
    mode === 'dark' ||
    (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  );
}

/** Apply a theme to the document without persisting it. */
export function previewTheme(mode: ThemeMode) {
  if (isDarkMode(mode)) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

/** Persist the theme and apply it. */
export function applyTheme(mode: ThemeMode) {
  localStorage.setItem('theme', mode);
  previewTheme(mode);
}

/** Restore the last saved theme (localStorage / default). */
export function revertThemePreview() {
  previewTheme(getStoredTheme());
}

export function initTheme() {
  const current = getStoredTheme();
  applyTheme(current);

  // Listen for system theme changes if set to 'system'
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (getStoredTheme() === 'system') {
      if (e.matches) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  });
}
