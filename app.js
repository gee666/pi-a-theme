(() => {
  'use strict';
  const { normalizeColor, normalizeName, createTheme, contrastRatio } = PiPalette;
  const $ = id => document.getElementById(id);
  const defaults = { name: 'my-pi-theme', background: '#171717', base: '#CD9D8A', accent: '#CC397B', autoAccent: false };
  const storageKey = 'a-theme-studio-v1';
  const fields = ['background', 'base', 'accent'];
  const labels = { background: 'Terminal background', base: 'Base', accent: 'Accent' };
  const preview = $('session-preview');
  const swatches = $('palette-swatches');
  let currentTheme;
  let currentChoices;
  let overrides = {};
  let previewEdit = null;
  let pointerStart = null;
  const previewPicker = $('preview-color-picker');
  const roleControls = new Map();
  let remembered = defaults;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved && typeof saved.autoAccent === 'boolean') {
      normalizeName(saved.name);
      fields.forEach(field => normalizeColor(saved[field]));
      createTheme({ name: saved.name, base: saved.base, accent: saved.autoAccent ? undefined : saved.accent,
        background: saved.background, overrides: saved.overrides });
      remembered = saved;
    }
  } catch { /* Storage can be unavailable for local files or private browsing. */ }

  function setChoices(choices) {
    overrides = { ...choices.overrides };
    $('theme-name').value = choices.name;
    $('auto-accent').checked = choices.autoAccent;
    for (const field of fields) {
      $(`${field}-hex`).value = choices[field];
      $(`${field}-picker`).value = choices[field];
    }
  }

  // Keep native picker nodes mounted while their input events repaint the preview.
  // Rebuilding the swatches on each event would close an open color picker.
  function buildSwatches() {
    const colors = createTheme({ name: defaults.name, base: defaults.base, accent: defaults.accent }).colors;
    for (const [role, color] of Object.entries(colors)) {
      const swatch = document.createElement('div');
      swatch.className = 'swatch';
      const chip = document.createElement('input');
      chip.type = 'color';
      chip.id = `override-${role}`;
      chip.className = 'swatch-chip';
      chip.value = color;
      chip.setAttribute('aria-label', `${role} color`);
      chip.setAttribute('aria-describedby', 'palette-help');
      const description = document.createElement('span');
      const title = document.createElement('label');
      title.htmlFor = chip.id;
      title.className = 'swatch-role';
      title.textContent = role;
      const value = document.createElement('code');
      const origin = document.createElement('span');
      origin.className = 'swatch-origin';
      description.append(title, value, origin);
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'swatch-reset';
      reset.textContent = 'Reset';
      reset.setAttribute('aria-label', `Reset ${role} to generated color`);
      PiColorPicker.bind(chip);
      chip.addEventListener('input', () => {
        overrides[role] = normalizeColor(chip.value);
        render();
      });
      reset.addEventListener('click', () => {
        delete overrides[role];
        render();
        chip.focus();
      });
      swatch.append(chip, description, reset);
      swatches.append(swatch);
      roleControls.set(role, { swatch, chip, value, origin, reset });
    }
  }

  function render() {
    const autoAccent = $('auto-accent').checked;
    $('accent-picker').disabled = autoAccent;
    $('accent-hex').disabled = autoAccent;
    const choices = { name: $('theme-name').value, autoAccent };
    const errors = [];
    for (const field of fields) {
      const input = $(`${field}-hex`);
      input.removeAttribute('aria-invalid');
      if (field === 'accent' && autoAccent) {
        // Keep the last manual choice so disabling Auto restores it.
        choices.accent = $(`${field}-picker`).value.toUpperCase();
        continue;
      }
      try {
        choices[field] = normalizeColor(input.value);
        $(`${field}-picker`).value = choices[field];
      } catch {
        input.setAttribute('aria-invalid', 'true');
        errors.push(`${labels[field]} must be a six-digit hex color, like #CD9D8A.`);
      }
    }
    $('theme-name').removeAttribute('aria-invalid');
    try { normalizeName(choices.name); }
    catch (error) {
      $('theme-name').setAttribute('aria-invalid', 'true');
      errors.push(error.message);
    }
    $('form-error').textContent = errors.join(' ');
    $('download-button').disabled = errors.length > 0;
    const overrideCount = Object.keys(overrides).length;
    $('reset-overrides-button').disabled = overrideCount === 0;
    $('override-count').textContent = `${overrideCount} custom ${overrideCount === 1 ? 'color' : 'colors'}`;
    for (const [role, controls] of roleControls) {
      controls.chip.disabled = errors.length > 0;
      controls.reset.disabled = errors.length > 0 || !Object.hasOwn(overrides, role);
    }
    previewPicker.disabled = errors.length > 0;
    currentTheme = undefined;
    if (errors.length) {
      $('status').textContent = 'Fix the fields above to download. Preview keeps the last valid palette.';
      return;
    }
    currentTheme = createTheme({ name: choices.name, base: choices.base,
      accent: autoAccent ? undefined : choices.accent, background: choices.background, overrides });
    if (overrideCount) choices.overrides = { ...overrides };
    currentChoices = choices;
    $('appearance-label').textContent = `${currentTheme.appearance === 'light' ? 'Light' : 'Dark'} palette`;
    preview.style.setProperty('--terminal-bg', choices.background);
    for (const [role, color] of Object.entries(currentTheme.colors)) {
      preview.style.setProperty(`--pi-${role}`, color);
    }
    for (const [role, color] of Object.entries(currentTheme.colors)) {
      const controls = roleControls.get(role);
      const custom = Object.hasOwn(overrides, role);
      // Avoid assigning to the active picker unnecessarily.
      if (controls.chip.value.toUpperCase() !== color.toUpperCase()) controls.chip.value = color;
      controls.value.textContent = color;
      controls.origin.textContent = custom ? 'Custom' : 'Generated';
      controls.swatch.className = custom ? 'swatch is-overridden' : 'swatch';
    }
    if (previewEdit) {
      const color = previewEdit.role === 'terminal' ? choices.background : currentTheme.colors[previewEdit.role];
      if (previewPicker.value.toUpperCase() !== color.toUpperCase()) previewPicker.value = color;
      $('preview-edit-status').textContent = `Editing ${previewEdit.role === 'terminal' ? 'terminal background' : previewEdit.role} (${previewEdit.kind}): ${color}`;
    }
    const ratio = contrastRatio(currentTheme.colors.text, choices.background);
    $('contrast-note').textContent = `Body text / terminal contrast: ${ratio.toFixed(2)}:1. ${ratio < 4.5 ? 'Below the 4.5:1 guideline. Adjust text or terminal background.' : 'Meets the 4.5:1 body-text guideline.'} Other roles and panel backgrounds may have lower contrast, especially after custom edits.`;
    $('status').textContent = `Ready to download ${choices.name}.json`;
    try { localStorage.setItem(storageKey, JSON.stringify(choices)); } catch { /* Export does not depend on storage. */ }
  }

  preview.addEventListener('pointerdown', event => {
    pointerStart = { x: event.clientX, y: event.clientY };
  });
  preview.addEventListener('click', event => {
    // Let modified clicks and drag selections keep their normal browser behavior.
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    event.preventDefault(); // Sample links are color targets, not navigation.
    const start = pointerStart;
    pointerStart = null;
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
    if (!currentTheme) {
      $('preview-edit-status').textContent = 'Fix the invalid fields before editing preview colors.';
      return;
    }
    const hit = PiPreview.hitTest(preview, event.clientX, event.clientY);
    if (!hit || (hit.role !== 'terminal' && !roleControls.has(hit.role))) return;
    previewEdit = hit;
    previewPicker.value = hit.role === 'terminal' ? currentChoices.background : currentTheme.colors[hit.role];
    previewPicker.style.left = `${event.clientX}px`;
    previewPicker.style.top = `${event.clientY}px`;
    previewPicker.setAttribute('aria-label', `Edit ${hit.role} ${hit.kind} color`);
    $('preview-edit-status').textContent = `Editing ${hit.role === 'terminal' ? 'terminal background' : hit.role} (${hit.kind}).`;
    PiColorPicker.open(previewPicker, preview);
  });
  previewPicker.addEventListener('input', () => {
    if (!previewEdit || !currentTheme) return;
    const color = normalizeColor(previewPicker.value);
    if (previewEdit.role === 'terminal') {
      $('background-hex').value = color;
      $('background-picker').value = color;
    } else {
      overrides[previewEdit.role] = color;
    }
    render();
  });

  for (const field of fields) {
    PiColorPicker.bind($(`${field}-picker`));
    $(`${field}-picker`).addEventListener('input', event => {
      $(`${field}-hex`).value = event.target.value.toUpperCase();
      render();
    });
    $(`${field}-hex`).addEventListener('input', render);
    $(`${field}-hex`).addEventListener('blur', event => {
      try { event.target.value = normalizeColor(event.target.value); } catch { /* Keep invalid input visible. */ }
    });
  }
  $('theme-name').addEventListener('input', render);
  $('auto-accent').addEventListener('change', () => {
    // Discard any incomplete manual accent when switching modes.
    $('accent-hex').value = $('accent-picker').value.toUpperCase();
    render();
  });
  $('theme-form').addEventListener('submit', event => event.preventDefault());
  $('reset-button').addEventListener('click', () => { setChoices(defaults); render(); });
  $('reset-overrides-button').addEventListener('click', () => { overrides = {}; render(); });
  $('download-button').addEventListener('click', () => {
    render();
    if (!currentTheme) return;
    const blob = new Blob([JSON.stringify(currentTheme, null, 2) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentChoices.name}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('status').textContent = `Download requested: ${currentChoices.name}.json. Move it to your Pi themes folder, then run /reload.`;
  });
  buildSwatches();
  setChoices(remembered);
  render();
})();
