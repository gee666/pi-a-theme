import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, test } from 'node:test';
import { deriveTheme } from '../src/palette.ts';

// Use the host's actual Input/key parser. No install or runtime dependency changes.
// For a global Pi install, set PI_OVERLAY_HOST to its pi-coding-agent directory.
let host;
try {
  const local = createRequire(import.meta.url);
  host = createRequire(process.env.PI_OVERLAY_HOST
    ? resolve(process.env.PI_OVERLAY_HOST, 'package.json')
    : local.resolve('@earendil-works/pi-coding-agent'));
} catch { /* Pure palette/command tests still run without a Pi host. */ }

let createColorOverlay, tui;
if (host) {
  const { createJiti } = await import(pathToFileURL(host.resolve('jiti')).href);
  const load = createJiti(import.meta.url, {
    fsCache: false,
    moduleCache: false,
    alias: { '@earendil-works/pi-tui': host.resolve('@earendil-works/pi-tui') },
  });
  ({ createColorOverlay } = await load.import('../src/color-overlay.ts'));
  tui = await import(pathToFileURL(host.resolve('@earendil-works/pi-tui')).href);
}

const keys = { tab: '\t', backTab: '\x1b[Z', enter: '\r', ctrlEnter: '\x1b[13;5u', esc: '\x1b' };
const initial = { color: '#6E452F' };
function harness(settings = initial, previewEffect, terminalColor) {
  const previews = [], results = [];
  let renders = 0;
  const theme = {
    fg: (_role, value) => value,
    bold: value => value,
    style: (value, options) => tui.styleText(value, {
      fg: typeof options.fg === 'string' ? tui.parseColor('#EA2175') : options.fg,
      bg: options.bg, inverse: options.inverse,
    }, 'truecolor'),
  };
  const overlay = createColorOverlay({ requestRender: () => renders++ }, theme, settings,
    value => { previews.push({ ...value }); previewEffect?.(value); },
    value => results.push(value), terminalColor);
  overlay.focused = true;
  return { overlay, previews, results, get renders() { return renders; } };
}
function press(h, ...data) { for (const key of data) h.overlay.handleInput(key); }
function tabs(h, count) { for (let i = 0; i < count; i++) press(h, keys.tab); }
function replace(h, value) { press(h, '\x01', '\x0b', `\x1b[200~${value}\x1b[201~`); }
const plain = h => h.overlay.render(56).map(tui.stripTerminalSequences).join('\n');
const markers = lines => lines.join('').split(tui.CURSOR_MARKER).length - 1;

