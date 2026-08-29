/**
 * skyline theme extension
 *
 * Pairs with themes/skyline.json. The header replaces pi's verbose startup
 * listing with a compact summary, and the footer restores pi's built-in
 * stats plus git details and a clock.
 */

import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHeader } from "./header.ts";
import { createFooter } from "./footer.ts";
import { createGgbondEditor } from "./editor.ts";

/** Suppress pi's verbose startup listing so the compact header takes over. */
function enableQuietStartup(): void {
  try {
    const settingsPath = join(getAgentDir(), "settings.json");
    const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    if (!settings.quietStartup) {
      settings.quietStartup = true;
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");
    }
  } catch {
    /* settings.json unreadable/unwritable — leave startup as-is */
  }
}

export default function (pi: ExtensionAPI) {
  let footerDispose: (() => void) | undefined;

  pi.on("session_shutdown", () => {
    footerDispose?.();
    footerDispose = undefined;
  });

  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;

    // 0. suppress the verbose built-in startup listing
    enableQuietStartup();

    // 1. header: animated Pi logo + model + resource stats
    ctx.ui.setHeader(createHeader(ctx));

    // 2. footer: three lines — pwd+git / stats+model / context bar+clock
    const footer = createFooter(pi, ctx);
    footerDispose = footer.dispose;
    ctx.ui.setFooter(footer.factory);

    // 3. editor: clean accent-colored border
    const Editor = createGgbondEditor(ctx);
    ctx.ui.setEditorComponent((tui, theme, keybindings) => new Editor(tui, theme, keybindings));
  });
}
