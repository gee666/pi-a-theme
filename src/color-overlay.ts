import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  Input, Key, matchesKey, parseColor, truncateToWidth, visibleWidth,
  type Color, type Component, type Focusable, type TUI,
} from "@earendil-works/pi-tui";
import { DEFAULT_COLOR, deriveTheme, normalizeColor } from "./palette.ts";

export interface ColorSettings {
  color: string;
  accent?: string;
}

const FOCUS = ["base", "accent", "auto", "terminal", "reset", "apply", "cancel"] as const;
type Control = typeof FOCUS[number];

function validHex(value: string): boolean {
  return value.length === 7 && /^#[0-9a-f]{6}$/i.test(value);
}

/** UI only. The caller supplies computed opening settings and owns terminal
 * background detection/lightening, theme installation, saving, and rollback.
 * Use with ctx.ui.custom(..., { overlay: true }); Pi centers overlays by default.
 * Optional terminalColor is the caller's lightened #RRGGBB terminal seed. Its
 * Terminal button changes only the base; omitting it preserves the tab order.
 * Reset restores the opening values; an empty accent selects automatic accent.
 */
export function createColorOverlay(
  tui: Pick<TUI, "requestRender">,
  theme: Theme,
  initial: ColorSettings,
  onPreview: (settings: ColorSettings) => void,
  done: (settings: ColorSettings | undefined) => void,
  terminalColor?: string,
): Component & Focusable & { dispose(): void } {
  return new ColorOverlay(tui, theme, initial, onPreview, done, terminalColor);
}

class ColorOverlay implements Component, Focusable {
  private readonly base = new Input({ prompt: "" });
  private readonly accent = new Input({ prompt: "" });
  private readonly initial: ColorSettings;
  private readonly controls: readonly Control[];
  private focus: Control = "base";
  private hasFocus = false;
  private closed = false;
  private manualAccent = "";
  private previewKey = "";
  private colors: Record<string, Color> = {};

  constructor(
    private readonly tui: Pick<TUI, "requestRender">,
    private readonly theme: Theme,
    initial: ColorSettings,
    private readonly onPreview: (settings: ColorSettings) => void,
    private readonly done: (settings: ColorSettings | undefined) => void,
    private readonly terminalColor?: string,
  ) {
    this.controls = FOCUS.filter(control => control !== "terminal" || terminalColor !== undefined);
    this.initial = { ...initial };
    this.setInput(this.base, initial.color);
    this.setInput(this.accent, initial.accent ?? "");
    this.manualAccent = initial.accent ?? "";
    // Keep samples available even if a caller supplies an invalid opening draft.
    this.setSamples({ color: DEFAULT_COLOR });
    this.preview();
  }

  get focused(): boolean { return this.hasFocus; }
  set focused(value: boolean) {
    this.hasFocus = value;
    this.syncFocus();
  }

  private syncFocus(): void {
    this.base.focused = this.hasFocus && !this.closed && this.focus === "base";
    this.accent.focused = this.hasFocus && !this.closed && this.focus === "accent";
  }

  private setInput(input: Input, value: string): void {
    input.setValue(value);
    input.handleInput("\x05"); // Native Input's line-end action, after programmatic reset.
  }

  private settings(): ColorSettings | undefined {
    const color = this.base.getValue();
    const accent = this.accent.getValue();
    if (!validHex(color) || (accent !== "" && !validHex(accent))) return undefined;
    return {
      color: normalizeColor(color),
      ...(accent === "" ? {} : { accent: normalizeColor(accent) }),
    };
  }

  private setSamples(settings: ColorSettings): void {
    this.colors = Object.fromEntries(
      Object.entries(deriveTheme(settings.color, settings.accent).colors)
        .map(([role, hex]) => [role, parseColor(hex as string)]),
    );
  }

  private preview(): void {
    const settings = this.settings();
    if (!settings) return;
    const key = `${settings.color}/${settings.accent ?? ""}`;
    if (key === this.previewKey) return;
    this.previewKey = key;
    this.setSamples(settings);
    this.onPreview({ ...settings });
  }

  private finish(settings: ColorSettings | undefined): void {
    if (this.closed) return;
    this.closed = true;
    this.syncFocus();
    this.done(settings);
  }

  private apply(): void {
    const settings = this.settings();
    if (settings) this.finish(settings);
    else this.focus = validHex(this.base.getValue()) ? "accent" : "base";
  }

  private activate(): void {
    switch (this.focus) {
      case "base": this.focus = "accent"; break;
      case "accent": this.focus = "auto"; break;
      case "auto":
        if (this.accent.getValue() === "") {
          const fallback = validHex(this.base.getValue()) ? this.base.getValue() : DEFAULT_COLOR;
          this.setInput(this.accent, this.manualAccent || deriveTheme(fallback).colors.accent);
        } else {
          this.manualAccent = this.accent.getValue();
          this.setInput(this.accent, "");
        }
        this.preview();
        break;
      case "terminal":
        if (this.terminalColor !== undefined) {
          this.setInput(this.base, this.terminalColor);
          this.preview();
        }
        break;
      case "reset":
        this.setInput(this.base, this.initial.color);
        this.setInput(this.accent, this.initial.accent ?? "");
        this.manualAccent = this.initial.accent ?? "";
        this.preview();
        break;
      case "apply": this.apply(); break;
      case "cancel": this.finish(undefined); break;
    }
  }

