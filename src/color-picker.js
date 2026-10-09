/* Shared HEX-first editor. Native color inputs remain the visual selector. */
(() => {
  const $ = id => document.getElementById(id);
  const dialog = $('color-editor');
  const hex = $('color-editor-hex');
  const visual = $('color-editor-visual');
  const copy = $('color-editor-copy');
  const status = $('color-editor-status');
  let target;
  let returnFocus;
  let session = 0;

  function validate() {
    try {
      const color = PiPalette.normalizeColor(hex.value);
      hex.removeAttribute('aria-invalid');
      copy.disabled = false;
      status.textContent = '';
      return color;
    } catch {
      hex.setAttribute('aria-invalid', 'true');
      copy.disabled = true;
      status.textContent = 'Enter six HEX digits, like #CD9D8A. The last valid color is kept.';
      return null;
    }
  }

  function apply(color) {
    if (!target || target.disabled) return;
    target.value = color;
    target.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function open(input, focusTarget = input) {
    if (input.disabled) return;
    target = input;
    returnFocus = focusTarget;
    session++;
    $('color-editor-title').textContent = input.getAttribute('aria-label') || `${input.name} color`;
    hex.value = input.value.toUpperCase();
    visual.value = input.value;
    validate();
    dialog.showModal();
    hex.focus();
    hex.select();
  }

  hex.addEventListener('input', () => {
    const color = validate();
    if (!color) return;
    visual.value = color;
    apply(color);
  });
  hex.addEventListener('blur', () => {
    try { hex.value = PiPalette.normalizeColor(hex.value); } catch { /* Preserve drafts. */ }
  });
  visual.addEventListener('input', () => {
    hex.value = visual.value.toUpperCase();
    validate();
    apply(visual.value);
  });
  copy.addEventListener('click', async () => {
    const color = validate();
    if (!color) return;
    const copyingSession = session;
    try {
      await navigator.clipboard.writeText(color);
      if (session === copyingSession) status.textContent = `Copied ${color}`;
    } catch {
      if (session !== copyingSession) return;
      hex.focus();
      hex.select();
      status.textContent = 'Clipboard unavailable. Press Ctrl+C or Command+C to copy the selected HEX value.';
    }
  });
  $('color-editor-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    session++;
    target = null;
    returnFocus?.focus();
  });

  globalThis.PiColorPicker = {
    open,
    bind(input) {
      input.addEventListener('click', event => {
        event.preventDefault();
        open(input);
      });
    },
  };
})();
