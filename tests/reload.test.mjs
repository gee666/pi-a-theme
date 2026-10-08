import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
let hostRoot = process.env.PI_OVERLAY_HOST;
if (!hostRoot) {
  try { hostRoot = dirname(dirname(createRequire(import.meta.url).resolve('@earendil-works/pi-coding-agent'))); }
  catch { /* The host-dependent regression is optional outside a Pi install. */ }
}

test('Pi reload removes legacy commands and refreshes imported TypeScript modules', {
  skip: !hostRoot && 'Set PI_OVERLAY_HOST to test the real Pi loader',
}, async () => {
  mkdirSync(join(root, 'tmp'), { recursive: true });
  const dir = mkdtempSync(join(root, 'tmp', 'reload-test-'));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = join(dir, 'agent');
  try {
    cpSync(join(root, 'src'), join(dir, 'src'), { recursive: true });
    cpSync(join(root, 'extensions'), join(dir, 'extensions'), { recursive: true });
    cpSync(join(root, 'package.json'), join(dir, 'package.json'));
    const entry = join(dir, 'extensions', 'a-theme.ts');
    const currentEntry = readFileSync(entry, 'utf8');
    // Reproduce a process that already imported the old native ESM module.
    writeFileSync(join(dir, 'src', 'commands.mjs'), `export function registerTheme(pi) {
      for (const name of ['a-theme-color', 'a-theme-accent']) {
        pi.registerCommand(name, {description:'legacy', handler:async()=>{}});
      }
    }`);
    writeFileSync(entry, `import {registerTheme} from '../src/commands.mjs';
      export default function(pi) {registerTheme(pi);}`);
    const { DefaultResourceLoader } = await import(pathToFileURL(resolve(hostRoot, 'dist/core/resource-loader.js')).href);
    const loader = new DefaultResourceLoader({
      cwd: dir, agentDir: process.env.PI_CODING_AGENT_DIR,
      additionalExtensionPaths: [entry], noContextFiles: true, noSkills: true, noPromptTemplates: true,
    });
    const commands = async () => {
      await loader.reload();
      const loaded = loader.getExtensions();
      assert.deepEqual(loaded.errors, []);
      return [...loaded.extensions.find(extension => extension.path === entry).commands.keys()];
    };
    assert.deepEqual(await commands(), ['a-theme-color', 'a-theme-accent']);
    writeFileSync(entry, currentEntry);
    assert.deepEqual(await commands(), ['a-theme-colors']);
    const commandFile = join(dir, 'src', 'commands.ts');
    const source = readFileSync(commandFile, 'utf8');
    writeFileSync(commandFile, source.replace("'a-theme-colors'", "'a-theme-colors-test'"));
    assert.deepEqual(await commands(), ['a-theme-colors-test']);
    writeFileSync(commandFile, source);
    assert.deepEqual(await commands(), ['a-theme-colors']);
  } finally {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    rmSync(dir, { recursive: true, force: true });
  }
});
