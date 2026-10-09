# a-theme

A browser-only Pi theme builder. Choose your terminal background, main color, and accent, preview a sample session, fine-tune individual colors, then download a static theme JSON.

Open [`index.html`](index.html) in a browser. No server, framework, installation, or build step is required. The same files can be hosted on GitHub Pages or any static host.

## Create a theme

1. Name your theme. Use 1–64 letters, numbers, hyphens or underscores, starting with a letter or number. Built-in theme names and Windows device names are reserved.
2. Match the background to your terminal. Light backgrounds automatically generate a light palette; dark backgrounds keep the original derivation.
3. Choose base and accent colors with the native color pickers or enter six-digit hex values. Enable **Derive accent from base** for an automatic accent.
4. Inspect the Pi-style lorem ipsum session, including markdown, syntax highlighting, tool states, diffs, and thinking levels. All 55 generated color roles appear below it.
5. Optionally click any color swatch in **Color roles** to open its color picker. Changes update the preview and downloaded JSON.
6. Click **Download theme**.

Custom colors stay fixed when you change the base, accent, or background. Each edited role has a Reset button to follow the generator again. **Reset custom colors** clears all overrides without changing your foundation colors or theme name.

The starting colors are base `#CD9D8A` and accent `#CC397B`, the original extension's README example. The main Reset button restores them, the default name, background `#171717`, and removes all custom colors.

Valid choices and custom colors are remembered in this browser when local storage is available. Nothing is uploaded. Downloads still work when storage is blocked. Invalid or incomplete inputs keep the last valid preview and disable downloads.

## Install the downloaded theme

Save `<theme-name>.json` in the appropriate folder, creating it if necessary:

- Linux, macOS, or WSL: `~/.pi/agent/themes/`
- Windows: `%USERPROFILE%\.pi\agent\themes\`
- Custom agent directory: `$PI_CODING_AGENT_DIR/themes/`

Keep the filename the same as the theme's name. Run `/reload` in Pi, then select the theme in `/settings`. Windows and WSL normally have separate home folders, so copy the file into both if you use both installations.

Your browser downloads a file; it cannot install into Pi automatically. Move the JSON from Downloads, or use your browser's save-location prompt to choose the themes folder.

## Preview and palette behavior

The background selects the palette's light or dark appearance and affects the preview. It is not exported as a terminal-background setting. A Pi theme does not change your terminal's background; configure that in your terminal itself.

Dark backgrounds use the original a-theme HSL-offset algorithm unchanged. Base saturation and lightness are bounded to keep dark blocks and lighter text. An explicit accent controls the pink/purple family independently. The base controls block fills, earth tones, and other roles. The base input is therefore not necessarily the literal user-message background.

Light backgrounds use those same hue relationships with pale, tinted panels and darker foregrounds. Lightness adjustments target at least 4.5:1 contrast for generated text against the terminal and relevant panel backgrounds. Light mode starts at linear sRGB luminance 0.179, near the black-versus-white contrast crossover. This also handles light-gray backgrounds, not just white. The JSON records `appearance` as `light` or `dark`.

Custom colors apply last and are never adjusted by the generator. They can reduce contrast, particularly when switching between light and dark backgrounds. Reset them or choose new colors if needed.

The preview uses HTML and CSS rather than Pi's terminal renderer. Fonts, spacing, and 256-color terminal approximations may differ. The contrast readout checks body text against the chosen terminal background only; it is not a guarantee of accessibility for every role or panel.

The downloaded theme contains fixed hex colors, with no runtime generator, extension, or dependency on this site.

## Migration from the extension

This repository is no longer a Pi extension or Pi package. Remove the old installation if it is still configured:

```sh
pi remove https://github.com/gee666/pi-a-theme.git
```

If you installed a local checkout, remove that path instead. Choose another theme or install a downloaded theme, then run `/reload`. Old `a-theme.json` settings and generated themes are not used by this web app and can be kept as backups.

## Development

- `index.html` and `styles.css`: controls and sample session.
- `src/palette.js`: pure color derivation and export validation, exposed as `PiPalette` through a classic script for local-file support.
- `app.js`: live preview, individual color overrides, local storage, and JSON download.

Tests require Node.js 18 or newer and no installed dependencies:

```sh
npm test
```

The color relationships originate in [Blooming Ilacs](https://github.com/gee666/pi-theme-blooming-ilacs).

## License

[MIT](LICENSE).
