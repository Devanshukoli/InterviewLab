import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

type LinkEl = { id: string; rel: string; href: string };

function installDom() {
  const dataset: Record<string, string> = {};
  const cssVars: Record<string, string> = {};
  const byId = new Map<string, LinkEl>();

  (globalThis as unknown as { document: unknown }).document = {
    documentElement: {
      dataset,
      style: {
        setProperty(name: string, value: string) {
          cssVars[name] = value;
        },
      },
    },
    getElementById(id: string) {
      return byId.get(id) ?? null;
    },
    createElement(_tag: string) {
      return { id: '', rel: '', href: '' } as LinkEl;
    },
    head: {
      appendChild(el: LinkEl) {
        byId.set(el.id, el);
        return el;
      },
    },
  };

  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: () => null,
    get length() {
      return store.size;
    },
  } as Storage;

  return { dataset, cssVars, byId, store };
}

const { dataset, cssVars, byId, store } = installDom();
const {
  DEFAULT_READING_FONT,
  READING_FONTS,
  READING_FONT_STORAGE_KEY,
  applyReadingFont,
  getStoredReadingFont,
  previewReadingFont,
  revertReadingFontPreview,
} = await import('./reading-font.ts');

describe('reading-font', () => {
  beforeEach(() => {
    store.clear();
    byId.clear();
    for (const key of Object.keys(dataset)) delete dataset[key];
    for (const key of Object.keys(cssVars)) delete cssVars[key];
  });

  it('previewReadingFont applies the family without writing localStorage', () => {
    previewReadingFont('dyslexic-friendly');
    assert.equal(dataset.readingFont, 'dyslexic-friendly');
    assert.equal(cssVars['--app-reading-font'], READING_FONTS['dyslexic-friendly'].cssFamily);
    assert.equal(store.get(READING_FONT_STORAGE_KEY), undefined);
  });

  it('applyReadingFont persists then previews', () => {
    applyReadingFont('system-ui');
    assert.equal(store.get(READING_FONT_STORAGE_KEY), 'system-ui');
    assert.equal(dataset.readingFont, 'system-ui');
    assert.equal(getStoredReadingFont(), 'system-ui');
  });

  it('revertReadingFontPreview restores the last saved font after an unsaved preview', () => {
    applyReadingFont('anthropic-sans');
    previewReadingFont('dyslexic-friendly');
    assert.equal(store.get(READING_FONT_STORAGE_KEY), 'anthropic-sans');
    revertReadingFontPreview();
    assert.equal(dataset.readingFont, 'anthropic-sans');
    assert.equal(cssVars['--app-reading-font'], READING_FONTS['anthropic-sans'].cssFamily);
  });

  it('maps the old atkinson id to dyslexic-friendly', () => {
    store.set(READING_FONT_STORAGE_KEY, 'atkinson-hyperlegible');
    assert.equal(getStoredReadingFont(), 'dyslexic-friendly');
  });

  it('getStoredReadingFont maps unknown ids to the default', () => {
    store.set(READING_FONT_STORAGE_KEY, 'comic-sans');
    assert.equal(getStoredReadingFont(), DEFAULT_READING_FONT);
  });

  it('does not inject a stylesheet for system-ui', () => {
    previewReadingFont('system-ui');
    assert.equal(byId.size, 0);
  });

  it('injects a stylesheet once for a webfont id', () => {
    previewReadingFont('dyslexic-friendly');
    previewReadingFont('dyslexic-friendly');
    assert.equal(byId.size, 1);
    const link = byId.get('reading-font-dyslexic-friendly');
    assert.ok(link);
    assert.equal(link.rel, 'stylesheet');
    assert.equal(link.href, READING_FONTS['dyslexic-friendly'].stylesheetHref);
  });
});
