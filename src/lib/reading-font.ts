import type { ReadingFontId } from '../shared/types/domain-types';
import { DEFAULT_READING_FONT, READING_FONT_IDS } from '../shared/types/domain-types';

export type { ReadingFontId };
export { DEFAULT_READING_FONT, READING_FONT_IDS };

export const READING_FONT_STORAGE_KEY = 'reading-font';

export const READING_FONTS: Record<ReadingFontId, {
  id: ReadingFontId;
  label: string;
  cssFamily: string;
  stylesheetHref?: string;
}> = {
  'anthropic-serif': {
    id: 'anthropic-serif',
    label: 'Anthropic Serif',
    cssFamily: "'Anthropic Serif', ui-serif, Georgia, serif",
    stylesheetHref: 'https://cdn.jsdelivr.net/gh/devchauhann/fonts@v1.1.0/cdn/api/css?family=AnthropicSerif&weights=400;500;600;700',
  },
  'anthropic-sans': {
    id: 'anthropic-sans',
    label: 'Anthropic Sans',
    cssFamily: "'Anthropic Sans', ui-sans-serif, system-ui, sans-serif",
    stylesheetHref: 'https://cdn.jsdelivr.net/gh/devchauhann/fonts@v1.1.0/cdn/api/css?family=AnthropicSans&weights=400;500;600;700',
  },
  'system-ui': {
    id: 'system-ui',
    label: 'System',
    cssFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif',
  },
  'dyslexic-friendly': {
    id: 'dyslexic-friendly',
    label: 'Dyslexic friendly',
    cssFamily: "'Atkinson Hyperlegible', ui-sans-serif, system-ui, sans-serif",
    stylesheetHref: 'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap',
  },
};

export function parseReadingFontId(value: unknown): ReadingFontId {
  if (value === 'atkinson-hyperlegible') return 'dyslexic-friendly';
  if (typeof value === 'string' && value in READING_FONTS) {
    return value as ReadingFontId;
  }
  return DEFAULT_READING_FONT;
}

export function getStoredReadingFont(): ReadingFontId {
  try {
    return parseReadingFontId(localStorage.getItem(READING_FONT_STORAGE_KEY));
  } catch {
    return DEFAULT_READING_FONT;
  }
}

function stylesheetLinkId(id: ReadingFontId): string {
  return `reading-font-${id}`;
}

function ensureStylesheet(id: ReadingFontId): void {
  const href = READING_FONTS[id].stylesheetHref;
  if (!href) return;
  const linkId = stylesheetLinkId(id);
  if (document.getElementById(linkId)) return;
  const link = document.createElement('link');
  link.id = linkId;
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

export function preloadReadingFontStylesheets(): void {
  for (const font of Object.values(READING_FONTS)) {
    ensureStylesheet(font.id);
  }
}

export function previewReadingFont(id: ReadingFontId): void {
  const font = READING_FONTS[id];
  document.documentElement.dataset.readingFont = font.id;
  document.documentElement.style.setProperty('--app-reading-font', font.cssFamily);
  ensureStylesheet(id);
}

export function applyReadingFont(id: ReadingFontId): void {
  localStorage.setItem(READING_FONT_STORAGE_KEY, id);
  previewReadingFont(id);
}

export function revertReadingFontPreview(): void {
  previewReadingFont(getStoredReadingFont());
}

export function initReadingFont(): void {
  previewReadingFont(getStoredReadingFont());
}
