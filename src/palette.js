// Classic script so the builder also works when index.html is opened directly.
(() => {
'use strict';

const DEFAULT_COLOR = '#6E452F';

/** Accept only #RRGGBB strings. No shorthand, whitespace, or coercion. */
function normalizeColor(value) {
  if (typeof value !== 'string' || value.length !== 7 || !/^#[0-9a-f]{6}$/i.test(value)) {
    throw new TypeError('Expected a six-digit hex color in #RRGGBB form');
  }
  return value.toUpperCase();
}

// Resolved colors from blooming-ilacs-pi.json. Keeping the reference RGB values
// avoids rounded HSL constants and reproduces every default role byte for byte.
const REFERENCE = {
  accent: '#EA2175',
  border: '#825E45',
  borderAccent: '#EA2175',
  borderMuted: '#5F4A3F',
  success: '#C7E7BC',
  error: '#CC3950',
  warning: '#EA9152',
  muted: '#A08979',
  dim: '#746358',
  text: '#BDAE9D',
  thinkingText: '#A08979',
  selectedBg: '#3E3129',
  scrollbarThumb: '#825E45',
  searchMatchBg: '#825E45',
  searchMatchText: '#FE96ED',
  userMessageBg: '#6E452F',
  userMessageText: '#BDAE9D',
  customMessageBg: '#1E1814',
  customMessageText: '#BDAE9D',
  customMessageLabel: '#FE96ED',
  toolPendingBg: '#47382F',
  toolSuccessBg: '#2E2323',
  toolErrorBg: '#4A2028',
  toolTitle: '#EBB496',
  toolOutput: '#BDAE9D',
  mdHeading: '#FE96ED',
  mdLink: '#FFD0AA',
  mdLinkUrl: '#A08979',
  mdCode: '#FEC5E9',
  mdCodeBlock: '#BDAE9D',
  mdCodeBlockBorder: '#BD8C54',
  mdQuote: '#FEC5E9',
  mdQuoteBorder: '#97765F',
  mdHr: '#503C31',
  mdListBullet: '#E667A4',
  toolDiffAdded: '#C7E7BC',
  toolDiffRemoved: '#FF6098',
  toolDiffContext: '#A08979',
  syntaxComment: '#84766C',
  syntaxKeyword: '#DB779A',
  syntaxFunction: '#FFDC68',
  syntaxVariable: '#FE9CDA',
  syntaxString: '#D0BA71',
  syntaxNumber: '#FF91DC',
  syntaxType: '#C94EC7',
  syntaxOperator: '#DB8CA8',
  syntaxPunctuation: '#B59B94',
  thinkingOff: '#403B35',
  thinkingMinimal: '#825E45',
  thinkingLow: '#BD976B',
  thinkingMedium: '#DB779A',
  thinkingHigh: '#FE96ED',
  thinkingXhigh: '#EA2175',
  thinkingMax: '#FE96ED',
  bashMode: '#EA9152',
};

// Pink/purple reference roles follow an explicit accent. Earth tones, golds,
// status colors, comments, and all block fills continue to follow the base.
const ACCENT_ROLES = new Set([
  'accent', 'borderAccent', 'searchMatchText', 'customMessageLabel',
  'mdHeading', 'mdCode', 'mdQuote', 'mdListBullet', 'toolDiffRemoved',
  'syntaxKeyword', 'syntaxVariable', 'syntaxNumber', 'syntaxType',
  'syntaxOperator', 'thinkingMedium', 'thinkingHigh', 'thinkingXhigh',
  'thinkingMax',
]);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const wrapHue = (hue) => ((hue % 360) + 360) % 360;

function toHsl(hex) {
  const [r, g, b] = hex.slice(1).match(/../g).map((channel) => parseInt(channel, 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;
  if (delta === 0) return { h: 0, s: 0, l };
  const hue = max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return { h: wrapHue(hue * 60), s: delta / (1 - Math.abs(2 * l - 1)), l };
}

function toHex({ h, s, l }) {
  const a = s * Math.min(l, 1 - l);
  const channel = (n) => {
    const k = (n + h / 30) % 12;
    const value = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255).toString(16).padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`.toUpperCase();
}

const BASE_HSL = toHsl(DEFAULT_COLOR);
const ACCENT_HSL = toHsl(REFERENCE.accent);

function boundedSeed(hex, reference, minLight, maxLight, minSaturation) {
  const hsl = toHsl(hex);
  return {
    // Gray has no hue. Reuse the family hue rather than inventing red.
    h: hsl.s === 0 ? reference.h : hsl.h,
    s: clamp(hsl.s, minSaturation, 1),
    l: clamp(hsl.l, minLight, maxLight),
  };
}

/**
 * Shift each reference role by its family's HSL delta. Hue offsets stay intact,
 * including syntax/status colors. With no accent, every role follows the base;
 * an explicit accent changes only ACCENT_ROLES, relative to reference pink.
 *
 * Seed lightness is bounded for a dark theme. Base saturation is capped so
 * neon seeds do not turn panels into solid bright fills. A small saturation
 * floor preserves hue distinctions for black, white, and gray seeds. Role
 * saturation is clipped to gamut; reference lightness gaps remain unchanged.
 *
 * This is a pure JSON generator. Only named block backgrounds are colored;
 * there is no terminal background override, HTML pageBg, or terminal I/O.
 */
function deriveTheme(color = DEFAULT_COLOR, accent) {
  const base = boundedSeed(normalizeColor(color), BASE_HSL, 0.26, 0.32, 0.18);
  base.s = Math.min(base.s, 0.5);
  const explicitAccent = accent === undefined
    ? undefined
    : boundedSeed(normalizeColor(accent), ACCENT_HSL, 0.42, 0.58, 0.35);

  const colors = {};
  for (const [role, hex] of Object.entries(REFERENCE)) {
    const useAccent = explicitAccent !== undefined && ACCENT_ROLES.has(role);
    const seed = useAccent ? explicitAccent : base;
    const reference = useAccent ? ACCENT_HSL : BASE_HSL;
    const hsl = toHsl(hex);
    colors[role] = toHex({
      h: wrapHue(hsl.h + seed.h - reference.h),
      s: clamp(hsl.s + seed.s - reference.s, 0.08, 1),
      l: hsl.l + seed.l - reference.l,
    });
  }
  return { name: 'a-theme', colors };
}

function normalizeName(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value)
      || /^(system|dark|light|con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(value)) {
    throw new TypeError('Use 1–64 letters, numbers, hyphens or underscores. Start with a letter or number; avoid built-in theme and Windows device names.');
  }
  return value;
}

function relativeLuminance(hex) {
  return normalizeColor(hex).slice(1).match(/../g)
    .map(channel => parseInt(channel, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
}

/**
 * Use linear sRGB luminance >= 0.179 for the light path, the rounded WCAG
 * black-vs-white contrast crossover. This includes middle gray and keeps body
 * text readable on #767676 and brighter grays. Below that threshold, or with
 * an omitted background, retain the legacy dark path exactly.
 */
function isLightBackground(background) {
  return relativeLuminance(background) >= 0.179;
}

function contrastRatio(foreground, background) {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// Separate lightness levels keep even same-hue fills distinguishable. Hue
// comes from deriveTheme, including base-relative tool success/error hues.
const LIGHT_FILLS = {
  selectedBg: 0.90,
  searchMatchBg: 0.84,
  userMessageBg: 0.94,
  customMessageBg: 0.98,
  toolPendingBg: 0.92,
  toolSuccessBg: 0.96,
  toolErrorBg: 0.88,
};
const BODY_ROLES = new Set([
  'text', 'muted', 'dim', 'thinkingText', 'userMessageText',
  'customMessageText', 'toolOutput', 'mdCodeBlock', 'toolDiffContext',
  'syntaxComment', 'syntaxPunctuation',
]);

// Darken only HSL lightness, retaining hue and saturation. Check rounded RGB
// candidates, not floating-point HSL, so the returned literal meets 4.5:1.
// Sixteen bisections bound the work and give sub-channel precision.
function readableColor(hsl, backgrounds) {
  const readable = hex => backgrounds.every(bg => contrastRatio(hex, bg) >= 4.5);
  let hex = toHex(hsl);
  if (readable(hex)) return hex;
  let low = 0;
  let high = hsl.l;
  let best = toHex({ ...hsl, l: low });
  for (let step = 0; step < 16; step++) {
    const l = (low + high) / 2;
    hex = toHex({ ...hsl, l });
    if (readable(hex)) {
      low = l;
      best = hex;
    } else {
      high = l;
    }
  }
  return best;
}

function deriveLightColors(darkColors, background) {
  const colors = {};
  for (const [role, l] of Object.entries(LIGHT_FILLS)) {
    const hsl = toHsl(darkColors[role]);
    colors[role] = toHex({ h: hsl.h, s: clamp(hsl.s, 0.12, 0.34), l });
  }

  const toolBackgrounds = [colors.toolPendingBg, colors.toolSuccessBg, colors.toolErrorBg];
  const sharedBackgrounds = [background, colors.selectedBg, colors.userMessageBg,
    colors.customMessageBg, ...toolBackgrounds];
  const allBackgrounds = [...sharedBackgrounds, colors.searchMatchBg];
  const roleBackgrounds = {
    text: allBackgrounds,
    muted: allBackgrounds,
    dim: allBackgrounds,
    thinkingText: allBackgrounds,
    userMessageText: [colors.userMessageBg, colors.selectedBg],
    customMessageText: [colors.customMessageBg, colors.selectedBg],
    customMessageLabel: [colors.customMessageBg, colors.selectedBg],
    searchMatchText: [colors.searchMatchBg],
    toolTitle: [...toolBackgrounds, colors.selectedBg],
    toolOutput: [...toolBackgrounds, colors.selectedBg],
    toolDiffAdded: [...toolBackgrounds, colors.selectedBg],
    toolDiffRemoved: [...toolBackgrounds, colors.selectedBg],
    toolDiffContext: [...toolBackgrounds, colors.selectedBg],
  };
  // Preserve role order and the exact set of schema keys from the dark palette.
  const result = {};
  for (const [role, hex] of Object.entries(darkColors)) {
    if (Object.hasOwn(LIGHT_FILLS, role)) {
      result[role] = colors[role];
      continue;
    }
    const hsl = toHsl(hex);
    const body = BODY_ROLES.has(role);
    result[role] = readableColor({
      h: hsl.h,
      s: body ? clamp(hsl.s, 0.10, 0.25) : clamp(hsl.s, 0.45, 0.90),
      l: role === 'text' || role === 'userMessageText' || role === 'customMessageText'
        || role === 'toolOutput' ? 0.22 : body ? 0.32 : 0.40,
    }, roleBackgrounds[role] || sharedBackgrounds);
  }
  return result;
}

function validateOverrides(overrides) {
  if (overrides === null || typeof overrides !== 'object'
      || ![Object.prototype, null].includes(Object.getPrototypeOf(overrides))) {
    throw new TypeError('Overrides must be a plain object of theme role colors');
  }
  const result = {};
  for (const role of Reflect.ownKeys(overrides)) {
    if (typeof role !== 'string' || !Object.hasOwn(REFERENCE, role)) {
      throw new TypeError(`Unknown theme role: ${String(role)}`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(overrides, role);
    if (!Object.hasOwn(descriptor, 'value')) {
      throw new TypeError('Override colors must be values, not accessors');
    }
    normalizeColor(descriptor.value);
    // Validate without normalizing: manual overrides are exported verbatim.
    result[role] = descriptor.value;
  }
  return result;
}

/**
 * background describes the terminal/preview only; it is never an export role.
 * Missing or dark backgrounds preserve the original dark colors exactly.
 * Light colors meet 4.5:1 on their role backgrounds before overrides. Manual
 * overrides apply last and may intentionally discard that contrast guarantee.
 */
function createTheme({ name, base, accent, background, overrides = {} }) {
  const themeName = normalizeName(name);
  const normalizedBackground = background === undefined ? undefined : normalizeColor(background);
  const manualColors = validateOverrides(overrides);
  const light = normalizedBackground !== undefined && isLightBackground(normalizedBackground);
  const darkColors = deriveTheme(base, accent).colors;
  return {
    name: themeName,
    appearance: light ? 'light' : 'dark',
    colors: { ...(light ? deriveLightColors(darkColors, normalizedBackground) : darkColors), ...manualColors },
  };
}

globalThis.PiPalette = Object.freeze({ DEFAULT_COLOR, normalizeColor, deriveTheme, normalizeName,
  createTheme, contrastRatio, isLightBackground });
})();
