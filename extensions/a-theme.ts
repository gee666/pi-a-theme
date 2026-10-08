import { getAgentDir, type ExtensionAPI, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { registerTheme } from "../src/commands.mjs";
import { createColorOverlay, type ColorSettings } from "../src/color-overlay.ts";
import { makeTheme, terminalBase } from "../src/pi-theme.ts";

export default function (pi: ExtensionAPI) {
  registerTheme(pi, getAgentDir(), {
    defaultColor: terminalBase,
    previewTheme: (settings: ColorSettings, ctx: ExtensionCommandContext) =>
      makeTheme(settings, ctx.ui.theme.getColorMode()),
    openPicker: (ctx: ExtensionCommandContext, initial: ColorSettings,
      onPreview: (settings: ColorSettings) => void, terminalColor: string) =>
      ctx.ui.custom<ColorSettings | undefined>(
        (tui, theme, _keys, done) =>
          createColorOverlay(tui, theme, initial, onPreview, done, terminalColor),
        { overlay: true, overlayOptions: { width: 56, maxHeight: "95%" } },
      ),
  });
}
