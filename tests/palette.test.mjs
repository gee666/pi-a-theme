import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { DEFAULT_COLOR, normalizeColor, deriveTheme } from '../src/palette.mjs';

// Portable snapshot of the reference's resolved colors. No local Pi install or
// reference checkout is needed to run these tests.
const EXPECTED = {
  accent: '#EA2175', border: '#825E45', borderAccent: '#EA2175',
  borderMuted: '#5F4A3F', success: '#C7E7BC', error: '#CC3950',
  warning: '#EA9152', muted: '#A08979', dim: '#746358', text: '#BDAE9D',
  thinkingText: '#A08979', selectedBg: '#3E3129', scrollbarThumb: '#825E45',
  searchMatchBg: '#825E45', searchMatchText: '#FE96ED',
  userMessageBg: '#6E452F', userMessageText: '#BDAE9D',
  customMessageBg: '#1E1814', customMessageText: '#BDAE9D',
  customMessageLabel: '#FE96ED', toolPendingBg: '#47382F',
  toolSuccessBg: '#2E2323', toolErrorBg: '#4A2028', toolTitle: '#EBB496',
  toolOutput: '#BDAE9D', mdHeading: '#FE96ED', mdLink: '#FFD0AA',
  mdLinkUrl: '#A08979', mdCode: '#FEC5E9', mdCodeBlock: '#BDAE9D',
  mdCodeBlockBorder: '#BD8C54', mdQuote: '#FEC5E9', mdQuoteBorder: '#97765F',
  mdHr: '#503C31', mdListBullet: '#E667A4', toolDiffAdded: '#C7E7BC',
  toolDiffRemoved: '#FF6098', toolDiffContext: '#A08979',
  syntaxComment: '#84766C', syntaxKeyword: '#DB779A', syntaxFunction: '#FFDC68',
  syntaxVariable: '#FE9CDA', syntaxString: '#D0BA71', syntaxNumber: '#FF91DC',
  syntaxType: '#C94EC7', syntaxOperator: '#DB8CA8', syntaxPunctuation: '#B59B94',
  thinkingOff: '#403B35', thinkingMinimal: '#825E45', thinkingLow: '#BD976B',
  thinkingMedium: '#DB779A', thinkingHigh: '#FE96ED', thinkingXhigh: '#EA2175',
  thinkingMax: '#FE96ED', bashMode: '#EA9152',
};

// Required roles from Pi's theme schema. Four optional reference roles are also
// included in EXPECTED. scrollbarTrack can retain Pi's default fallback.
const REQUIRED = `accent border borderAccent borderMuted success error warning
  muted dim text thinkingText selectedBg userMessageBg userMessageText
  customMessageBg customMessageText customMessageLabel toolPendingBg
  toolSuccessBg toolErrorBg toolTitle toolOutput mdHeading mdLink mdLinkUrl
  mdCode mdCodeBlock mdCodeBlockBorder mdQuote mdQuoteBorder mdHr mdListBullet
  toolDiffAdded toolDiffRemoved toolDiffContext syntaxComment syntaxKeyword
  syntaxFunction syntaxVariable syntaxString syntaxNumber syntaxType
  syntaxOperator syntaxPunctuation thinkingOff thinkingMinimal thinkingLow
  thinkingMedium thinkingHigh thinkingXhigh bashMode`.split(/\s+/);

const ACCENT_ROLES = new Set(`accent borderAccent searchMatchText customMessageLabel
  mdHeading mdCode mdQuote mdListBullet toolDiffRemoved syntaxKeyword
  syntaxVariable syntaxNumber syntaxType syntaxOperator thinkingMedium
  thinkingHigh thinkingXhigh thinkingMax`.split(/\s+/));

const BLOCKS = ['selectedBg', 'userMessageBg', 'customMessageBg',
  'toolPendingBg', 'toolSuccessBg', 'toolErrorBg'];

const rgb = (hex) => hex.slice(1).match(/../g).map((value) => parseInt(value, 16) / 255);
const lightness = (hex) => (Math.max(...rgb(hex)) + Math.min(...rgb(hex))) / 2;
const saturation = (hex) => {
  const channels = rgb(hex);
  return (Math.max(...channels) - Math.min(...channels)) / (1 - Math.abs(2 * lightness(hex) - 1));
};
const luminance = (hex) => rgb(hex).map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (fg, bg) => (luminance(fg) + 0.05) / (luminance(bg) + 0.05);
// RGB channel rotation is an exact 120-degree HSL hue shift, without requiring
// a second HSL conversion implementation in the tests.
const rotate = (hex) => `#${hex.slice(5, 7)}${hex.slice(1, 5)}`;

