import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { registerTheme } from '../src/commands.mjs';
import { paths, readSettings, generateTheme } from '../src/storage.mjs';
import { deriveTheme } from '../src/palette.mjs';

const tmp = fileURLToPath(new URL('../tmp/', import.meta.url));
mkdirSync(tmp, { recursive: true });
function setup(t) {
  const dir = mkdtempSync(join(tmp, 'commands-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const commands = new Map(), events = new Map(), notices = [], themes = [];
  const pi = { registerCommand: (name, spec) => commands.set(name, spec), on: (name, fn) => events.set(name, fn) };
  registerTheme(pi, dir);
  let reloads = 0;
  const ctx = {
    hasUI: true, mode: 'tui', waitForIdle: async () => {},
    reload: async () => { reloads++; events.get('resources_discover')(); },
    ui: {
      input: async () => undefined,
      notify: (...args) => notices.push(args),
      setTheme: name => { themes.push(name); return { success: true }; },
    },
  };
  return { dir, ctx, commands, events, notices, themes, reloads: () => reloads,
    run: (name, args = '') => commands.get(name).handler(args, ctx),
    theme: () => JSON.parse(readFileSync(paths(dir).theme, 'utf8')),
  };
}

test('generates the default theme before startup and exposes its resource', t => {
  const s = setup(t);
  assert.deepEqual(s.theme(), deriveTheme());
  assert.deepEqual(s.events.get('resources_discover')(), { themePaths: [paths(s.dir).theme] });
  assert.equal(s.events.has('session_start'), false);
  assert.deepEqual(s.themes, []); // Installing does not switch themes.
});

test('base command persists and reloads the palette', async t => {
  const s = setup(t);
  await s.run('a-theme-color', ' #335599 ');
  assert.deepEqual(readSettings(s.dir), { color: '#335599' });
  assert.deepEqual(s.theme(), deriveTheme('#335599'));
  assert.deepEqual(s.themes, ['a-theme']);
  assert.equal(s.reloads(), 1);
  assert.deepEqual(s.notices, []);
});

test('accent is independent, survives base changes and supports auto reset', async t => {
  const s = setup(t);
  await s.run('a-theme-accent', '#abcdef');
  await s.run('a-theme-color', '#446688');
  assert.deepEqual(readSettings(s.dir), { color: '#446688', accent: '#ABCDEF' });
  assert.deepEqual(s.theme(), deriveTheme('#446688', '#ABCDEF'));
  await s.run('a-theme-accent', 'auto');
  assert.deepEqual(readSettings(s.dir), { color: '#446688' });
  assert.deepEqual(s.theme(), deriveTheme('#446688'));
});

test('missing arguments prompt; cancelling leaves preferences alone', async t => {
  const s = setup(t);
  await s.run('a-theme-color');
  assert.equal(s.reloads(), 0);
  s.ctx.ui.input = async () => '#8844aa';
  await s.run('a-theme-color');
  assert.equal(readSettings(s.dir).color, '#8844AA');
});

test('invalid commands do not save or select a theme', async t => {
  const s = setup(t);
  for (const input of ['#abc', 'blue', '#123456 trailing', '#ZZZZZZ', 'auto']) {
    await s.run('a-theme-color', input);
  }
  assert.equal(s.notices.length, 5);
  assert.deepEqual(readSettings(s.dir), { color: '#6E452F' });
  assert.equal(s.reloads(), 0);
  assert.deepEqual(s.themes, []);
});

test('non-interactive modes leave settings unchanged', async t => {
  const s = setup(t);
  s.ctx.mode = 'rpc';
  await s.run('a-theme-color', '#123456');
  assert.equal(s.notices[0][1], 'warning');
  assert.equal(s.reloads(), 0);
});

test('settings survive extension recreation', async t => {
  const s = setup(t);
  await s.run('a-theme-color', '#226655');
  registerTheme({ on() {}, registerCommand() {} }, s.dir);
  assert.deepEqual(s.theme(), deriveTheme('#226655'));
});

test('malformed settings are reported without being overwritten', t => {
  const s = setup(t);
  writeFileSync(paths(s.dir).config, '{broken');
  assert.throws(() => generateTheme(s.dir));
  assert.equal(readFileSync(paths(s.dir).config, 'utf8'), '{broken');
});

test('failed theme selection reports the saved state without reloading', async t => {
  const s = setup(t);
  s.ctx.ui.setTheme = () => ({ success: false, error: 'missing theme' });
  await s.run('a-theme-color', '#4488AA');
  assert.equal(readSettings(s.dir).color, '#4488AA');
  assert.equal(s.reloads(), 0);
  assert.match(s.notices[0][0], /Colors saved/);
});

test('implementation contains no terminal control writes', () => {
  for (const file of ['../src/commands.mjs', '../src/storage.mjs', '../extensions/a-theme.ts']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /process\.(stdout|stderr)|\\x1b|\\u001b/);
  }
});
