import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// npm provides its CLI path on every supported platform, including Windows.
// Run it through Node with explicit arguments, without a shell.
const npmCli = process.env.npm_execpath;
assert.ok(npmCli, 'Run this validator with npm run test:pi');
const prefix = new URL('../tmp/pi-validation/', import.meta.url);
mkdirSync(prefix, { recursive: true });
execFileSync(process.execPath, [
  npmCli, 'install', '--prefix', fileURLToPath(prefix),
  '--no-save', '--package-lock=false', '--ignore-scripts',
  '@earendil-works/pi-coding-agent@latest',
], { stdio: 'inherit', timeout: 180000 });

const piRoot = new URL('node_modules/@earendil-works/pi-coding-agent/', prefix);
const installed = JSON.parse(readFileSync(new URL('package.json', piRoot), 'utf8'));
const latest = execFileSync(process.execPath,
  [npmCli, 'view', '@earendil-works/pi-coding-agent@latest', 'version'],
  { encoding: 'utf8', timeout: 30000 }).trim();
assert.equal(installed.version, latest, 'Installed Pi does not match the latest npm release');
// These internal validation entry points intentionally track the latest Pi.
const { validateThemeJson } = await import(new URL('dist/modes/interactive/theme/theme-schema.js', piRoot));
const { loadThemeFromPath, setThemeJsonValidator } = await import(new URL('dist/modes/interactive/theme/theme.js', piRoot));
setThemeJsonValidator(validateThemeJson);

function checkTheme(path) {
  const json = JSON.parse(readFileSync(path, 'utf8'));
  validateThemeJson(path, json);
  assert.throws(() => validateThemeJson('invalid', { ...json, colors: {} }));
  const theme = loadThemeFromPath(path);
  assert.equal(theme.name, json.name);
  assert.equal(typeof theme.fg('text', 'validation'), 'string');
  assert.equal(typeof theme.bg('userMessageBg', 'validation'), 'string');
  console.log(`Pi ${installed.version}: schema and loader passed for ${json.name}`);
}

await import(new URL('../src/palette.js', import.meta.url));
const { createTheme } = globalThis.PiPalette;
const cases = [
  { name: 'validation-dark', base: '#CD9D8A', accent: '#CC397B', background: '#171717' },
  { name: 'validation-light', base: '#CD9D8A', accent: '#CC397B', background: '#FFFFFF' },
  { name: 'validation-overrides', base: '#000000', background: '#FFFFFF',
    overrides: { accent: '#123456', userMessageBg: '#654321' } },
];
const outputDir = new URL('../tmp/pi-validation/generated/', import.meta.url);
mkdirSync(outputDir, { recursive: true });
for (const options of cases) {
  const file = new URL(`${options.name}.json`, outputDir);
  writeFileSync(file, JSON.stringify(createTheme(options)));
  checkTheme(fileURLToPath(file));
}
