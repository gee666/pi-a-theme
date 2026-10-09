import assert from 'node:assert/strict';
import { Blob } from 'node:buffer';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createContext, runInContext } from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const paletteSource = readFileSync(new URL('../src/palette.js', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const storageKey = 'a-theme-studio-v1';
const defaults = {
  name: 'my-pi-theme', background: '#171717', base: '#CD9D8A',
  accent: '#CC397B', autoAccent: false,
};
const fields = ['background', 'base', 'accent'];
const plain = value => JSON.parse(JSON.stringify(value));

// Only the DOM operations used by app.js. Native color inputs serialize their
// values in lowercase; text inputs preserve incomplete input until blur.
class Element {
  constructor(tagName, attributes = {}, downloads = []) {
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map(Object.entries(attributes));
    this.type = attributes.type;
    this.children = [];
    this.listeners = new Map();
    this.parentNode = null;
    this.disabled = Object.hasOwn(attributes, 'disabled');
    this.checked = Object.hasOwn(attributes, 'checked');
    this.textContent = '';
    this.downloads = downloads;
    const properties = new Map();
    this.style = {
      properties,
      setProperty: (name, value) => properties.set(name, String(value)),
      getPropertyValue: name => properties.get(name) ?? '',
    };
    this.value = attributes.value ?? '';
  }
  set value(value) {
    this.valueWrites = (this.valueWrites ?? 0) + 1;
    const text = String(value);
    this._value = this.type === 'color'
      ? (/^#[0-9a-f]{6}$/i.test(text) ? text.toLowerCase() : '#000000')
      : text;
  }
  get value() { return this._value; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(callback);
  }
  dispatch(type) {
    const event = {
      type, target: this, currentTarget: this, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
    };
    for (const callback of this.listeners.get(type) ?? []) callback(event);
    return event;
  }
  append(...children) {
    for (const child of children) {
      child.remove();
      child.parentNode = this;
      this.children.push(child);
    }
  }
  replaceChildren(...children) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    this.append(...children);
  }
  remove() {
    if (this.parentNode) {
      this.parentNode.children = this.parentNode.children.filter(child => child !== this);
      this.parentNode = null;
    }
  }
  focus() {
    if (this.disabled) return;
    this.ownerDocument.activeElement = this;
    this.dispatch('focus');
  }
  click() {
    if (this.disabled) return;
    this.dispatch('click');
    if (this.tagName === 'A') {
      this.downloads.push({ href: this.href, filename: this.download, connected: !!this.parentNode });
    }
  }
}

function boot({ saved, blockedStorage = false, throwRead = false, throwWrite = false } = {}) {
  const downloads = [];
  const elements = new Map();
  // Read IDs and initial input attributes from the real page, so a missing DOM
  // dependency cannot accidentally pass because the test invented the element.
  for (const match of html.matchAll(/<([a-z][\w-]*)\b([^<>]*\bid="[^"]+"[^<>]*)>/gi)) {
    const attributes = Object.fromEntries(
      [...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(attribute => [attribute[1], attribute[2]]),
    );
    for (const flag of ['checked', 'disabled']) {
      if (new RegExp(`\\s${flag}(?:\\s|$)`).test(match[2])) attributes[flag] = '';
    }
    assert.ok(!elements.has(attributes.id), `Duplicate page ID: ${attributes.id}`);
    elements.set(attributes.id, new Element(match[1], attributes, downloads));
  }
  const body = new Element('body', {}, downloads);
  const findId = (node, id) => {
    if (node.id === id || node.getAttribute('id') === id) return node;
    for (const child of node.children) {
      const found = findId(child, id);
      if (found) return found;
    }
    return null;
  };
  const document = {
    body, activeElement: body,
    getElementById(id) {
      if (elements.has(id)) return elements.get(id);
      for (const root of elements.values()) {
        const found = findId(root, id);
        if (found) return found;
      }
      return null;
    },
    createElement(tag) {
      const element = new Element(tag, {}, downloads);
      element.ownerDocument = document;
      return element;
    },
  };
  for (const element of [body, ...elements.values()]) element.ownerDocument = document;
  const stored = new Map(saved === undefined ? [] : [[storageKey, saved]]);
  const storageCalls = { reads: [], writes: [] };
  const storage = {
    getItem(key) {
      storageCalls.reads.push(key);
      if (throwRead) throw new Error('Storage read blocked');
      return stored.get(key) ?? null;
    },
    setItem(key, value) {
      storageCalls.writes.push([key, value]);
      if (throwWrite) throw new Error('Storage write blocked');
      stored.set(key, String(value));
    },
  };
  const blobs = new Map();
  const revoked = [];
  const timers = [];
  const context = createContext({
    document, Blob,
    URL: {
      createObjectURL(blob) {
        assert.ok(blob instanceof Blob);
        const url = `blob:theme-test/${blobs.size + 1}`;
        blobs.set(url, blob);
        return url;
      },
      revokeObjectURL: url => revoked.push(url),
    },
    setTimeout(callback, delay) { timers.push({ callback, delay }); return timers.length; },
  });
  Object.defineProperty(context, 'localStorage', {
    get() {
      if (blockedStorage) throw new Error('Storage access blocked');
      return storage;
    },
  });
  runInContext(paletteSource, context, { filename: 'src/palette.js', timeout: 1000 });
  runInContext(appSource, context, { filename: 'app.js', timeout: 1000 });
  const $ = id => {
    const element = document.getElementById(id);
    assert.ok(element, `Missing page element: ${id}`);
    return element;
  };
  return {
    $, context, body, blobs, downloads, revoked, timers, stored, storageCalls,
    palette: context.PiPalette,
    input(id, value) { $(id).value = value; $(id).dispatch('input'); },
    auto(checked) { $('auto-accent').checked = checked; $('auto-accent').dispatch('change'); },
    previewColors() {
      return Object.fromEntries([...$('session-preview').style.properties]
        .filter(([key]) => key.startsWith('--pi-'))
        .map(([key, value]) => [key.slice(5), value]));
    },
    choices() {
      return {
        name: $('theme-name').value,
        ...Object.fromEntries(fields.map(field => [field, $(`${field}-hex`).value.toUpperCase()])),
        autoAccent: $('auto-accent').checked,
      };
    },
  };
}

function assertPreview(app, { name, base, accent, autoAccent, background, overrides }) {
  // Overrides must be plain objects in the palette's realm, as they are when
  // read from storage or edited by app.js in a browser.
  const options = { name, base, accent: autoAccent ? undefined : accent, background, overrides };
  const expected = plain(runInContext(`PiPalette.createTheme(${JSON.stringify(options)})`, app.context, { timeout: 1000 }));
  assert.deepEqual(app.previewColors(), expected.colors);
  assert.equal(app.$('session-preview').style.getPropertyValue('--terminal-bg'), background.toUpperCase());
  assert.equal(app.$('appearance-label').textContent, `${expected.appearance === 'light' ? 'Light' : 'Dark'} palette`);
  return expected;
}

function roleControl(app, role) {
  const chip = app.$(`override-${role}`);
  const swatch = chip.parentNode;
  const [, description, reset] = swatch.children;
  const [title, value, origin] = description.children;
  return { swatch, chip, description, title, value, origin, reset };
}

function assertNoBackgroundExport(theme) {
  assert.deepEqual(Object.keys(theme).sort(), ['appearance', 'colors', 'name']);
  assert.equal(Object.keys(theme.colors).length, 55);
  for (const forbidden of ['background', 'terminalBg', 'terminalBackground', 'pageBg', '--terminal-bg']) {
    assert.equal(Object.hasOwn(theme, forbidden), false);
    assert.equal(Object.hasOwn(theme.colors, forbidden), false);
  }
}

async function download(app) {
  const count = app.downloads.length;
  app.$('download-button').click();
  assert.equal(app.downloads.length, count + 1);
  const link = app.downloads.at(-1);
  const blob = app.blobs.get(link.href);
  return { link, blob, json: JSON.parse(await blob.text()) };
}

test('classic scripts initialize the actual page with defaults, preview roles, and swatches', () => {
  const scripts = [...html.matchAll(/<script\b([^>]*)\bsrc="([^"]+)"([^>]*)>/g)];
  assert.deepEqual(scripts.map(match => match[2]), ['src/palette.js', 'app.js']);
  for (const match of scripts) {
    assert.match(match[1] + match[3], /\bdefer\b/);
    assert.doesNotMatch(match[1] + match[3], /type="module"/);
  }
  const app = boot();
  assert.deepEqual(app.choices(), defaults);
  assert.equal(app.$('download-button').disabled, false);
  assert.equal(app.$('form-error').textContent, '');
  assert.equal(app.$('accent-picker').disabled, false);
  assert.equal(app.$('accent-hex').disabled, false);
  const theme = assertPreview(app, defaults);
  const swatches = app.$('palette-swatches').children;
  assert.equal(swatches.length, Object.keys(theme.colors).length);
  for (const [index, [role, color]] of Object.entries(theme.colors).entries()) {
    const [chip, description, reset] = swatches[index].children;
    assert.equal(chip.tagName, 'INPUT');
    assert.equal(chip.type, 'color');
    assert.equal(chip.id, `override-${role}`);
    assert.equal(chip.value, color.toLowerCase());
    assert.equal(chip.disabled, false);
    assert.equal(chip.getAttribute('aria-label'), `${role} color`);
    assert.equal(chip.getAttribute('aria-describedby'), 'palette-help');
    assert.equal(description.children[0].textContent, role);
    assert.equal(description.children[0].htmlFor, chip.id);
    assert.equal(description.children[1].textContent, color);
    assert.equal(description.children[2].textContent, 'Generated');
    assert.equal(reset.type, 'button');
    assert.equal(reset.disabled, true);
    assert.equal(reset.getAttribute('aria-label'), `Reset ${role} to generated color`);
  }
  assert.equal(app.$('override-count').textContent, '0 custom colors');
  assert.equal(app.$('reset-overrides-button').disabled, true);
  assert.match(app.$('status').textContent, /my-pi-theme\.json/);
  assert.match(app.$('contrast-note').textContent, /\d+\.\d{2}:1/);
});

for (const field of fields) {
  test(`${field} picker and hex input synchronize and normalize on blur`, () => {
    const app = boot();
    app.input(`${field}-picker`, '#a1b2c3');
    assert.equal(app.$(`${field}-hex`).value, '#A1B2C3');
    assert.equal(app.$(`${field}-picker`).value, '#a1b2c3');
    assertPreview(app, { ...defaults, [field]: '#A1B2C3' });
    app.input(`${field}-hex`, '#d4e5f6');
    assert.equal(app.$(`${field}-picker`).value, '#d4e5f6');
    assert.equal(app.$(`${field}-hex`).value, '#d4e5f6');
    app.$(`${field}-hex`).dispatch('blur');
    assert.equal(app.$(`${field}-hex`).value, '#D4E5F6');
    assertPreview(app, { ...defaults, [field]: '#D4E5F6' });
  });

  test(`invalid ${field} blocks download, preserves preview and storage, and recovers`, () => {
    const app = boot();
    const before = [...app.$('session-preview').style.properties];
    const saved = app.stored.get(storageKey);
    for (const invalid of ['', '#abc', '#12345g', '112233', ' #112233', '#112233 ']) {
      app.input(`${field}-hex`, invalid);
      assert.equal(app.$(`${field}-hex`).getAttribute('aria-invalid'), 'true');
      assert.equal(app.$('download-button').disabled, true);
      assert.match(app.$('form-error').textContent, /six-digit hex/);
      assert.match(app.$('status').textContent, /last valid palette/);
      assert.deepEqual([...app.$('session-preview').style.properties], before);
      assert.equal(app.stored.get(storageKey), saved);
      app.$(`${field}-hex`).dispatch('blur');
      assert.equal(app.$(`${field}-hex`).value, invalid);
      // Synthetic dispatch bypasses a disabled button to exercise the export
      // handler's own validation, rather than relying only on browser behavior.
      app.$('download-button').dispatch('click');
      assert.equal(app.downloads.length, 0);
      assert.equal(app.blobs.size, 0);
    }
    app.input(`${field}-hex`, '#123abc');
    assert.equal(app.$(`${field}-hex`).getAttribute('aria-invalid'), null);
    assert.equal(app.$('download-button').disabled, false);
    assert.equal(app.$('form-error').textContent, '');
    assertPreview(app, { ...defaults, [field]: '#123ABC' });
  });
}

test('invalid name blocks export and all field errors remain visible together', () => {
  const app = boot();
  const before = app.previewColors();
  app.input('theme-name', '../escape');
  for (const field of fields) app.input(`${field}-hex`, '#bad');
  assert.equal(app.$('theme-name').getAttribute('aria-invalid'), 'true');
  assert.equal(app.$('download-button').disabled, true);
  assert.match(app.$('form-error').textContent, /Terminal background/);
  assert.match(app.$('form-error').textContent, /Base/);
  assert.match(app.$('form-error').textContent, /Accent/);
  assert.match(app.$('form-error').textContent, /letters, numbers/);
  app.$('download-button').dispatch('click');
  assert.equal(app.downloads.length, 0);
  assert.deepEqual(app.previewColors(), before);
  app.input('theme-name', 'safe-name');
  for (const field of fields) app.input(`${field}-hex`, defaults[field]);
  assert.equal(app.$('form-error').textContent, '');
  assert.equal(app.$('theme-name').getAttribute('aria-invalid'), null);
  assert.equal(app.$('download-button').disabled, false);
});

test('download revalidates values even without a preceding input event', () => {
  const app = boot();
  app.$('base-hex').value = '#nothex';
  app.$('download-button').click();
  assert.equal(app.downloads.length, 0);
  assert.equal(app.$('download-button').disabled, true);
  assert.equal(app.$('base-hex').getAttribute('aria-invalid'), 'true');
});

test('automatic accent disables manual controls and restores the manual accent after base edits', async () => {
  const app = boot();
  app.input('accent-hex', '#12abcd');
  app.auto(true);
  assert.equal(app.$('accent-picker').disabled, true);
  assert.equal(app.$('accent-hex').disabled, true);
  assert.equal(app.$('accent-hex').value, '#12ABCD');
  assertPreview(app, { ...defaults, accent: '#12ABCD', autoAccent: true });
  app.input('base-hex', '#397bcc');
  const autoChoices = { ...defaults, base: '#397BCC', accent: '#12ABCD', autoAccent: true };
  assertPreview(app, autoChoices);
  assert.deepEqual((await download(app)).json, plain(app.palette.createTheme({ name: defaults.name, base: autoChoices.base })));
  assert.deepEqual(JSON.parse(app.stored.get(storageKey)), autoChoices);
  app.auto(false);
  assert.equal(app.$('accent-picker').disabled, false);
  assert.equal(app.$('accent-hex').disabled, false);
  assert.equal(app.$('accent-hex').value, '#12ABCD');
  assertPreview(app, { ...autoChoices, autoAccent: false });
});

test('automatic accent discards incomplete input but keeps the last valid manual accent', () => {
  const app = boot();
  app.input('accent-hex', '#abcd12');
  app.input('accent-hex', '#ab');
  assert.equal(app.$('download-button').disabled, true);
  app.auto(true);
  assert.equal(app.$('accent-hex').value, '#ABCD12');
  assert.equal(app.$('accent-hex').getAttribute('aria-invalid'), null);
  assert.equal(app.$('download-button').disabled, false);
  assert.equal(app.$('form-error').textContent, '');
  app.auto(false);
  assertPreview(app, { ...defaults, accent: '#ABCD12' });
});

test('reset restores defaults, clears errors, enables manual accent, and persists defaults', () => {
  const app = boot();
  app.input('theme-name', 'changed');
  app.input('background-hex', '#101020');
  app.input('base-hex', '#123abc');
  app.input('accent-hex', '#fedcba');
  app.input('override-text', '#fefefe');
  app.input('override-accent', '#010203');
  const textChip = app.$('override-text');
  app.auto(true);
  app.input('theme-name', '');
  app.input('background-hex', '#bad');
  app.input('base-hex', '#bad');
  app.$('reset-button').click();
  assert.deepEqual(app.choices(), defaults);
  assert.equal(app.$('accent-picker').disabled, false);
  assert.equal(app.$('accent-hex').disabled, false);
  assert.equal(app.$('download-button').disabled, false);
  assert.equal(app.$('form-error').textContent, '');
  for (const id of ['theme-name', ...fields.map(field => `${field}-hex`)]) {
    assert.equal(app.$(id).getAttribute('aria-invalid'), null);
  }
  assertPreview(app, defaults);
  assert.deepEqual(JSON.parse(app.stored.get(storageKey)), defaults);
  assert.equal(app.$('override-count').textContent, '0 custom colors');
  assert.equal(app.$('reset-overrides-button').disabled, true);
  assert.equal(app.$('override-text'), textChip);
  for (const role of Object.keys(app.previewColors())) {
    const controls = roleControl(app, role);
    assert.equal(controls.origin.textContent, 'Generated');
    assert.equal(controls.chip.disabled, false);
    assert.equal(controls.reset.disabled, true);
  }
});

test('form submission is prevented rather than navigating a local-file page', () => {
  assert.equal(boot().$('theme-form').dispatch('submit').defaultPrevented, true);
});

test('valid persisted choices restore preview and keep manual accent across an automatic-mode reload', () => {
  const choices = { name: 'Saved_theme-2', background: '#010203', base: '#6789AB', accent: '#AB1234', autoAccent: true };
  const first = boot({ saved: JSON.stringify(choices) });
  assert.deepEqual(first.choices(), choices);
  assertPreview(first, choices);
  assert.equal(first.$('accent-hex').disabled, true);
  assert.deepEqual(first.storageCalls.reads, [storageKey]);
  const reloaded = boot({ saved: first.stored.get(storageKey) });
  reloaded.auto(false);
  assert.equal(reloaded.$('accent-hex').value, choices.accent);
  assertPreview(reloaded, { ...choices, autoAccent: false });
});

test('malformed persisted data falls back to defaults without partially restoring fields', () => {
  const malformed = [
    '{not json', '', 'null', 'false', '42', '[]', '{}',
    JSON.stringify({ ...defaults, autoAccent: 'false' }),
    JSON.stringify({ ...defaults, name: '../bad' }),
    JSON.stringify({ ...defaults, name: 'CON' }),
    JSON.stringify({ ...defaults, background: '#bad' }),
    JSON.stringify({ ...defaults, base: null }),
    JSON.stringify({ ...defaults, accent: '#12345g' }),
    JSON.stringify({ name: 'partial', autoAccent: true }),
  ];
  for (const saved of malformed) {
    const app = boot({ saved });
    assert.deepEqual(app.choices(), defaults, saved);
    assertPreview(app, defaults);
    assert.equal(app.$('download-button').disabled, false);
    assert.equal(app.$('form-error').textContent, '');
  }
});

for (const [description, options] of [
  ['localStorage getter is blocked', { blockedStorage: true }],
  ['storage reads throw', { throwRead: true }],
  ['storage writes throw', { throwWrite: true }],
]) {
  test(`editing, reset, and download work when ${description}`, async () => {
    const app = boot(options);
    assert.deepEqual(app.choices(), defaults);
    app.input('theme-name', 'no-storage');
    app.input('base-hex', '#123abc');
    app.input('background-hex', '#ffffff');
    app.input('override-mdHeading', '#123456');
    const choices = { ...defaults, name: 'no-storage', base: '#123ABC', background: '#FFFFFF', overrides: { mdHeading: '#123456' } };
    const expected = assertPreview(app, choices);
    const result = await download(app);
    assert.equal(result.link.filename, 'no-storage.json');
    assert.deepEqual(result.json, expected);
    app.$('reset-button').click();
    assert.deepEqual(app.choices(), defaults);
    assertPreview(app, defaults);
  });
}

test('blocked storage writes do not prevent restoration from readable saved choices', () => {
  const choices = { ...defaults, name: 'read-only', base: '#998877' };
  const app = boot({ saved: JSON.stringify(choices), throwWrite: true });
  assert.deepEqual(app.choices(), choices);
  assertPreview(app, choices);
  assert.equal(app.$('download-button').disabled, false);
});

test('downloaded Blob JSON and filename match every preview role, without terminal background', async () => {
  const app = boot();
  app.input('theme-name', 'My_theme-42');
  app.input('base-hex', '#856734');
  app.input('accent-hex', '#4f8bd2');
  app.input('background-hex', '#020406');
  const expected = assertPreview(app, { name: 'My_theme-42', base: '#856734', accent: '#4F8BD2', background: '#020406' });
  const first = await download(app);
  assert.equal(first.link.filename, 'My_theme-42.json');
  assert.equal(first.link.connected, true);
  assert.equal(first.blob.type, 'application/json');
  assert.deepEqual(first.json, expected);
  assert.deepEqual(first.json.colors, app.previewColors());
  assertNoBackgroundExport(first.json);
  assert.equal(first.json.appearance, 'dark');
  assert.equal(app.body.children.length, 0, 'Temporary download link is removed');
  assert.deepEqual(app.revoked, [], 'URL remains usable until deferred cleanup');
  assert.equal(app.timers.length, 1);
  assert.equal(app.timers[0].delay, 1000);
  app.timers[0].callback();
  assert.deepEqual(app.revoked, [first.link.href]);
  assert.match(app.$('status').textContent, /Download requested: My_theme-42\.json/);
  app.input('background-hex', '#ffffff');
  assert.equal(app.$('session-preview').style.getPropertyValue('--terminal-bg'), '#FFFFFF');
  const second = await download(app);
  const light = assertPreview(app, { name: 'My_theme-42', base: '#856734', accent: '#4F8BD2', background: '#FFFFFF' });
  assert.deepEqual(second.json, light);
  assert.equal(second.json.appearance, 'light');
  assert.notDeepEqual(second.json.colors, first.json.colors, 'Light background changes derivation, not export keys');
  assert.equal(second.link.filename, first.link.filename);
  assertNoBackgroundExport(second.json);
});

test('background changes switch light palettes and return to exact legacy dark exports', async () => {
  const app = boot();
  const dark = (await download(app)).json;
  assert.deepEqual(dark.colors, plain(app.palette.deriveTheme(defaults.base, defaults.accent).colors));
  assert.equal(dark.appearance, 'dark');
  for (const background of ['#FFFFFF', '#FAF7F2', '#E1EDF9']) {
    app.input('background-picker', background);
    const expected = assertPreview(app, { ...defaults, background });
    const exported = (await download(app)).json;
    assert.equal(exported.appearance, 'light');
    assert.deepEqual(exported, expected);
    assert.notDeepEqual(exported.colors, dark.colors);
    assert.ok(app.palette.contrastRatio(exported.colors.text, background) >= 4.5);
    assertNoBackgroundExport(exported);
  }
  for (const background of ['#000000', '#123456', defaults.background]) {
    app.input('background-hex', background);
    assertPreview(app, { ...defaults, background });
    assert.deepEqual((await download(app)).json, dark);
  }
});

test('every native role input updates CSS, swatch state, storage and exported colors', async () => {
  const app = boot();
  const generated = app.previewColors();
  const overrides = {};
  const rows = [...app.$('palette-swatches').children];
  for (const [index, role] of Object.keys(generated).entries()) {
    const controls = roleControl(app, role);
    const color = `#${(0x123456 + index * 0x010203).toString(16).padStart(6, '0')}`;
    app.input(`override-${role}`, color);
    overrides[role] = color.toUpperCase();
    assert.equal(controls.chip.value, color.toLowerCase());
    assert.equal(controls.value.textContent, color.toUpperCase());
    assert.equal(controls.origin.textContent, 'Custom');
    assert.equal(controls.swatch.className, 'swatch is-overridden');
    assert.equal(controls.reset.disabled, false);
    assert.equal(app.$('session-preview').style.getPropertyValue(`--pi-${role}`), color.toUpperCase());
    assert.deepEqual(app.previewColors(), { ...generated, ...overrides });
    assert.deepEqual(JSON.parse(app.stored.get(storageKey)), { ...defaults, overrides });
    assert.equal(app.$('override-count').textContent, `${index + 1} custom ${index === 0 ? 'color' : 'colors'}`);
    assert.equal(app.$('reset-overrides-button').disabled, false);
    for (const [rowIndex, row] of rows.entries()) {
      assert.equal(app.$('palette-swatches').children[rowIndex], row);
    }
  }
  const exported = (await download(app)).json;
  assert.deepEqual(exported, assertPreview(app, { ...defaults, overrides }));
  assertNoBackgroundExport(exported);
});

test('active native picker and all role nodes stay mounted without redundant value assignments', async () => {
  const app = boot();
  const snapshots = Object.keys(app.previewColors()).map(role => [role, roleControl(app, role)]);
  const active = roleControl(app, 'syntaxKeyword');
  active.chip.focus();
  for (const color of ['#123456', '#789abc', '#fedcba']) {
    // Model a native picker event: the browser changes value before input.
    active.chip.value = color;
    const writes = active.chip.valueWrites;
    active.chip.dispatch('input');
    assert.equal(active.chip.valueWrites, writes, 'Render must not reassign the active color input');
    assert.equal(app.context.document.activeElement, active.chip);
    assert.equal(app.$('override-syntaxKeyword'), active.chip);
    assert.equal(active.value.textContent, color.toUpperCase());
  }
  app.input('base-hex', '#397bcc');
  app.input('background-hex', '#ffffff');
  app.input('accent-hex', '#ab1234');
  await download(app);
  for (const [role, before] of snapshots) {
    const after = roleControl(app, role);
    for (const key of Object.keys(before)) assert.equal(after[key], before[key], `${role}: ${key}`);
    assert.equal(after.chip.listeners.get('input').length, 1);
    assert.equal(after.reset.listeners.get('click').length, 1);
  }
  assert.equal(app.context.document.activeElement, active.chip);
});

test('overrides persist across foundation edits, appearance changes and storage reload', async () => {
  const app = boot();
  const overrides = { text: '#234567', mdHeading: '#aB1234' };
  for (const [role, color] of Object.entries(overrides)) app.input(`override-${role}`, color);
  overrides.mdHeading = '#AB1234';
  const choices = { ...defaults };
  for (const [field, color] of [['base', '#397BCC'], ['accent', '#DC5324'],
    ['background', '#FFFFFF'], ['background', '#FAF7F2'], ['background', '#171717']]) {
    choices[field] = color;
    app.input(`${field}-hex`, color);
    const expected = assertPreview(app, { ...choices, overrides });
    assert.deepEqual((await download(app)).json, expected);
    assert.deepEqual(JSON.parse(app.stored.get(storageKey)), { ...choices, overrides });
    for (const [role, manual] of Object.entries(overrides)) {
      assert.equal(roleControl(app, role).origin.textContent, 'Custom');
      assert.equal(app.previewColors()[role], manual);
    }
  }
  const reloaded = boot({ saved: app.stored.get(storageKey) });
  assert.deepEqual(reloaded.choices(), choices);
  assert.equal(reloaded.$('override-count').textContent, '2 custom colors');
  assert.deepEqual((await download(reloaded)).json, assertPreview(reloaded, { ...choices, overrides }));
  assert.equal(roleControl(reloaded, 'mdHeading').chip.value, '#ab1234');
  assert.equal(roleControl(reloaded, 'mdHeading').origin.textContent, 'Custom');
  assert.equal(roleControl(reloaded, 'mdHeading').reset.disabled, false);
});

test('automatic accent changes generated roles without replacing manual role overrides', async () => {
  const app = boot();
  app.input('background-hex', '#ffffff');
  app.input('accent-hex', '#123abc');
  const overrides = { accent: '#010203', syntaxKeyword: '#654321' };
  for (const [role, color] of Object.entries(overrides)) app.input(`override-${role}`, color);
  app.auto(true);
  app.input('base-hex', '#397bcc');
  const choices = { ...defaults, background: '#FFFFFF', base: '#397BCC', accent: '#123ABC', autoAccent: true };
  const automatic = assertPreview(app, { ...choices, overrides });
  assert.equal(app.$('accent-picker').disabled, true);
  assert.equal(app.$('override-accent').disabled, false);
  assert.deepEqual((await download(app)).json, automatic);
  assert.deepEqual(JSON.parse(app.stored.get(storageKey)), { ...choices, overrides });
  const reloaded = boot({ saved: app.stored.get(storageKey) });
  assertPreview(reloaded, { ...choices, overrides });
  assert.equal(reloaded.$('accent-hex').disabled, true);
  reloaded.auto(false);
  assert.equal(reloaded.$('accent-hex').value, choices.accent);
  const manual = assertPreview(reloaded, { ...choices, autoAccent: false, overrides });
  assert.notEqual(manual.colors.mdHeading, automatic.colors.mdHeading);
  assert.equal(manual.colors.accent, overrides.accent);
  assert.equal(manual.colors.syntaxKeyword, overrides.syntaxKeyword);
  assert.deepEqual((await download(reloaded)).json, manual);
  roleControl(reloaded, 'accent').reset.click();
  const remaining = { syntaxKeyword: overrides.syntaxKeyword };
  assertPreview(reloaded, { ...choices, autoAccent: false, overrides: remaining });
  reloaded.auto(true);
  const generatedAuto = assertPreview(reloaded, { ...choices, overrides: remaining });
  assert.notEqual(generatedAuto.colors.accent, overrides.accent);
  assert.equal(generatedAuto.colors.syntaxKeyword, overrides.syntaxKeyword);
});

test('individual reset follows the current generator, preserves other overrides and focuses its picker', async () => {
  const app = boot();
  const initialText = app.previewColors().text;
  app.input('override-text', '#123456');
  app.input('override-syntaxKeyword', '#abcdef');
  app.input('base-hex', '#397bcc');
  app.input('background-hex', '#ffffff');
  const choices = { ...defaults, base: '#397BCC', background: '#FFFFFF' };
  const controls = roleControl(app, 'text');
  controls.reset.focus();
  controls.reset.click();
  const expected = assertPreview(app, { ...choices, overrides: { syntaxKeyword: '#ABCDEF' } });
  assert.notEqual(expected.colors.text, initialText, 'Reset uses current seeds and appearance, not initial colors');
  assert.equal(controls.chip.value, expected.colors.text.toLowerCase());
  assert.equal(controls.origin.textContent, 'Generated');
  assert.equal(controls.swatch.className, 'swatch');
  assert.equal(controls.reset.disabled, true);
  assert.equal(app.context.document.activeElement, controls.chip);
  assert.equal(app.$('override-text'), controls.chip);
  assert.equal(app.$('override-count').textContent, '1 custom color');
  assert.deepEqual(JSON.parse(app.stored.get(storageKey)), { ...choices, overrides: { syntaxKeyword: '#ABCDEF' } });
  assert.deepEqual((await download(app)).json, expected);
  roleControl(app, 'syntaxKeyword').reset.click();
  assert.equal(app.$('override-count').textContent, '0 custom colors');
  assert.equal(app.$('reset-overrides-button').disabled, true);
  assert.deepEqual(JSON.parse(app.stored.get(storageKey)), choices);
  const reloaded = boot({ saved: app.stored.get(storageKey) });
  assertPreview(reloaded, choices);
  assert.equal(reloaded.$('override-count').textContent, '0 custom colors');
});

test('reset custom colors preserves all foundation choices and automatic accent mode', async () => {
  const app = boot();
  app.input('theme-name', 'keep-my-seeds');
  app.input('base-hex', '#397bcc');
  app.input('accent-hex', '#ab1234');
  app.input('background-hex', '#ffffff');
  app.auto(true);
  app.input('override-text', '#010203');
  app.input('override-toolErrorBg', '#abcdef');
  const choices = app.choices();
  const chip = app.$('override-toolErrorBg');
  app.$('reset-overrides-button').click();
  assert.deepEqual(app.choices(), choices);
  assert.equal(app.$('accent-hex').disabled, true);
  const expected = assertPreview(app, choices);
  assert.equal(app.$('override-count').textContent, '0 custom colors');
  assert.equal(app.$('reset-overrides-button').disabled, true);
  assert.equal(app.$('override-toolErrorBg'), chip);
  for (const role of Object.keys(expected.colors)) {
    assert.equal(roleControl(app, role).origin.textContent, 'Generated');
    assert.equal(roleControl(app, role).reset.disabled, true);
  }
  assert.deepEqual(JSON.parse(app.stored.get(storageKey)), choices);
  assert.deepEqual((await download(app)).json, expected);
  assertPreview(boot({ saved: app.stored.get(storageKey) }), choices);
});

test('malformed saved overrides fall back to defaults without partial restoration', () => {
  const choices = { ...defaults, name: 'must-not-restore', base: '#397BCC', background: '#FFFFFF', autoAccent: true };
  const malformed = [null, false, 1, '#FFFFFF', [], ['#FFFFFF'],
    { text: null }, { text: 123456 }, { text: '#fff' }, { text: '#12345g' },
    { text: '#FFFFFF\n' }, { Text: '#FFFFFF' }, { pageBg: '#FFFFFF' },
    { background: '#FFFFFF' }, { constructor: '#FFFFFF' },
    JSON.parse('{"__proto__":"#FFFFFF"}'), { text: '#123456', unsupported: '#ABCDEF' }];
  for (const overrides of malformed) {
    const app = boot({ saved: JSON.stringify({ ...choices, overrides }) });
    assert.deepEqual(app.choices(), defaults, JSON.stringify(overrides));
    assertPreview(app, defaults);
    assert.equal(app.$('override-count').textContent, '0 custom colors');
    assert.equal(app.$('reset-overrides-button').disabled, true);
    assert.equal(app.$('download-button').disabled, false);
    assert.deepEqual(JSON.parse(app.stored.get(storageKey)), defaults);
  }
  const empty = boot({ saved: JSON.stringify({ ...choices, overrides: {} }) });
  assert.deepEqual(empty.choices(), choices);
  assertPreview(empty, choices);
  assert.equal(empty.$('override-count').textContent, '0 custom colors');
});

test('invalid fields disable every role picker and reset, preserving custom colors until recovery', () => {
  const app = boot();
  app.input('override-text', '#123456');
  const before = app.previewColors();
  const saved = app.stored.get(storageKey);
  for (const [id, invalid, valid] of [['theme-name', '../bad', defaults.name],
    ...fields.map(field => [`${field}-hex`, '#bad', defaults[field]])]) {
    app.input(id, invalid);
    for (const role of Object.keys(before)) {
      const controls = roleControl(app, role);
      assert.equal(controls.chip.disabled, true, `${id}: ${role}`);
      assert.equal(controls.reset.disabled, true, `${id}: ${role}`);
    }
    roleControl(app, 'text').reset.click();
    assert.deepEqual(app.previewColors(), before);
    assert.equal(app.stored.get(storageKey), saved);
    assert.equal(app.$('override-count').textContent, '1 custom color');
    app.input(id, valid);
    assertPreview(app, { ...defaults, overrides: { text: '#123456' } });
    for (const role of Object.keys(before)) {
      assert.equal(roleControl(app, role).chip.disabled, false);
      assert.equal(roleControl(app, role).reset.disabled, role !== 'text');
    }
  }
});

test('low-contrast manual body text warns without blocking export and reset clears the warning', async () => {
  const app = boot();
  app.input('background-hex', '#ffffff');
  assert.match(app.$('contrast-note').textContent, /Meets the 4\.5:1 body-text guideline/);
  app.input('override-text', '#ffffff');
  assert.match(app.$('contrast-note').textContent, /contrast: 1\.00:1/);
  assert.match(app.$('contrast-note').textContent, /Below the 4\.5:1 guideline/);
  assert.equal(app.$('download-button').disabled, false);
  const exported = (await download(app)).json;
  assert.equal(exported.colors.text, '#FFFFFF');
  assert.equal(exported.appearance, 'light');
  assertNoBackgroundExport(exported);
  roleControl(app, 'text').reset.click();
  assert.match(app.$('contrast-note').textContent, /Meets the 4\.5:1 body-text guideline/);
  assert.doesNotMatch(app.$('contrast-note').textContent, /Below/);
  assertPreview(app, { ...defaults, background: '#FFFFFF' });
});

test('normalizeName permits safe names and rejects traversal, reserved names, and invalid types', () => {
  const { normalizeName } = boot().palette;
  for (const name of ['a', '0', 'My_theme-42', 'x'.repeat(64)]) assert.equal(normalizeName(name), name);
  for (const name of [
    '', 'x'.repeat(65), '../theme', 'folder/theme', 'folder\\theme', 'theme.json',
    '-theme', '_theme', 'two words', ' theme', 'theme ', 'theme\t', 'a\nb', 'a\0b',
    'system', 'dark', 'LIGHT', 'CON', 'prn', 'AUX', 'nul', 'COM1', 'lpt9',
    null, undefined, 12, {}, [], new String('theme'),
  ]) assert.throws(() => normalizeName(name), { name: 'TypeError' }, String(name));
});

test('normalizeName rejects final line breaks rather than allowing the regex end-anchor shortcut', () => {
  const { normalizeName } = boot().palette;
  for (const name of ['theme\n', 'theme\r', 'theme\r\n', 'x'.repeat(64) + '\n']) {
    assert.throws(() => normalizeName(name), { name: 'TypeError' }, JSON.stringify(name));
  }
});

test('createTheme validates names and colors and exports only the dark theme schema', () => {
  const { createTheme, deriveTheme } = boot().palette;
  const options = { name: 'Custom_theme', base: '#a1b2c3', accent: '#d4e5f6', background: '#010203' };
  const theme = plain(createTheme(options));
  assert.deepEqual(theme, { name: options.name, appearance: 'dark', colors: plain(deriveTheme(options.base, options.accent).colors) });
  assert.deepEqual(options, { name: 'Custom_theme', base: '#a1b2c3', accent: '#d4e5f6', background: '#010203' });
  assert.deepEqual(plain(createTheme({ name: 'auto', base: options.base })).colors, plain(deriveTheme(options.base).colors));
  for (const invalid of [
    { ...options, name: '../bad' }, { ...options, base: '#bad' },
    { ...options, accent: '#bad' }, { ...options, accent: null },
  ]) assert.throws(() => createTheme(invalid), { name: 'TypeError' });
});
