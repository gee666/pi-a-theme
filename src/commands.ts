import { generateTheme, readSettings, saveSettings } from './storage.ts';

export function registerTheme(pi, agentDir, { terminalColor: getTerminalColor, previewTheme, openPicker }) {
  generateTheme(agentDir, getTerminalColor());
  pi.on('resources_discover', () => ({
    themePaths: [generateTheme(agentDir, getTerminalColor())],
  }));

  pi.registerCommand('a-theme-colors', {
    description: 'Choose base and accent colors with live preview',
    handler: async (_args, ctx) => {
      if (!ctx.hasUI || (ctx.mode && ctx.mode !== 'tui')) {
        ctx.ui.notify('Use this command in interactive Pi.', 'warning');
        return;
      }
      let original;
      let applied = false;
      let previewed = false;
      try {
        await ctx.waitForIdle();
        // ctx.ui.theme is a live proxy, not a snapshot. Resolve a concrete
        // instance before any previews replace the active theme.
        original = ctx.ui.getTheme(ctx.ui.theme.name ?? 'system');
        if (!original) throw new Error('Could not capture the current theme');
        const terminalColor = getTerminalColor();
        const initial = readSettings(agentDir, terminalColor);
        const selected = await openPicker(ctx, initial, settings => {
          const result = ctx.ui.setTheme(previewTheme(settings, ctx));
          if (!result.success) throw new Error(result.error ?? 'Could not preview theme');
          previewed = true;
        }, terminalColor);
        if (selected) {
          // Both values are saved together, only after Apply.
          saveSettings(agentDir, selected);
          generateTheme(agentDir, terminalColor);
          const result = ctx.ui.setTheme('a-theme');
          if (!result.success) {
            throw new Error(`Colors saved; reload Pi and select a-theme. ${result.error ?? ''}`);
          }
          applied = true;
        }
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), 'error');
      } finally {
        // Preview Theme objects never change Pi's saved theme selection.
        if (original && !applied) ctx.ui.setTheme(original);
      }
      // After cancellation, reload also restores watchers and automatic-theme
      // mode disabled by in-memory previews, without changing saved settings.
      // Reload replaces the extension runtime; do not use ctx after this.
      if (applied || previewed) await ctx.reload();
    },
  });
}
