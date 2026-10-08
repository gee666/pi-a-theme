import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, dirname } from 'node:path';
import { DEFAULT_COLOR, deriveTheme, normalizeColor } from './palette.mjs';

export function paths(agentDir) {
  return {
    config: join(agentDir, 'a-theme.json'),
    theme: join(agentDir, 'themes', 'a-theme.json'),
  };
}

export function readSettings(agentDir) {
  const file = paths(agentDir).config;
  if (!existsSync(file)) return { color: DEFAULT_COLOR };
  const value = JSON.parse(readFileSync(file, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid a-theme settings');
  }
  return {
    color: normalizeColor(value.color),
    ...(value.accent !== undefined ? { accent: normalizeColor(value.accent) } : {}),
  };
}

function writeJson(file, value) {
  const content = JSON.stringify(value, null, 2) + '\n';
  if (existsSync(file) && readFileSync(file, 'utf8') === content) return;
  mkdirSync(dirname(file), { recursive: true });
  const staging = join(dirname(file), 'tmp');
  mkdirSync(staging, { recursive: true });
  const temporary = join(staging, `a-theme-${randomUUID()}.json`);
  try {
    writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx' });
    renameSync(temporary, file);
  } finally {
    rmSync(temporary, { force: true });
  }
}

export function generateTheme(agentDir) {
  const settings = readSettings(agentDir);
  const file = paths(agentDir).theme;
  writeJson(file, deriveTheme(settings.color, settings.accent));
  return file;
}

export function saveSettings(agentDir, settings) {
  // Validate everything before writing. The generated theme is rebuilt on reload.
  const validated = {
    color: normalizeColor(settings.color),
    ...(settings.accent !== undefined ? { accent: normalizeColor(settings.accent) } : {}),
  };
  writeJson(paths(agentDir).config, validated);
}
