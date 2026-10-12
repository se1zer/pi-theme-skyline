/**
 * skyline theme extension
 *
 * Pairs with themes/skyline.json. The header replaces pi's verbose startup
 * listing with a compact summary, and the footer restores pi's built-in
 * stats plus git details and a clock.
 */

import { getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHeader } from "./header.ts";
import { createFooter } from "./footer.ts";
import { createGgbondEditor } from "./editor.ts";

/** 当 settings.json 中 key 的值不等于 value 时写入，失败静默忽略。 */
function ensureSetting(key: string, value: unknown): void {
  try {
    const settingsPath = join(getAgentDir(), "settings.json");
    const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    if (settings[key] !== value) {
      settings[key] = value;
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");
    }
  } catch {
    /* settings.json 不可读/不可写——保持原样 */
  }
}

/** 自动应用 skyline 主题：持久化 auto 语法（跟随终端外观），首次安装立即切换。 */
function enableSkylineTheme(ctx: ExtensionContext): void {
  // 亮色终端 → skyline-light，暗色终端 → skyline
  const AUTO_THEME = "skyline-light/skyline";
  const current = ctx.ui.theme.name;

  // 持久化 auto 语法，下次启动跟随终端外观自动切换
  ensureSetting("theme", AUTO_THEME);

  // 已经是 skyline 系则跳过，避免每次启动重复切换造成闪烁
  if (current === "skyline" || current === "skyline-light") return;

  // 首次安装：立即切换到 skyline（暗色默认，下次启动按终端外观 auto 切换）
  ctx.ui.setTheme("skyline");
}

/** 抑制 pi 默认的冗长启动列表，让紧凑 header 接管。 */
function enableQuietStartup(): void {
  ensureSetting("quietStartup", true);
}

export default function (pi: ExtensionAPI) {
  let footerDispose: (() => void) | undefined;

  pi.on("session_shutdown", () => {
    footerDispose?.();
    footerDispose = undefined;
  });

  pi.on("session_start", (event, ctx) => {
    if (ctx.mode !== "tui") return;

    // 0. 自动切换到 skyline 主题（立即生效 + 写入 settings.json）
    enableSkylineTheme(ctx);

    // 1. 抑制 pi 默认的冗长启动列表，让紧凑 header 接管
    enableQuietStartup();

    // 2. header：动画 π logo + 版本号 + 每日鸡汤 + 模型/thinking + 资源统计
    //    恢复历史会话时跳过启动动画，直接显示最终定格帧，避免打开会话时多次闪烁。
    //    覆盖两种入口：/resume 等进程内切换（reason 为 resume/reload/fork），
    //    以及 pi -r / pi -c 启动的已含历史消息的会话（reason 为 startup）。
    const hasHistory = ctx.sessionManager.getEntries().some((e) => e.type === "message");
    const skipAnimation =
      event.reason === "resume" ||
      event.reason === "reload" ||
      event.reason === "fork" ||
      hasHistory;
    ctx.ui.setHeader(createHeader(ctx, skipAnimation));

    // 3. footer：三行 —— pwd+git / stats+model / context bar+clock
    const footer = createFooter(pi, ctx);
    footerDispose = footer.dispose;
    ctx.ui.setFooter(footer.factory);

    // 4. editor：清爽的强调色边框
    const Editor = createGgbondEditor(ctx);
    ctx.ui.setEditorComponent((tui, theme, keybindings) => new Editor(tui, theme, keybindings));
  });
}
