import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import '../src/palette.js';

const { createTheme, deriveTheme, isLightBackground, contrastRatio } = globalThis.PiPalette;
const make = options => createTheme({ name: 'light-test', ...options });
const fills = ['selectedBg', 'searchMatchBg', 'userMessageBg', 'customMessageBg',
  'toolPendingBg', 'toolSuccessBg', 'toolErrorBg'];
const tools = ['toolPendingBg', 'toolSuccessBg', 'toolErrorBg'];
const syntax = ['syntaxComment', 'syntaxKeyword', 'syntaxFunction', 'syntaxVariable',
  'syntaxString', 'syntaxNumber', 'syntaxType', 'syntaxOperator', 'syntaxPunctuation'];
const markdown = ['mdHeading', 'mdLink', 'mdLinkUrl', 'mdCode', 'mdCodeBlock',
  'mdCodeBlockBorder', 'mdQuote', 'mdQuoteBorder', 'mdHr', 'mdListBullet'];
const accents = ['accent', 'borderAccent', 'error', 'warning', 'success'];

const rgb = hex => hex.slice(1).match(/../g).map(channel => parseInt(channel, 16) / 255);
const luminance = hex => rgb(hex).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
// Independent contrast calculation avoids testing the implementation against itself.
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05)
  / (Math.min(luminance(a), luminance(b)) + 0.05);
const hsl = hex => {
  const [r, g, b] = rgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  if (!d) return { h: 0, s: 0, l };
  const h = max === r ? (g - b) / d : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: d / (1 - Math.abs(2 * l - 1)), l };
};
const hueDistance = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
const readable = (colors, roles, backgrounds, label) => {
  for (const role of roles) {
    for (const background of backgrounds) {
      const ratio = contrast(colors[role], background);
      assert.ok(ratio >= 4.5, `${label}: ${role} ${colors[role]} on ${background}: ${ratio}`);
    }
  }
};

// SHA-256 of JSON.stringify(original deriveTheme(...).colors), captured before
// adding light support. These lock every dark role and its original ordering.
const legacy = [
  [undefined, undefined, 'c1b66545ab1d112ab2e84e1e7a8b53420d71058388b2e00cc2a6d7cb683a85d7'],
  ['#6e452f', '#ea2175', 'c1b66545ab1d112ab2e84e1e7a8b53420d71058388b2e00cc2a6d7cb683a85d7'],
  ['#294E73', '#DC5324', '132cd440ee88038b9ceef3b7a07635989f4f7284e0f6fba6d2310b2d35a200b6'],
  ['#FFFFFF', '#000000', '940ec8c5cff126a5c066cd5cadde4d3f1b186ed35225ec8bd8c453ec2a9705ef'],
  ['#000000', '#FFFFFF', '566f144e55c527c36a2a8b3b8d328eac49c82808ad894e75d2cbe07562805bfe'],
  ['#808080', undefined, '33bc64a59dfb03d3cc0ad1172ead1b6c6c120b7495bfb36a5af9fc8ee393dc05'],
  ['#00FF00', '#0000FF', '6096df308b8bf205572137eb29008c999a1d07b3c6965d6a29c4937e950f9ea3'],
  ['#CEEDFA', '#FF00FF', 'a01579a942d7b90c06e7a801067bee0dce373ea78586fdf5ab5295431b153491'],
];
const digest = colors => createHash('sha256').update(JSON.stringify(colors)).digest('hex');

test('omitted and dark backgrounds retain every original dark color exactly', () => {
  for (const [base, accent, expected] of legacy) {
    assert.equal(digest(deriveTheme(base, accent).colors), expected);
    for (const background of [undefined, '#000000', '#121212', '#6E452F', '#0000FF', '#757575']) {
      const theme = make({ base, accent, background });
      assert.equal(theme.appearance, 'dark');
      assert.equal(digest(theme.colors), expected, `${base} ${accent} ${background}`);
      assert.deepEqual(theme, { name: 'light-test', appearance: 'dark', colors: deriveTheme(base, accent).colors });
    }
  }
});

test('light detection uses the rounded WCAG luminance crossover of 0.179', () => {
  for (const color of ['#FFFFFF', '#FAF7F2', '#E1EDF9', '#FFEDCE', '#00FF00', '#00FFFF',
    '#BCBCBC', '#AAAAAA', '#808080', '#767676', '#FF0000', '#008A00', '#EE0000']) {
    assert.ok(luminance(color) >= 0.179, color);
    assert.equal(isLightBackground(color), true, color);
    assert.equal(make({ background: color }).appearance, 'light', color);
  }
  for (const color of ['#000000', '#757575', '#0000FF', '#008900']) {
    assert.ok(luminance(color) < 0.179, color);
    assert.equal(isLightBackground(color), false, color);
    assert.equal(make({ background: color }).appearance, 'dark', color);
  }
  assert.ok(contrast('#000000', '#767676') > contrast('#FFFFFF', '#767676'));
  assert.ok(contrast('#FFFFFF', '#757575') > contrast('#000000', '#757575'));
  assert.equal(isLightBackground('#ffffff'), true);
  assert.equal(contrastRatio('#000000', '#FFFFFF'), 21);
  assert.equal(contrastRatio('#aabbcc', '#12ab34'), contrast('#AABBCC', '#12AB34'));
});