// Rendering is tested at the component level, not through a second terminal.
describe('color overlay with native Pi Input', { skip: !host && 'Pi host unavailable; set PI_OVERLAY_HOST' }, () => {
  test('opening values are normalized, previewed, and copied', () => {
    const input = { color: '#6e452f', accent: '#ea2175' };
    const h = harness(input, value => { value.color = '#000000'; });
    assert.deepEqual(h.previews, [{ color: '#6E452F', accent: '#EA2175' }]);
    assert.deepEqual(input, { color: '#6e452f', accent: '#ea2175' });
    press(h, keys.ctrlEnter);
    assert.deepEqual(h.results, [{ color: '#6E452F', accent: '#EA2175' }]);
  });

  test('Tab and Shift+Tab wrap through fields and buttons with one IME cursor', () => {
    const h = harness();
    assert.equal(markers(h.overlay.render(56)), 1);
    press(h, keys.tab);
    const accentLines = h.overlay.render(56);
    assert.equal(markers(accentLines), 1);
    assert.match(tui.stripTerminalSequences(accentLines.find(line => line.includes(tui.CURSOR_MARKER))), /Accent/);
    tabs(h, 4);
    assert.equal(markers(h.overlay.render(56)), 0);
    press(h, keys.tab);
    assert.equal(markers(h.overlay.render(56)), 1);
    press(h, keys.backTab, keys.enter);
    assert.deepEqual(h.results, [undefined]);
  });

  test('Enter in fields never applies; Apply focus and Ctrl+Enter apply both fields', () => {
    const h = harness();
    press(h, keys.enter);
    replace(h, '#123abc');
    press(h, keys.enter);
    assert.deepEqual(h.results, []);
    tabs(h, 2);
    press(h, keys.enter);
    assert.deepEqual(h.results, [{ color: '#6E452F', accent: '#123ABC' }]);
    const global = harness({ color: '#123456', accent: '#abcdef' });
    press(global, keys.ctrlEnter);
    assert.deepEqual(global.results, [{ color: '#123456', accent: '#ABCDEF' }]);
  });

  test('invalid drafts block preview and Apply until both fields are valid', () => {
    const h = harness();
    const before = plain(h);
    replace(h, '#oops');
    assert.equal(h.previews.length, 1);
    assert.match(plain(h), /Base needs #RRGGBB/);
    press(h, keys.ctrlEnter);
    assert.deepEqual(h.results, []);
    replace(h, '#123456');
    assert.equal(h.previews.length, 2);
    assert.notEqual(plain(h), before);
    press(h, keys.tab);
    replace(h, '#gggggg');
    replace(h, '#12345');
    assert.equal(h.previews.length, 2);
    press(h, keys.ctrlEnter);
    assert.deepEqual(h.results, []);
    replace(h, '#ABCDEF');
    assert.deepEqual(h.previews.at(-1), { color: '#123456', accent: '#ABCDEF' });
    press(h, keys.ctrlEnter);
    assert.deepEqual(h.results, [{ color: '#123456', accent: '#ABCDEF' }]);
  });

  test('Auto toggles preserve the manual draft; blank means automatic; Reset restores opening values', () => {
    const h = harness({ color: '#6E452F', accent: '#3366CC' });
    tabs(h, 2);
    press(h, keys.enter);
    assert.deepEqual(h.previews.at(-1), initial);
    assert.match(plain(h), /\[x Auto accent\]/);
    press(h, ' ');
    assert.deepEqual(h.previews.at(-1), { color: '#6E452F', accent: '#3366CC' });
    press(h, keys.backTab);
    replace(h, '');
    assert.deepEqual(h.previews.at(-1), initial);
    tabs(h, 2);
    press(h, keys.enter);
    assert.deepEqual(h.previews.at(-1), { color: '#6E452F', accent: '#3366CC' });
    assert.equal(h.results.length, 0);
    const auto = harness();
    tabs(auto, 2);
    press(auto, keys.enter);
    assert.ok(auto.previews.at(-1).accent);
  });

  test('Reset restores both opening fields after edits, without applying', () => {
    const settings = { color: '#6e452f', accent: '#3366cc' };
    const h = harness(settings);
    settings.color = '#FFFFFF';
    replace(h, '#123456');
    press(h, keys.tab);
    replace(h, '#ABCDEF');
    tabs(h, 2);
    press(h, keys.enter);
    assert.deepEqual(h.previews.at(-1), { color: '#6E452F', accent: '#3366CC' });
    assert.deepEqual(h.results, []);
    press(h, keys.ctrlEnter);
    assert.deepEqual(h.results, [{ color: '#6E452F', accent: '#3366CC' }]);
  });

  test('Terminal is absent without a seed and preserves the original button order', () => {
    const h = harness();
    assert.doesNotMatch(plain(h), /\[Terminal\]/);
    replace(h, '#123456');
    tabs(h, 3);
    press(h, keys.enter);
    assert.deepEqual(h.previews.at(-1), initial, 'fourth control is still Reset');
    press(h, keys.tab, keys.enter);
    assert.deepEqual(h.results, [initial]);
  });

  test('Terminal previews the supplied base, keeps the accent, and Reset restores opening values', () => {
    const opening = { color: '#6E452F', accent: '#3366CC' };
    const h = harness(opening, undefined, '#294c77');
    assert.match(plain(h), /\[Terminal\]/);
    assert.deepEqual(h.previews, [opening], 'terminal seed does not replace opening settings');
    replace(h, '#123456');
    press(h, keys.tab);
    replace(h, '#abcdef');
    tabs(h, 2);
    assert.equal(markers(h.overlay.render(56)), 0);
    press(h, keys.enter);
    assert.deepEqual(h.previews.at(-1), { color: '#294C77', accent: '#ABCDEF' });
    assert.deepEqual(h.results, []);
    press(h, keys.tab, keys.enter);
    assert.deepEqual(h.previews.at(-1), opening);
    press(h, keys.backTab, ' ');
    assert.deepEqual(h.previews.at(-1), { color: '#294C77', accent: '#3366CC' });
    tabs(h, 2);
    press(h, keys.enter);
    assert.deepEqual(h.results, [{ color: '#294C77', accent: '#3366CC' }]);
  });

  test('Terminal preserves automatic accent and the remembered manual choice', () => {
    const h = harness({ color: '#6E452F', accent: '#3366CC' }, undefined, '#294C77');
    tabs(h, 2);
    press(h, keys.enter, keys.tab, keys.enter);
    assert.deepEqual(h.previews.at(-1), { color: '#294C77' });
    assert.match(plain(h), /\[x Auto accent\]/);
    press(h, keys.backTab, keys.enter);
    assert.deepEqual(h.previews.at(-1), { color: '#294C77', accent: '#3366CC' });
    assert.deepEqual(h.results, []);
    const auto = harness(initial, undefined, '#294C77');
    tabs(auto, 3);
    press(auto, keys.enter);
    assert.deepEqual(auto.previews.at(-1), { color: '#294C77' });
  });

  test('Terminal leaves invalid accent drafts intact and respects preview validation', () => {
    const h = harness(initial, undefined, '#294C77');
    press(h, keys.tab);
    replace(h, 'invalid');
    tabs(h, 2);
    press(h, keys.enter);
    assert.deepEqual(h.previews, [initial]);
    assert.match(plain(h), /#294C77/);
    assert.match(plain(h), /invalid/);
    press(h, keys.ctrlEnter);
    assert.deepEqual(h.results, []);
    replace(h, '#ABCDEF');
    assert.deepEqual(h.previews.at(-1), { color: '#294C77', accent: '#ABCDEF' });
  });

  test('Terminal button remains keyboard-accessible and clipped at narrow widths', () => {
    const h = harness(initial, undefined, '#294C77');
    for (const width of [1, 4, 12, 18, 24, 32, 40, 56, 80]) {
      for (const line of h.overlay.render(width)) assert.ok(tui.visibleWidth(line) <= width);
    }
    const narrow = h.overlay.render(24).map(tui.stripTerminalSequences).join('\n');
    assert.match(narrow, /\[Terminal\]/);
    press(h, keys.backTab, keys.tab);
    assert.equal(markers(h.overlay.render(24)), 1, 'focus wraps from Cancel to Base');
    tabs(h, 3);
    press(h, keys.enter, keys.esc);
    assert.deepEqual(h.previews.at(-1), { color: '#294C77' });
    assert.deepEqual(h.results, [undefined]);
  });

  test('native Input handles chunked paste and Kitty Tab without applying', () => {
    const h = harness();
    press(h, '\x01', '\x0b', '\x1b[200~#123', 'abc', '\x1b[201~');
    assert.deepEqual(h.previews.at(-1), { color: '#123ABC' });
    assert.deepEqual(h.results, []);
    press(h, '\x1b[9u');
    const line = h.overlay.render(56).find(line => line.includes(tui.CURSOR_MARKER));
    assert.match(tui.stripTerminalSequences(line), /Accent/);
    press(h, '\x1b[9;2u');
    const baseLine = h.overlay.render(56).find(line => line.includes(tui.CURSOR_MARKER));
    assert.match(tui.stripTerminalSequences(baseLine), /Base/);
  });

  test('samples use the derived text, heading, user and tool colors, including backgrounds', () => {
    const h = harness();
    const assertSamples = settings => {
      const lines = h.overlay.render(56);
      const { colors } = deriveTheme(settings.color, settings.accent);
      for (const [text, fg, bg] of [
        ['Text', 'text'], ['Accent heading', 'mdHeading'],
        ['User: hello', 'userMessageText', 'userMessageBg'],
        ['Tool: done', 'toolTitle', 'toolSuccessBg'],
        ['output.txt', 'toolOutput', 'toolSuccessBg'],
      ]) {
        const line = lines.find(line => tui.stripTerminalSequences(line).includes(text));
        assert.ok(line.includes(tui.foregroundAnsi(tui.parseColor(colors[fg]), 'truecolor')), fg);
        if (bg) assert.ok(line.includes(tui.backgroundAnsi(tui.parseColor(colors[bg]), 'truecolor')), bg);
      }
      assert.ok(!lines.join('').includes('\x1b]'), 'no OSC sequences');
    };
    assertSamples(initial);
    replace(h, '#294C77');
    press(h, keys.tab);
    replace(h, '#D8417F');
    assertSamples({ color: '#294C77', accent: '#D8417F' });
  });

  test('invalid input retains the last valid sample colors', () => {
    const h = harness();
    replace(h, '#294C77');
    const sampleLines = () => h.overlay.render(56).filter(line => /User:|Tool:|output.txt/.test(tui.stripTerminalSequences(line)));
    const before = sampleLines();
    replace(h, 'invalid');
    assert.deepEqual(sampleLines(), before);
    const count = h.previews.length;
    press(h, '\x1b[D', '\x1b[C');
    assert.equal(h.previews.length, count, 'cursor movement does not emit previews');
    assert.ok(h.renders > 0);
  });

  test('resize clips by terminal columns and retains active Input markers, even at tiny widths', () => {
    const h = harness();
    replace(h, '中文👩‍💻'.repeat(12));
    for (const width of [0, 1, 2, 3, 4, 8, 12, 18, 24, 32, 40, 56, 80, 120]) {
      const lines = h.overlay.render(width);
      for (const line of lines) assert.ok(tui.visibleWidth(line) <= width, `width ${width}: ${line}`);
      if (width) assert.equal(markers(lines), 1, `IME at width ${width}`);
    }
    h.overlay.focused = false;
    assert.equal(markers(h.overlay.render(56)), 0);
    h.overlay.focused = true;
    assert.equal(markers(h.overlay.render(56)), 1);
    h.overlay.invalidate();
    assert.equal(markers(h.overlay.render(24)), 1);
  });

  test('Escape cancels once, ignores further input, and disposal clears focus without completion', () => {
    const h = harness();
    replace(h, '#294C77');
    press(h, keys.esc, keys.esc, keys.ctrlEnter);
    assert.deepEqual(h.results, [undefined]);
    assert.equal(markers(h.overlay.render(56)), 0);
    const disposed = harness();
    disposed.overlay.dispose();
    press(disposed, keys.ctrlEnter);
    assert.deepEqual(disposed.results, []);
    assert.equal(markers(disposed.overlay.render(56)), 0);
  });
});
