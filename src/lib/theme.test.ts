import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

function installThemeTestDom(options?: { prefersDark?: boolean }) {
  const store: Record<string, string> = {};
  const classes = new Set<string>();
  const prefersDark = options?.prefersDark ?? false;

  const localStorageMock = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      Object.keys(store).forEach((key) => delete store[key]);
    },
  };

  const classList = {
    add: (cls: string) => {
      classes.add(cls);
    },
    remove: (cls: string) => {
      classes.delete(cls);
    },
    contains: (cls: string) => classes.has(cls),
  };

  (globalThis as any).localStorage = localStorageMock;
  (globalThis as any).document = {
    documentElement: { classList },
  };
  (globalThis as any).window = {
    matchMedia: (query: string) => ({
      matches: query.includes('prefers-color-scheme: dark') ? prefersDark : false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  };

  return { store, classes };
}

describe('theme preview vs persist', () => {
  beforeEach(() => {
    installThemeTestDom();
  });

  it('previewTheme applies dark class without writing localStorage', async () => {
    const { store, classes } = installThemeTestDom();
    const { previewTheme, getStoredTheme } = await import('./theme.ts');

    previewTheme('dark');

    assert.equal(classes.has('dark'), true);
    assert.equal(store.theme, undefined);
    assert.equal(getStoredTheme(), 'light');
  });

  it('applyTheme persists the mode and applies it', async () => {
    const { store, classes } = installThemeTestDom();
    const { applyTheme, getStoredTheme } = await import('./theme.ts');

    applyTheme('dark');

    assert.equal(store.theme, 'dark');
    assert.equal(getStoredTheme(), 'dark');
    assert.equal(classes.has('dark'), true);
  });

  it('revertThemePreview restores the last saved theme after an unsaved preview', async () => {
    const { store, classes } = installThemeTestDom();
    const { applyTheme, previewTheme, revertThemePreview, getStoredTheme } = await import('./theme.ts');

    applyTheme('light');
    previewTheme('dark');
    assert.equal(classes.has('dark'), true);
    assert.equal(getStoredTheme(), 'light');

    revertThemePreview();

    assert.equal(store.theme, 'light');
    assert.equal(classes.has('dark'), false);
    assert.equal(getStoredTheme(), 'light');
  });

  it('previewing system theme does not commit until applyTheme', async () => {
    const { store, classes } = installThemeTestDom({ prefersDark: true });
    const { applyTheme, previewTheme, getStoredTheme } = await import('./theme.ts');

    applyTheme('light');
    previewTheme('system');

    assert.equal(classes.has('dark'), true);
    assert.equal(store.theme, 'light');
    assert.equal(getStoredTheme(), 'light');
  });
});
