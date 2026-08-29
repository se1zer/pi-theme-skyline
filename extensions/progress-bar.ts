import type { Theme } from "@earendil-works/pi-coding-agent";
import { formatTokens } from "./utils.ts";

/** Context usage rendered as a Claude-Code-style progress bar with window size. */
export function renderContextBar(
  pct: number | null | undefined,
  contextWindow: number,
  theme: Theme,
): string {
  const BAR_BLOCKS = [" ", "▏", "▎", "▍", "▌", "▋", "▊", "▉", "█"];
  const barWidth = 20;
  const sizeStr = contextWindow > 0 ? `/${formatTokens(contextWindow)}` : "";
  const emptyBg = (n: number) => theme.bg("toolPendingBg", " ".repeat(n));

  if (pct === null || pct === undefined) {
    return `${emptyBg(barWidth)} ${theme.fg("muted", `?${sizeStr}`)}`;
  }

  const ratio = Math.min(1, Math.max(0, pct / 100));
  const whole = Math.floor(ratio * barWidth);
  const fillColor = pct > 90 ? "error" : pct > 70 ? "warning" : "accent";

  let fill = "█".repeat(whole);
  if (whole < barWidth) {
    const remainder = ratio * barWidth - whole;
    const middle = Math.floor(remainder * BAR_BLOCKS.length);
    fill += BAR_BLOCKS[middle];
  }
  const emptyCount = barWidth - fill.length;
  const bar = theme.fg(fillColor, fill) + emptyBg(emptyCount);

  return `${bar} ${theme.fg("muted", `${pct.toFixed(1)}%${sizeStr}`)}`;
}
