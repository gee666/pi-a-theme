import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerTheme } from "../src/commands.mjs";

export default function (pi: ExtensionAPI) {
  registerTheme(pi, getAgentDir());
}
