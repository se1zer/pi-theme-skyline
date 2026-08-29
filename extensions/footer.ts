import type {
  ExtensionAPI,
  ExtensionContext,
  ReadonlyFooterDataProvider,
  Theme,
} from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { EMPTY_GIT_STATUS, parseGitStatus, type GitStatus } from "./git.ts";
import { renderContextBar } from "./progress-bar.ts";
import { formatCwd, formatTokens } from "./utils.ts";

/** Build the three-line footer. Returns the setFooter factory plus a dispose hook. */
export function createFooter(pi: ExtensionAPI, ctx: ExtensionContext) {
  let gitInfo: GitStatus = { ...EMPTY_GIT_STATUS };
  let footerTui: TUI | undefined;
  let clockTimer: ReturnType<typeof setInterval> | undefined;

  const stopClock = () => {
    if (clockTimer) {
      clearInterval(clockTimer);
      clockTimer = undefined;
    }
  };

  const refreshGitInfo = async () => {
    const result = await pi.exec("git", ["status", "-sb"], { cwd: ctx.cwd }).catch(() => null);
    if (result && result.code === 0) {
      gitInfo = parseGitStatus(result.stdout);
    } else {
      gitInfo = { ...EMPTY_GIT_STATUS };
    }
    footerTui?.requestRender();
  };

  const factory = (tui: TUI, theme: Theme, footerData: ReadonlyFooterDataProvider) => {
    const unsub = footerData.onBranchChange(() => {
      tui.requestRender();
      void refreshGitInfo();
    });
    void refreshGitInfo();

    footerTui = tui;
    if (!clockTimer) {
      clockTimer = setInterval(() => footerTui?.requestRender(), 1000);
    }

    return {
      dispose: () => {
        unsub();
        stopClock();
      },
      invalidate() {},
      render(width: number): string[] {
        // Cumulative usage across all entries (matches pi's built-in footer).
        let input = 0;
        let output = 0;
        let cacheRead = 0;
        let cacheWrite = 0;
        let cost = 0;
        let hitRate: number | undefined;

        for (const e of ctx.sessionManager.getEntries()) {
          if (e.type === "message" && e.message.role === "assistant") {
            const m = e.message as AssistantMessage;
            input += m.usage.input;
            output += m.usage.output;
            cacheRead += m.usage.cacheRead;
            cacheWrite += m.usage.cacheWrite;
            cost += m.usage.cost.total;
            const prompt = m.usage.input + m.usage.cacheRead + m.usage.cacheWrite;
            hitRate = prompt > 0 ? (m.usage.cacheRead / prompt) * 100 : undefined;
          }
        }

        // --- line 1: pwd + session name (left), git details (right) ---
        let pwd = formatCwd(ctx.cwd);
        const sessionName = ctx.sessionManager.getSessionName();
        if (sessionName) pwd += ` • ${sessionName}`;
        const line1Left = `📁 ${theme.fg("muted", pwd)}`;

        let gitStr = "";
        const g = gitInfo;
        if (g.branch) {
          gitStr = `🌱 ${theme.fg("accent", g.branch)}`;
          const status: string[] = [];
          if (g.ahead) status.push(theme.fg("warning", `⇡${g.ahead}`));
          if (g.behind) status.push(theme.fg("warning", `⇣${g.behind}`));
          if (g.staged) status.push(theme.fg("warning", `+${g.staged}`));
          if (g.modified) status.push(theme.fg("warning", `!${g.modified}`));
          if (g.untracked) status.push(theme.fg("warning", `?${g.untracked}`));
          if (g.deleted) status.push(theme.fg("error", `✘${g.deleted}`));
          if (status.length) gitStr += ` ${status.join(" ")}`;
        }
        const line1Right = gitStr;

        const pad1 = " ".repeat(Math.max(2, width - visibleWidth(line1Left) - visibleWidth(line1Right)));
        const line1 = truncateToWidth(line1Left + pad1 + line1Right, width);

        // --- line 2: token stats (left), model + thinking (right) ---
        const fmt = formatTokens;
        const parts: string[] = [];
        if (input) parts.push(`📥 ${theme.fg("muted", fmt(input))}`);
        if (output) parts.push(`📤 ${theme.fg("muted", fmt(output))}`);
        if ((cacheRead > 0 || cacheWrite > 0) && hitRate !== undefined) {
          parts.push(`🎯 ${theme.fg("muted", `${hitRate.toFixed(1)}%`)}`);
        }
        if (cost) parts.push(`💰 ${theme.fg("muted", `$${cost.toFixed(3)}`)}`);

        // No token data yet: show a placeholder instead of an empty line.
        const statsLeft = parts.length > 0
          ? parts.join("  ")
          : `🐷 ${theme.fg("muted", "no tokens yet")}`;

        const modelId = ctx.model?.id || "no-model";
        let modelLabel = modelId;
        if (ctx.model) {
          modelLabel = `(${ctx.model.provider}) ${modelId}`;
        }
        let line2Right = `🤖 ${theme.fg("muted", modelLabel)}`;
        if (ctx.model?.reasoning) {
          const level = pi.getThinkingLevel();
          line2Right += ` · 🧠 ${theme.fg("muted", level)}`;
        }

        const leftW = visibleWidth(statsLeft);
        const rightW = visibleWidth(line2Right);
        let line2: string;
        if (leftW + 2 + rightW <= width) {
          const pad = " ".repeat(width - leftW - rightW);
          line2 = statsLeft + pad + line2Right;
        } else {
          line2 = truncateToWidth(statsLeft, width);
        }

        // --- line 3: context bar (left), clock (right) ---
        const usage = ctx.getContextUsage();
        const pct = usage?.percent;
        const cw = usage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
        const time = new Date().toTimeString().slice(0, 8);

        const line3Left = `📊 ${renderContextBar(pct, cw, theme)}`;
        const line3Right = `🕐 ${theme.fg("accent", time)}`;

        const pad3 = " ".repeat(Math.max(2, width - visibleWidth(line3Left) - visibleWidth(line3Right)));
        const line3 = truncateToWidth(line3Left + pad3 + line3Right, width);

        return [line1, line2, line3];
      },
    };
  };

  const dispose = () => {
    stopClock();
    footerTui = undefined;
  };

  return { factory, dispose };
}
