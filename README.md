# a-theme

A Pi theme derived from one color, with an optional separate accent. The default seed is `#6E452F`.

Text, borders, syntax colors and message/tool blocks follow the color relationships in [Blooming Ilacs](https://github.com/gee666/pi-theme-blooming-ilacs). The default palette matches its role colors.

The terminal's own background stays visible. This package never sets or resets terminal background, foreground or cursor colors. Only Pi's text and named blocks receive colors.

## Install

```sh
pi install /path/to/a-theme
```

Run `/reload`, then select `a-theme` in `/settings`.

## Commands

- `/a-theme-color #6E452F`: set the base color.
- `/a-theme-accent #EA2175`: set a separate accent.
- `/a-theme-accent auto`: derive the accent from the base again.

Without an argument, either command opens a color input. Colors must use six hex digits. Commands select a-theme, save your choices and reload Pi to apply them.

Settings live in `~/.pi/agent/a-theme.json`. The generated palette lives in `~/.pi/agent/themes/a-theme.json`; commands and reloads regenerate it. Both paths follow `PI_CODING_AGENT_DIR`. The package checkout stays unchanged.

## Color derivation

Each role keeps its reference HSL hue, saturation and lightness offsets from the base. An explicit accent independently controls the pink/purple family, including headings and syntax accents. Block fills and earth-tone roles still follow the base.

Seed lightness and saturation are bounded to retain the reference's dark blocks and lighter text, so very bright seeds are not used literally as block fills. The palette is designed for dark terminals. It does not detect or recolor the terminal background, so contrast on arbitrary terminal backgrounds is not guaranteed.

## Development

```sh
npm test
```

No build step or runtime dependencies. Pi supplies the extension API.