test('light palettes have exactly 55 literal roles and no exported preview background', () => {
  const keys = Object.keys(deriveTheme().colors);
  assert.equal(keys.length, 55);
  for (const background of ['#FFFFFF', '#FAF7F2', '#E1EDF9', '#FFEDCE', '#00FF00', '#BCBCBC',
    '#AAAAAA', '#808080', '#767676']) {
    const theme = make({ background });
    assert.equal(theme.name, 'light-test');
    assert.equal(theme.appearance, 'light');
    assert.deepEqual(Object.keys(theme).sort(), ['appearance', 'colors', 'name']);
    assert.deepEqual(Object.keys(theme.colors), keys);
    assert.deepEqual(JSON.parse(JSON.stringify(theme)), theme);
    for (const color of Object.values(theme.colors)) assert.match(color, /^#[0-9A-F]{6}$/);
    for (const key of ['background', 'terminalBg', 'pageBg', 'export']) {
      assert.equal(Object.hasOwn(theme, key), false);
      assert.equal(Object.hasOwn(theme.colors, key), false);
    }
  }
});

test('light fills stay pale and distinct, and generated role contrast meets 4.5:1', () => {
  // Boundary gray and near-boundary red/green also exercise the darkest
  // foreground adjustments, rather than only testing pale backgrounds.
  for (const background of ['#FFFFFF', '#FAF7F2', '#E1EDF9', '#FFEDCE', '#00FF00', '#00FFFF', '#BCBCBC',
    '#AAAAAA', '#808080', '#767676', '#FF0000', '#008A00', '#EE0000']) {
    for (const base of [undefined, '#000000', '#FFFFFF', '#808080', '#FF0000', '#00FF00', '#0000FF', '#294E73']) {
      for (const accent of [undefined, '#EA2175', '#000000', '#FFFFFF', '#3366CC', '#00FF00']) {
        const options = { background, base, accent };
        const theme = make(options);
        const colors = theme.colors;
        const label = JSON.stringify(options);
        assert.deepEqual(make(options), theme, label);
        assert.equal(new Set(fills.map(role => colors[role])).size, fills.length, label);
        for (const role of fills) {
          assert.ok(hsl(colors[role]).l >= 0.83, `${label}: ${role} is pale`);
          assert.ok(hsl(colors[role]).s > 0, `${label}: ${role} is tinted`);
        }
        assert.ok(hsl(colors.text).l <= 0.23, label);
        const all = [background, ...fills.map(role => colors[role])];
        readable(colors, ['text', 'muted', 'dim', 'thinkingText'], all, label);
        readable(colors, ['userMessageText'], [colors.userMessageBg, colors.selectedBg], label);
        readable(colors, ['customMessageText', 'customMessageLabel'], [colors.customMessageBg, colors.selectedBg], label);
        readable(colors, ['searchMatchText'], [colors.searchMatchBg], label);
        readable(colors, ['toolTitle', 'toolOutput', 'toolDiffAdded', 'toolDiffRemoved', 'toolDiffContext'],
          [...tools.map(role => colors[role]), colors.selectedBg], label);
        const shared = [background, ...fills.filter(role => role !== 'searchMatchBg').map(role => colors[role])];
        readable(colors, [...syntax, ...markdown, ...accents], shared, label);
      }
    }
  }
});

test('light foregrounds preserve original hue relationships and chromatic role saturation', () => {
  for (const base of ['#6E452F', '#294E73', '#00FF00', '#000000', '#FFFFFF']) {
    for (const accent of [undefined, '#3366CC', '#EA2175', '#000000']) {
      const original = deriveTheme(base, accent).colors;
      const light = make({ base, accent, background: '#FAF7F2' }).colors;
      // Near-white fills have only a few RGB steps of chroma. Rounded hues
      // can move, but channel order must not reverse the original hue family.
      for (const role of fills) {
        const before = rgb(original[role]);
        const after = rgb(light[role]);
        for (const [a, b] of [[0, 1], [1, 2], [0, 2]]) {
          assert.ok((before[a] - before[b]) * (after[a] - after[b]) >= 0, `${base} ${accent}: ${role}`);
        }
      }
      for (const role of Object.keys(original).filter(role => !fills.includes(role))) {
        assert.ok(hueDistance(hsl(original[role]).h, hsl(light[role]).h) < 6, `${base} ${accent}: ${role}`);
      }
      for (const role of [...accents, 'syntaxKeyword', 'syntaxFunction', 'syntaxString', 'syntaxType']) {
        assert.ok(hsl(light[role]).s >= 0.43, `${base} ${accent}: ${role} stays saturated`);
      }
      // Different seed families can intentionally converge. Keyword/type are
      // in the same accent family, so their semantic hue gap must remain.
      assert.ok(hueDistance(hsl(light.syntaxType).h, hsl(light.syntaxKeyword).h) > 20);
      assert.ok(hueDistance(hsl(light.success).h, hsl(light.error).h) > 20);
    }
  }
});

test('invalid backgrounds and color seeds reject without coercion', () => {
  const invalid = [null, 123456, {}, [], new String('#FFFFFF'), '', 'white', '#fff',
    '#12345678', 'FFFFFF', '#GGGGGG', ' #FFFFFF', '#FFFFFF ', '#FFFFFF\n'];
  for (const background of invalid) {
    assert.throws(() => make({ background }), TypeError);
    assert.throws(() => isLightBackground(background), TypeError);
  }
  assert.throws(() => isLightBackground(undefined), TypeError);
  for (const key of ['base', 'accent']) {
    for (const value of invalid) assert.throws(() => make({ background: '#FFFFFF', [key]: value }), TypeError);
  }
});

test('theme names retain validation and valid names verbatim', () => {
  for (const name of ['A', 'theme_123-v2', 'a'.repeat(64)]) {
    assert.equal(make({ name, background: '#FFFFFF' }).name, name);
  }
  for (const name of [undefined, null, 1, {}, '', '-theme', 'a b', 'a/b', 'a'.repeat(65),
    'dark', 'LIGHT', 'system', 'CON', 'nul', 'COM1', 'lpt9']) {
    assert.throws(() => make({ name, background: '#FFFFFF' }), TypeError);
  }
});

test('sparse overrides apply last verbatim in both appearances and do not mutate inputs', () => {
  const overrides = Object.freeze({ text: '#fAfAfA', syntaxKeyword: '#aBcDeF', userMessageBg: '#010203' });
  const original = { ...overrides };
  for (const background of [undefined, '#101010', '#FFFFFF']) {
    const options = Object.freeze({ name: 'manual', base: '#294E73', accent: '#3366CC', background, overrides });
    const expected = make({ ...options, overrides: {} });
    const theme = createTheme(options);
    assert.equal(theme.name, 'manual');
    assert.equal(theme.appearance, expected.appearance);
    assert.deepEqual(theme.colors, { ...expected.colors, ...overrides });
    assert.deepEqual(overrides, original);
    assert.equal(Object.keys(theme.colors).length, 55);
    if (background === '#FFFFFF') assert.ok(contrast(theme.colors.text, background) < 4.5);
    theme.colors.text = '#000000';
    assert.equal(createTheme(options).colors.text, '#fAfAfA');
    assert.notEqual(theme.colors, createTheme(options).colors);
  }
  const nullPrototype = Object.assign(Object.create(null), { mdHeading: '#010203' });
  assert.equal(make({ background: '#FFFFFF', overrides: nullPrototype }).colors.mdHeading, '#010203');
  assert.deepEqual(make({ overrides: undefined }), make({}));
});

test('every existing schema role can be overridden without adding export keys', () => {
  const overrides = Object.fromEntries(Object.keys(deriveTheme().colors).map(role => [role, '#aBcDeF']));
  for (const background of [undefined, '#FFFFFF']) {
    const theme = make({ background, overrides });
    assert.deepEqual(theme.colors, overrides);
    assert.equal(Object.keys(theme.colors).length, 55);
  }
});

test('overrides reject wrong object types, unknown roles, invalid colors and property injection', () => {
  for (const overrides of [null, false, 0, '', '#FFFFFF', [], new Date(), new Map(),
    { background: '#FFFFFF' }, { pageBg: '#FFFFFF' }, { terminalBg: '#FFFFFF' },
    { appearance: '#FFFFFF' }, { name: '#FFFFFF' }, { Text: '#FFFFFF' },
    { text: undefined }, { text: null }, { text: 123456 }, { text: '#fff' },
    { text: '#12345678' }, { text: '#FFFFFF\n' }, { text: new String('#FFFFFF') },
    { constructor: '#FFFFFF' }, { toString: '#FFFFFF' },
    JSON.parse('{"__proto__":"#FFFFFF"}'), { [Symbol('text')]: '#FFFFFF' },
    Object.create({ text: '#FFFFFF' }),
    Object.defineProperty({}, 'pageBg', { value: '#FFFFFF' }),
    Object.defineProperty({}, 'text', { get() { throw new Error('must not invoke accessor'); } }),
  ]) {
    for (const background of [undefined, '#FFFFFF']) {
      assert.throws(() => make({ background, overrides }), TypeError);
    }
  }
  assert.equal({}.pageBg, undefined);
});
