import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { registerTheme } from '../src/commands.ts';
import { paths, readSettings, generateTheme, saveSettings } from '../src/storage.ts';
import { deriveTheme } from '../src/palette.ts';
import { lighterBase } from '../src/defaults.ts';

const tmp = fileURLToPath(new URL('../tmp/', import.meta.url));
mkdirSync(tmp, { recursive: true });
function setup(t) {
  const dir = mkdtempSync(join(tmp, 'commands-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const commands = new Map(), events = new Map(), notices = [], themes = [];
  let reloads = 0, pickerCalls = 0;
  const original = { name: 'previous-theme' };
  const ctx = {
    hasUI: true, mode: 'tui', waitForIdle: async () => {},
    reload: async () => { reloads++; events.get('resources_discover')(); },
    ui: { theme: original,
      getTheme: name => name === original.name ? original : undefined,
      notify: (...args) => notices.push(args),
      setTheme: value => { themes.push(value); ctx.ui.theme = value; return { success: true }; },
    },
  };
  const adapter = {
    terminalColor: () => '#444444',
    previewTheme: settings => ({ name: 'preview', settings }),
    openPicker: async () => undefined,
  };
  registerTheme({ registerCommand: (name, spec) => commands.set(name, spec), on: (name, fn) => events.set(name, fn) }, dir,
    { ...adapter, openPicker: (...args) => { pickerCalls++; return adapter.openPicker(...args); } });
  return { dir, ctx, commands, events, notices, themes, original, adapter,
    reloads: () => reloads, pickerCalls: () => pickerCalls,
    run: () => commands.get('a-theme-colors').handler('', ctx),
    theme: () => JSON.parse(readFileSync(paths(dir).theme, 'utf8')),
  };
}

test('only the combined command is registered; discovery uses terminal-derived defaults', t => {
  const s = setup(t);
  assert.deepEqual([...s.commands.keys()], ['a-theme-colors']);
  assert.deepEqual(readSettings(s.dir, '#444444'), { color: '#444444' });
  assert.deepEqual(readSettings(s.dir), { color: '#2E2E2E' });
  assert.deepEqual(s.theme(), deriveTheme('#444444'));
  assert.deepEqual(s.events.get('resources_discover')(), { themePaths: [paths(s.dir).theme] });
  assert.deepEqual(s.themes, []);
  assert.equal(existsSync(paths(s.dir).config), false);
});

test('live previews do not save; Apply persists both colors and reloads once', async t => {
  const s = setup(t);
  const selected = { color: '#EB7168', accent: '#CC457D' };
  s.adapter.openPicker = async (ctx, initial, preview, terminalColor) => {
    assert.deepEqual(initial, { color: '#444444' });
    assert.equal(terminalColor, '#444444');
    preview({ color: '#225588' });
    preview(selected);
    assert.equal(existsSync(paths(s.dir).config), false);
    assert.deepEqual(s.theme(), deriveTheme('#444444'));
    return selected;
  };
  await s.run();
  assert.deepEqual(readSettings(s.dir), selected);
  assert.deepEqual(s.theme(), deriveTheme(selected.color, selected.accent));
  assert.equal(s.themes.length, 3);
  assert.equal(s.themes.at(-1), 'a-theme');
  assert.equal(s.reloads(), 1);
  assert.deepEqual(s.notices, []);
});

test('Cancel restores the exact previous theme and never persists a preview', async t => {
  const s = setup(t);
  saveSettings(s.dir, { color: '#EB7168', accent: '#CC457D' });
  s.adapter.openPicker = async (_ctx, initial, preview) => {
    assert.deepEqual(initial, { color: '#EB7168', accent: '#CC457D' });
    preview({ color: '#123456' });
    return undefined;
  };
  await s.run();
  assert.equal(s.themes.at(-1), s.original);
  assert.deepEqual(readSettings(s.dir), { color: '#EB7168', accent: '#CC457D' });
  assert.equal(s.reloads(), 1);
});

test('Cancel does not retain Pi\'s live theme proxy as the rollback target', async t => {
  const s = setup(t);
  let active = s.original;
  const proxy = new Proxy({}, { get: (_target, key) => active[key] });
  Object.defineProperty(s.ctx.ui, 'theme', { get: () => proxy });
  s.ctx.ui.setTheme = value => {
    assert.notEqual(value, proxy);
    active = value;
    return { success: true };
  };
  s.adapter.openPicker = async (_ctx, _initial, preview) => {
    preview({ color: '#123456' });
    assert.equal(proxy.name, 'preview');
    return undefined;
  };
  await s.run();
  assert.equal(active, s.original);
  assert.equal(s.reloads(), 1);
  assert.deepEqual(s.notices, []);
});

test('Apply auto accent removes a previously saved accent', async t => {
  const s = setup(t);
  saveSettings(s.dir, { color: '#EB7168', accent: '#CC457D' });
  s.adapter.openPicker = async () => ({ color: '#EB7168' });
  await s.run();
  assert.deepEqual(readSettings(s.dir), { color: '#EB7168' });
});

test('preview errors restore the original theme without saving', async t => {
  const s = setup(t);
  s.adapter.openPicker = async (_ctx, _initial, preview) => {
    preview({ color: '#112233' });
    throw new Error('Preview failed');
  };
  await s.run();
  assert.equal(s.themes.at(-1), s.original);
  assert.equal(existsSync(paths(s.dir).config), false);
  assert.equal(s.notices[0][0], 'Preview failed');
  assert.equal(s.reloads(), 1);
});

test('non-interactive modes do not open a picker or change settings', async t => {
  const s = setup(t);
  s.ctx.mode = 'rpc';
  await s.run();
  assert.equal(s.pickerCalls(), 0);
  assert.equal(s.notices[0][1], 'warning');
});

test('malformed settings are reported without overwriting them', async t => {
  const s = setup(t);
  writeFileSync(paths(s.dir).config, '{broken');
  await s.run();
  assert.equal(s.pickerCalls(), 0);
  assert.equal(s.notices[0][1], 'error');
  assert.equal(readFileSync(paths(s.dir).config, 'utf8'), '{broken');
});

test('saved colors override the terminal-derived defaults', t => {
  const s = setup(t);
  saveSettings(s.dir, { color: '#EB7168', accent: '#CC457D' });
  generateTheme(s.dir, '#888888');
  assert.deepEqual(s.theme(), deriveTheme('#EB7168', '#CC457D'));
});

test('lighter default mixes 18% white, preserves channel ordering and handles extremes', () => {
  assert.equal(lighterBase('#000000'), '#2E2E2E');
  assert.equal(lighterBase('#111111'), '#3C3C3C');
  assert.equal(lighterBase('#FFFFFF'), '#FFFFFF');
  assert.equal(lighterBase('#203040'), '#485562');
  assert.throws(() => lighterBase('invalid'));
});

test('implementation does not write terminal control sequences', () => {
  for (const file of ['../src/commands.ts', '../src/storage.ts', '../src/pi-theme.ts', '../extensions/a-theme.ts']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /process\.(stdout|stderr)|\\x1b|\\u001b/);
  }
});
