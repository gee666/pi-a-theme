export const DEFAULT_COLOR = '#6E452F';

/** Accept only #RRGGBB strings. No shorthand, whitespace, or coercion. */
export function normalizeColor(value) {
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
export function deriveTheme(color = DEFAULT_COLOR, accent) {
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
