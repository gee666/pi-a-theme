import { Theme, type ThemeBg, type ThemeColor } from "@earendil-works/pi-coding-agent";
import { colorToHex, type TerminalColorMode } from "@earendil-works/pi-tui";
import { deriveTheme } from "./palette.ts";
import { lighterBase } from "./defaults.ts";
import type { ColorSettings } from "./color-overlay.ts";

const BACKGROUNDS = new Set([
  "selectedBg", "searchMatchBg", "userMessageBg", "customMessageBg",
  "toolPendingBg", "toolSuccessBg", "toolErrorBg",
]);

export function makeTheme(settings: ColorSettings, mode: TerminalColorMode, terminalDefault = false): Theme {
  const fg = {} as Record<ThemeColor, string>;
  const bg = {} as Record<ThemeBg, string>;
  for (const [role, color] of Object.entries(deriveTheme(settings.color, settings.accent).colors)) {
    if (BACKGROUNDS.has(role)) bg[role as ThemeBg] = color as string;
    else fg[role as ThemeColor] = color as string;
  }
  if (terminalDefault) bg.userMessageBg = "";
  return new Theme(fg, bg, mode, { name: "a-theme", appearance: "dark" });
}

export function terminalBase(): string {
  // A terminal-default token resolves to Pi's cached terminal color report.
  // This Theme is never installed or rendered; no terminal control is emitted.
  // Pi falls back to black when no background report exists for a dark theme.
  const probe = makeTheme({ color: "#6E452F" }, "truecolor", true);
  return lighterBase(colorToHex(probe.colors.userMessageBg));
}
