import { CustomEditor } from "@earendil-works/pi-coding-agent";
import type { ExtensionContext, KeybindingsManager } from "@earendil-works/pi-coding-agent";
import type { EditorTheme, TUI } from "@earendil-works/pi-tui";

/** Create the editor class with an accent-colored border, preserving pi's default scrolling indicators. */
export function createGgbondEditor(ctx: ExtensionContext) {
  return class GgbondEditor extends CustomEditor {
    constructor(tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager) {
      super(tui, theme, keybindings);
      // 只换边框颜色，不重写 render，保留默认的滚动指示器（↑ N more / ↓ N more）。
      this.borderColor = (text: string) => ctx.ui.theme.fg("accent", text);
    }
  };
}