function assertTheme(theme) {
  assert.equal(theme.name, 'a-theme');
  assert.deepEqual(JSON.parse(JSON.stringify(theme)), theme);
  assert.deepEqual(Object.keys(theme).sort(), ['colors', 'name']);
  for (const role of REQUIRED) assert.ok(Object.hasOwn(theme.colors, role), role);
  assert.deepEqual(Object.keys(theme.colors).sort(), Object.keys(EXPECTED).sort());
  for (const color of Object.values(theme.colors)) assert.match(color, /^#[0-9A-F]{6}$/);
  // Only local block fills, never a global background or HTML page override.
  assert.equal(theme.export?.pageBg, undefined);
  assert.equal(theme.colors.background, undefined);
  assert.equal(theme.colors.terminalBg, undefined);
}

test('normalizes strict six-digit #RRGGBB strings', () => {
  assert.equal(DEFAULT_COLOR, '#6E452F');
  for (const [input, expected] of [
    ['#6e452f', '#6E452F'], ['#aBcDeF', '#ABCDEF'],
    ['#000000', '#000000'], ['#ffffff', '#FFFFFF'],
  ]) assert.equal(normalizeColor(input), expected);
});

test('rejects malformed strings and non-strings without coercion', () => {
  for (const input of [
    '', '6E452F', '#abc', '#12345', '#1234567', '#12345678', '#gggggg',
    ' #123456', '#123456 ', '#123456\n', '#123456\r', '#12345\u0000',
    'rgb(1, 2, 3)', 'red', null, undefined, 123456, {}, [], new String('#123456'),
  ]) assert.throws(() => normalizeColor(input), TypeError, String(input));
});

test('defaults reproduce every resolved reference role exactly', () => {
  const theme = deriveTheme();
  assertTheme(theme);
  assert.deepEqual(theme.colors, EXPECTED);
  assert.deepEqual(deriveTheme(DEFAULT_COLOR), theme);
  assert.deepEqual(deriveTheme('#6e452f', '#ea2175'), theme);
  assert.deepEqual(deriveTheme(undefined, '#EA2175'), theme);
});

test('invalid base and accent inputs throw', () => {
  for (const value of [null, '', '#FFF', '000000', '#XYZXYZ', 12]) {
    assert.throws(() => deriveTheme(value), TypeError);
    assert.throws(() => deriveTheme(DEFAULT_COLOR, value), TypeError);
  }
  assert.deepEqual(deriveTheme(DEFAULT_COLOR, undefined), deriveTheme());
});

test('each call returns fresh JSON with no shared mutable state', () => {
  const first = deriveTheme();
  const second = deriveTheme();
  assert.notEqual(first, second);
  assert.notEqual(first.colors, second.colors);
  first.colors.text = '#000000';
  first.name = 'changed';
  assert.deepEqual(deriveTheme(), second);
});

test('importing and deriving palettes emits no terminal output or OSC writes', () => {
  const moduleUrl = new URL('../src/palette.mjs', import.meta.url).href;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e',
    `import { deriveTheme } from ${JSON.stringify(moduleUrl)};
     deriveTheme(); deriveTheme('#FFFFFF', '#000000');`],
  { encoding: 'utf8', timeout: 5000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});

test('automatic accent and all syntax/status roles retain hue offsets', () => {
  for (const steps of [1, 2]) {
    let seed = DEFAULT_COLOR;
    for (let i = 0; i < steps; i++) seed = rotate(seed);
    const theme = deriveTheme(seed);
    assertTheme(theme);
    for (const [role, reference] of Object.entries(EXPECTED)) {
      let expected = reference;
      for (let i = 0; i < steps; i++) expected = rotate(expected);
      assert.equal(theme.colors[role], expected, `${seed}: ${role}`);
    }
  }
});

test('unclipped base saturation and lightness deltas carry through every role', () => {
  const seed = '#715031';
  const colors = deriveTheme(seed).colors;
  const deltaS = saturation(seed) - saturation(DEFAULT_COLOR);
  const deltaL = lightness(seed) - lightness(DEFAULT_COLOR);
  for (const [role, reference] of Object.entries(EXPECTED)) {
    assert.ok(Math.abs(saturation(colors[role]) - saturation(reference) - deltaS) < 0.018, role);
    assert.ok(Math.abs(lightness(colors[role]) - lightness(reference) - deltaL) < 0.003, role);
  }
});

test('explicit accent rotates only the accent family', () => {
  const theme = deriveTheme(DEFAULT_COLOR, rotate(EXPECTED.accent));
  for (const [role, reference] of Object.entries(EXPECTED)) {
    assert.equal(theme.colors[role], ACCENT_ROLES.has(role) ? rotate(reference) : reference, role);
  }
});

test('base and explicit accent families are independent', () => {
  const accent = '#3366CC';
  const original = deriveTheme(DEFAULT_COLOR, accent).colors;
  const shifted = deriveTheme(rotate(DEFAULT_COLOR), accent).colors;
  const automatic = deriveTheme(rotate(DEFAULT_COLOR)).colors;
  assert.equal(original.accent, '#3366CC');
  for (const role of Object.keys(EXPECTED)) {
    assert.equal(shifted[role], ACCENT_ROLES.has(role) ? original[role] : automatic[role], role);
  }
});

test('explicit accent saturation and lightness offsets carry through its family', () => {
  const seed = '#E52C7A';
  const colors = deriveTheme(DEFAULT_COLOR, seed).colors;
  const deltaS = saturation(seed) - saturation(EXPECTED.accent);
  const deltaL = lightness(seed) - lightness(EXPECTED.accent);
  for (const role of ACCENT_ROLES) {
    assert.ok(Math.abs(saturation(colors[role]) - saturation(EXPECTED[role]) - deltaS) < 0.018, role);
    assert.ok(Math.abs(lightness(colors[role]) - lightness(EXPECTED[role]) - deltaL) < 0.003, role);
  }
});

test('extreme base seeds keep dark distinct blocks and readable body text', () => {
  for (const seed of ['#000000', '#FFFFFF', '#010101', '#FEFEFE', '#808080',
    '#202020', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#00FFFF', '#FF00FF',
    '#102F85', '#CEEDFA']) {
    const theme = deriveTheme(seed);
    assertTheme(theme);
    assert.deepEqual(deriveTheme(seed), theme);
    const colors = theme.colors;
    assert.ok(new Set(BLOCKS.map((role) => colors[role])).size >= 5, seed);
    assert.ok(lightness(colors.text) > 0.6, seed);
    for (const role of BLOCKS) {
      assert.ok(lightness(colors[role]) >= 0.045 && lightness(colors[role]) <= 0.325, `${seed}: ${role}`);
      // The reference is not a WCAG-compliant palette. This lower bound checks
      // that extreme seeds do not erase the body text against block fills.
      assert.ok(contrast(colors.text, colors[role]) >= 2.5, `${seed}: ${role}`);
    }
    assert.ok(Object.values(colors).every((color) => color !== '#000000' && color !== '#FFFFFF'), seed);
  }
});

test('gray seeds use the reference hue rather than an arbitrary red hue', () => {
  const gray = deriveTheme('#808080').colors;
  assert.equal(gray.accent, '#D0417D');
  assert.equal(deriveTheme('#FFFFFF').colors.accent, gray.accent);
  assert.notEqual(deriveTheme('#000000').colors.userMessageBg, '#000000');
});

test('extreme explicit accents stay colored without changing any base role', () => {
  for (const accent of ['#000000', '#FFFFFF', '#808080', '#FF0000', '#00FF00', '#0000FF']) {
    const theme = deriveTheme(DEFAULT_COLOR, accent);
    assertTheme(theme);
    for (const [role, reference] of Object.entries(EXPECTED)) {
      if (!ACCENT_ROLES.has(role)) assert.equal(theme.colors[role], reference, `${accent}: ${role}`);
    }
    assert.ok(lightness(theme.colors.accent) >= 0.415 && lightness(theme.colors.accent) <= 0.585);
    assert.ok(saturation(theme.colors.accent) >= 0.34);
    assert.ok(lightness(theme.colors.mdHeading) >= 0.68);
  }
});