  handleInput(data: string): void {
    if (this.closed) return;
    if (matchesKey(data, Key.escape)) {
      this.finish(undefined);
      return;
    }
    if (matchesKey(data, Key.ctrl(Key.enter))) this.apply();
    else if (matchesKey(data, Key.tab) || matchesKey(data, Key.shift(Key.tab))) {
      const step = matchesKey(data, Key.tab) ? 1 : -1;
      this.focus = this.controls[(this.controls.indexOf(this.focus) + step + this.controls.length) % this.controls.length]!;
    } else if (matchesKey(data, Key.enter) ||
      (this.focus !== "base" && this.focus !== "accent" && matchesKey(data, Key.space))) {
      this.activate();
    } else if (this.focus === "base" || this.focus === "accent") {
      (this.focus === "base" ? this.base : this.accent).handleInput(data);
      this.preview();
    }
    this.syncFocus();
    this.invalidate();
    if (!this.closed) this.tui.requestRender();
  }

  render(availableWidth: number): string[] {
    const width = Math.max(0, Math.floor(availableWidth));
    if (!width) return [];
    const boxWidth = Math.min(width, 56);
    const framed = boxWidth >= 4;
    const inner = boxWidth - (framed ? 2 : 0);
    const inset = inner >= 16 ? 1 : 0;
    const contentWidth = inner - 2 * inset;
    const margin = " ".repeat(Math.floor((width - boxWidth) / 2));
    const fit = (text: string, w: number) => truncateToWidth(text, w, "", true);
    const border = (text: string) => this.theme.fg("border", text);
    const row = (text: string) => margin + (framed ? border("│") : "") +
      " ".repeat(inset) + fit(text, contentWidth) + " ".repeat(inset) +
      (framed ? border("│") : "");
    const sample = (text: string, fg: string, bg?: string) => this.theme.style(text, {
      fg: this.colors[fg], ...(bg ? { bg: this.colors[bg] } : {}),
    });
    const label = (control: Control, text: string) => this.theme.fg(
      this.focus === control && this.hasFocus ? "accent" : "muted",
      `${this.focus === control && this.hasFocus ? ">" : " "} ${text}`,
    );
    const button = (control: Control, text: string) => this.theme.style(`[${text}]`, {
      fg: control === "apply" && !this.settings() ? "dim" : "accent",
      inverse: this.hasFocus && this.focus === control,
    });
    const lines: string[] = [];
    if (framed) lines.push(margin + border(`┌${"─".repeat(inner)}┐`));
    lines.push(row(this.theme.bold("Colors")));
    this.syncFocus();
    for (const [control, name, input] of [
      ["base", "Base", this.base], ["accent", "Accent", this.accent],
    ] as const) {
      const prefix = label(control, name.padEnd(6)) + " ";
      const inputWidth = contentWidth >= 19 ? contentWidth - visibleWidth(prefix) : contentWidth;
      // Input renders a fake cursor even when unfocused. Only render the active
      // Input; inactive fields are plain values, with no stray cursor markers.
      const value = input.focused ? input.render(inputWidth)[0]! :
        this.theme.fg("text", fit(input.getValue() || "auto", inputWidth));
      if (contentWidth >= 19) lines.push(row(prefix + value));
      else {
        lines.push(row(label(control, name)));
        lines.push(row(value));
      }
    }
    lines.push(row(button("auto", `${this.accent.getValue() === "" ? "x" : " "} Auto accent`)));
    const problem = !validHex(this.base.getValue()) ? "Base needs #RRGGBB" :
      this.accent.getValue() !== "" && !validHex(this.accent.getValue()) ?
        "Accent needs #RRGGBB or blank" : "#RRGGBB; blank = auto";
    lines.push(row(this.theme.fg(this.settings() ? "dim" : "error", problem)));
    lines.push(row(sample("Text", "text") + "  " + sample("Accent heading", "mdHeading")));
    lines.push(row(sample(fit(" User: hello", contentWidth), "userMessageText", "userMessageBg")));
    lines.push(row(sample(fit(" Tool: done", contentWidth), "toolTitle", "toolSuccessBg")));
    lines.push(row(sample(fit(" output.txt", contentWidth), "toolOutput", "toolSuccessBg")));
    const buttons = [button("reset", "Reset"), button("apply", "Apply"), button("cancel", "Cancel")];
    if (this.terminalColor !== undefined) buttons.unshift(button("terminal", "Terminal"));
    if (contentWidth >= visibleWidth(buttons.join(" "))) lines.push(row(buttons.join(" ")));
    else for (const text of buttons) lines.push(row(text));
    const hints = contentWidth >= 45 ? ["Tab/S-Tab focus  Enter select  Ctrl+Enter apply", "Esc cancel"] :
      ["Tab/S-Tab move", "Enter select", contentWidth >= 16 ? "Ctrl+Enter apply" : "C-Enter apply", "Esc cancel"];
    for (const hint of hints) lines.push(row(this.theme.fg("dim", hint)));
    if (framed) lines.push(margin + border(`└${"─".repeat(inner)}┘`));
    return lines;
  }

  invalidate(): void {
    this.base.invalidate();
    this.accent.invalidate();
  }

  dispose(): void {
    this.closed = true;
    this.syncFocus();
  }
}
