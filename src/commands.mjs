import { normalizeColor } from './palette.mjs';
import { generateTheme, readSettings, saveSettings } from './storage.mjs';

export function registerTheme(pi, agentDir) {
  // Also create it before Pi applies a saved theme on startup.
  generateTheme(agentDir);
  pi.on('resources_discover', () => ({
    themePaths: [generateTheme(agentDir)],
  }));

  for (const key of ['color', 'accent']) {
    pi.registerCommand(`a-theme-${key}`, {
      description: key === 'color'
        ? 'Set a-theme base color: #RRGGBB'
        : 'Set a-theme accent: #RRGGBB or auto',
      handler: async (args, ctx) => {
        if (!ctx.hasUI || (ctx.mode && ctx.mode !== 'tui')) {
          ctx.ui.notify('Use this command in interactive Pi.', 'warning');
          return;
        }
        try {
          let value = args.trim();
          if (!value) {
            value = await ctx.ui.input(
              key === 'color' ? 'Base color' : 'Accent color',
              key === 'color' ? '#RRGGBB' : '#RRGGBB or auto',
            );
            if (value === undefined || !value.trim()) return;
            value = value.trim();
          }
          const color = key === 'accent' && value.toLowerCase() === 'auto'
            ? undefined
            : normalizeColor(value);
          await ctx.waitForIdle();
          // Read the latest saved settings after any dialog.
          const settings = readSettings(agentDir);
          if (key === 'accent' && color === undefined) delete settings.accent;
          else settings[key] = color;
          saveSettings(agentDir, settings);
          const result = ctx.ui.setTheme('a-theme');
          if (!result.success) {
            ctx.ui.notify(`Colors saved. Reload Pi and select a-theme: ${result.error ?? 'theme unavailable'}`, 'warning');
            return;
          }
          // Refresh Pi's registered theme as well as the active rendering.
          // Do not use this context after reload, which replaces the runtime.
          await ctx.reload();
        } catch (error) {
          ctx.ui.notify(error instanceof Error ? error.message : String(error), 'error');
        }
      },
    });
  }
}
