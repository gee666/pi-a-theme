# a-theme

A Pi theme derived from a base color and an optional accent, using the color relationships in [Blooming Ilacs](https://github.com/gee666/pi-theme-blooming-ilacs).

By default, the base is the terminal's reported background mixed with 18% white, with an automatically derived accent. Saved choices take priority.

The Terminal button also offers this lighter terminal color. If the terminal does not report its background, Pi's dark-background fallback produces a `#2E2E2E` seed.

The terminal background stays unchanged. Only Pi's text, borders and message/tool blocks receive colors. This package never sets or resets terminal background, foreground or cursor colors.

## Install

With Pi installed, run:

```sh
pi install https://github.com/gee666/pi-a-theme.git
```

In Pi, run `/reload`, then select `a-theme` in `/settings`. Open `/a-theme-colors` to preview and save your own colors.

If you previously installed a local checkout, remove that package first with `pi remove /path/to/a-theme` to avoid duplicate command registrations. Your saved colors stay in Pi's agent directory.

To update installed packages:

```sh
pi update --extensions
```

Run `/reload` afterward.

To uninstall:

```sh
pi remove https://github.com/gee666/pi-a-theme.git
```

Choose another theme in `/settings` and run `/reload`. Uninstalling keeps your saved color settings and generated theme.

## Choose colors

Run `/a-theme-colors` to open the overlay.

- Edit Base and Accent as `#RRGGBB`. Valid edits preview immediately, both in the conversation and in the overlay samples.
- Leave Accent blank or use Auto accent to derive it from the base.
- Terminal uses a lighter version of this terminal's background as the base, keeping the accent choice.
- Reset restores the values from when you opened the overlay.
- Apply saves both colors together, selects a-theme and reloads Pi only if the colors or active theme changed.
- Cancel or Escape restores the previous theme without saving or reloading. Applying unchanged colors while a-theme is active does not reload either.

Tab and Shift+Tab move between controls. Enter activates a button. Ctrl+Enter applies from anywhere. Invalid or incomplete hex values keep the last valid preview and block Apply.

The old `/a-theme-color` and `/a-theme-accent` commands have been replaced by `/a-theme-colors`.

Settings live in `~/.pi/agent/a-theme.json`. The generated palette lives in `~/.pi/agent/themes/a-theme.json`; reloads regenerate it. Both paths follow `PI_CODING_AGENT_DIR`. The package checkout stays unchanged when choosing colors.

## Example colors

For a warm base with a pink accent, open `/a-theme-colors` and enter:

- Base: `#CD9D8A`
- Accent: `#CC397B`

Preview the result, then choose Apply. These are example colors, not the defaults. The same preset is available in [`examples/colors.json`](examples/colors.json).

To try the terminal-derived colors instead, choose Terminal and enable Auto accent before applying.

## Color derivation

Each role keeps its reference HSL hue, saturation and lightness offsets from the base. An explicit accent independently controls the pink/purple family, including headings and syntax accents. Block fills and earth-tone roles follow the base. Using base `#6E452F` and automatic accent reproduces the reference role colors.

Seed lightness and saturation are bounded to retain dark blocks and lighter text, so very bright seeds are not used literally as block fills. The palette is designed for dark terminals. Contrast on arbitrary terminal backgrounds is not guaranteed.

## Development

```sh
git clone https://github.com/gee666/pi-a-theme.git
cd pi-a-theme
npm test
```

For local development, install the checkout with `pi install /absolute/path/to/pi-a-theme` instead of installing the Git URL.

Overlay tests use Pi's native Input and require a local Pi host. If Pi is installed globally, set `PI_OVERLAY_HOST` to its `pi-coding-agent` package directory. Without a host, those tests are skipped; palette and command tests still run.

No build step or runtime dependencies. Pi supplies the extension and TUI APIs. Tests require Node 22.18 or newer for native TypeScript stripping.

Runtime modules use `.ts` so Pi reloads their imports with `/reload`. Native `.mjs` imports remain cached in Node even when Pi reloads the extension entry point.

## License

[MIT](LICENSE).
