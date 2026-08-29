import { VERSION, getAgentDir, type ExtensionContext, type Theme } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

// ===== Pi logo animation (extracted from pi.dev/install.sh via pi-cc-header) =====

type LogoColor =
  | "panel" | "cyan" | "red" | "green" | "orange" | "white" | "flash"
  | "logo" | "logoStripe" | "l1" | "l2" | "l3" | "l4" | "s1" | "s2" | "s3" | "s4";
type LogoPhase = "left" | "top" | "right" | "none";
type LogoFrame = {
  phase: number;
  active: LogoPhase;
  ax: number;
  ay: number;
  flash: boolean;
  white: boolean;
};

const LOGO_FRAMES: LogoFrame[] = [
  ...Array.from({ length: 4 }, (_, ay) => ({ phase: 0, active: "left" as const, ax: 2, ay, flash: false, white: false })),
  ...Array.from({ length: 3 }, (_, ay) => ({ phase: 1, active: "top" as const, ax: 2, ay, flash: false, white: false })),
  ...Array.from({ length: 5 }, (_, ay) => ({ phase: 2, active: "right" as const, ax: 5, ay, flash: false, white: false })),
  { phase: 3, active: "none", ax: 0, ay: 0, flash: false, white: false },
  { phase: 3, active: "none", ax: 0, ay: 0, flash: true, white: false },
  { phase: 3, active: "none", ax: 0, ay: 0, flash: false, white: false },
  { phase: 3, active: "none", ax: 0, ay: 0, flash: true, white: false },
  { phase: 4, active: "none", ax: 0, ay: 0, flash: false, white: false },
  { phase: 5, active: "none", ax: 0, ay: 0, flash: false, white: false },
  { phase: 5, active: "none", ax: 0, ay: 0, flash: false, white: true },
  { phase: 5, active: "none", ax: 0, ay: 0, flash: false, white: false },
  { phase: 5, active: "none", ax: 0, ay: 0, flash: false, white: true },
  { phase: 6, active: "none", ax: 0, ay: 0, flash: false, white: false },
];
const LAST_FRAME_INDEX = LOGO_FRAMES.length - 1;
const LOGO_COLS = 8;
const LOGO_ROWS = 7;
const LOGO_PIXEL_WIDTH = 14; // 8 双宽字符

const WHITE_CELLS = new Set([
  "3,2", "3,3", "3,4", "4,2", "4,4", "5,2", "5,3", "5,5", "6,2", "6,5",
]);
const P4_CYAN = new Set(["2,2", "2,3", "2,4", "3,4"]);
const P4_RED = new Set(["3,2", "4,2", "4,3", "5,2"]);
const P4_GREEN = new Set(["4,5", "5,5"]);
const P5_CYAN = new Set(["3,2", "3,3", "3,4", "4,4"]);
const P5_RED = new Set(["4,2", "5,2", "5,3", "6,2"]);
const P5_GREEN = new Set(["5,5", "6,5"]);
const EARLY_ORANGE = new Set(["6,1", "6,2", "6,3", "6,4"]);
const LATE_GREEN = new Set(["4,5", "5,5", "6,5", "6,6"]);
const PIECE_LEFT: [number, number][] = [[0, 0], [1, 0], [1, 1], [2, 0]];
const PIECE_TOP: [number, number][] = [[0, 0], [0, 1], [0, 2], [1, 2]];
const PIECE_RIGHT: [number, number][] = [[0, 0], [1, 0], [2, 0], [2, 1]];

function colorCell(color: LogoColor, theme: Theme): string {
  const accent = theme.getFgAnsi("accent");
  const bright = theme.getFgAnsi("borderAccent");
  switch (color) {
    case "cyan": return "\x1b[36m██\x1b[39m";
    case "red": return "\x1b[31m██\x1b[39m";
    case "green": return "\x1b[32m██\x1b[39m";
    case "orange":
    case "flash": return "\x1b[33m██\x1b[39m";
    case "white": return "\x1b[39m██";
    case "logo": return `${accent}██\x1b[39m`;
    case "logoStripe": return `${accent}──\x1b[39m`;
    case "l1": return `${bright}██\x1b[39m`;
    case "l2": return `${accent}██\x1b[39m`;
    case "l3": return `${accent}██\x1b[39m`;
    case "l4": return `${accent}██\x1b[39m`;
    case "s1":
    case "s2":
    case "s3":
    case "s4": return `${accent}──\x1b[39m`;
    default: return "  ";
  }
}

function logoCellColor(frame: LogoFrame, y: number, x: number): LogoColor {
  const key = `${y},${x}`;

  if (frame.white) return WHITE_CELLS.has(key) ? "white" : "panel";
  if (frame.flash && y === 6 && x >= 1 && x <= 6) return "flash";

  if (frame.active === "left" && PIECE_LEFT.some(([dy, dx]) => y === frame.ay + dy && x === frame.ax + dx)) return "red";
  if (frame.active === "top" && PIECE_TOP.some(([dy, dx]) => y === frame.ay + dy && x === frame.ax + dx)) return "cyan";
  if (frame.active === "right" && PIECE_RIGHT.some(([dy, dx]) => y === frame.ay + dy && x === frame.ax + dx)) return "green";

  if (frame.phase === 6) {
    // 最终定格：彩色 π（青顶横 + 红左竖 + 绿右竖）
    if (P5_CYAN.has(key)) return "cyan";
    if (P5_RED.has(key)) return "red";
    if (P5_GREEN.has(key)) return "green";
    return "panel";
  }
  if (frame.phase === 4) {
    if (P4_CYAN.has(key)) return "cyan";
    if (P4_RED.has(key)) return "red";
    if (P4_GREEN.has(key)) return "green";
    return "panel";
  }
  if (frame.phase >= 5) {
    if (P5_CYAN.has(key)) return "cyan";
    if (P5_RED.has(key)) return "red";
    if (P5_GREEN.has(key)) return "green";
    return "panel";
  }
  if (frame.phase <= 3 && EARLY_ORANGE.has(key)) return "orange";
  if (frame.phase >= 2 && P4_CYAN.has(key)) return "cyan";
  if (frame.phase >= 1 && P4_RED.has(key)) return "red";
  if (frame.phase >= 3 && LATE_GREEN.has(key)) return "green";
  return "panel";
}

function piLogoFrame(frameIndex: number, theme: Theme): string[] {
  const frame = LOGO_FRAMES[frameIndex];
  const lines: string[] = [];
  for (let y = 1; y <= LOGO_ROWS; y++) {
    let line = "";
    for (let x = 1; x <= LOGO_COLS; x++) line += colorCell(logoCellColor(frame, y, x), theme);
    lines.push(line);
  }
  return lines;
}

// ===== resource stats (filesystem scan) =====

function countSkills(dir: string, depth = 0): number {
  if (depth > 4 || !existsSync(dir)) return 0;
  let count = 0;
  try {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (existsSync(join(dir, e.name, "SKILL.md"))) count++;
        else count += countSkills(join(dir, e.name), depth + 1);
      }
    }
  } catch {
    /* ignore */
  }
  return count;
}

function countFiles(dir: string, ext: string): number {
  if (!existsSync(dir)) return 0;
  try {
    return readdirSync(dir).filter((f) => f.endsWith(ext)).length;
  } catch {
    return 0;
  }
}

function countResourcePaths(pkgDir: string, paths: string[], kind: "skills" | "prompts" | "themes" | "extensions"): number {
  let count = 0;
  for (const p of paths) {
    let d = join(pkgDir, p);
    if (!existsSync(d)) d = join(pkgDir, p.replace(/^(\.\.?\/)+/, ""));
    if (!existsSync(d)) continue;
    try {
      if (statSync(d).isDirectory()) {
        if (kind === "skills") count += countSkills(d);
        else if (kind === "prompts") count += countFiles(d, ".md");
        else if (kind === "themes") count += countFiles(d, ".json");
        else count += 1;
      } else {
        count += 1;
      }
    } catch {
      /* skip */
    }
  }
  return count;
}

function computeStats(ctx: ExtensionContext): { skills: number; prompts: number; extensions: number; themes: number } {
  const agentDir = getAgentDir();
  const npmRoot = join(agentDir, "npm", "node_modules");

  let skills = countSkills(join(agentDir, "skills")) + countSkills(join(ctx.cwd, ".agents", "skills")) + countSkills(join(ctx.cwd, ".pi", "skills"));
  let prompts = countFiles(join(agentDir, "prompts"), ".md") + countFiles(join(ctx.cwd, ".pi", "prompts"), ".md");
  let themes = countFiles(join(agentDir, "themes"), ".json") + countFiles(join(ctx.cwd, ".pi", "themes"), ".json");
  let extensions = countFiles(join(agentDir, "extensions"), ".ts") + countFiles(join(ctx.cwd, ".pi", "extensions"), ".ts");

  try {
    const settings = JSON.parse(readFileSync(join(agentDir, "settings.json"), "utf-8"));
    if (Array.isArray(settings.packages)) {
      for (const p of settings.packages) {
        const str = String(p);
        const pkgDir = str.startsWith("npm:") ? join(npmRoot, ...str.slice(4).split("/")) : isAbsolute(str) ? str : resolve(agentDir, str);
        const pj = join(pkgDir, "package.json");
        if (!existsSync(pj)) continue;
        try {
          const m = JSON.parse(readFileSync(pj, "utf-8"));
          const pi = m.pi ?? {};
          const hasPiManifest = Array.isArray(pi.extensions) || Array.isArray(pi.skills) || Array.isArray(pi.prompts) || Array.isArray(pi.themes);
          if (hasPiManifest) {
            if (Array.isArray(pi.skills)) skills += countResourcePaths(pkgDir, pi.skills, "skills");
            if (Array.isArray(pi.prompts)) prompts += countResourcePaths(pkgDir, pi.prompts, "prompts");
            if (Array.isArray(pi.themes)) themes += countResourcePaths(pkgDir, pi.themes, "themes");
            if (Array.isArray(pi.extensions)) extensions += countResourcePaths(pkgDir, pi.extensions, "extensions");
          } else {
            skills += countSkills(join(pkgDir, "skills"));
            prompts += countFiles(join(pkgDir, "prompts"), ".md");
            themes += countFiles(join(pkgDir, "themes"), ".json");
            extensions += countFiles(join(pkgDir, "extensions"), ".ts");
          }
        } catch {
          /* skip */
        }
      }
    }
  } catch {
    /* no settings.json */
  }

  return { skills, prompts, extensions, themes };
}

// ===== welcome / 鸡汤文 (built-in pool + hitokoto API fallback) =====

const WELCOME_POOL: string[] = [
  "星光不问赶路人，时光不负有心人",
  "你若盛开，蝴蝶自来",
  "心之所向，素履以往",
  "慢慢来，比较快",
  "所有的美好都会如期而至",
  "愿你历尽千帆，归来仍是少年",
  "生活明朗，万物可爱",
];

/** Fetch a hitokoto (鸡汤文) from the public API; returns null on any failure. */
async function fetchHitokoto(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch("https://v1.hitokoto.cn/", { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as { hitokoto?: string };
    return data.hitokoto && data.hitokoto.length > 0 ? data.hitokoto : null;
  } catch {
    return null;
  }
}

// ===== header component (logo animation + info panel) =====

class GgbondHeader {
  private frame = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly stats: ReturnType<typeof computeStats>;
  private welcomeText: string;

  constructor(
    private readonly ctx: ExtensionContext,
    private readonly tui: TUI,
    skipAnimation: boolean,
  ) {
    this.stats = computeStats(ctx);
    // 初始用内置鸡汤（同步，启动即显示）
    this.welcomeText = WELCOME_POOL[Math.floor(Math.random() * WELCOME_POOL.length)];
    // 异步拉取接口鸡汤，成功则替换（失败保持内置）
    void fetchHitokoto().then((text) => {
      if (text) {
        this.welcomeText = text;
        this.tui.requestRender();
      }
    });

    if (skipAnimation) {
      this.frame = LAST_FRAME_INDEX;
    } else {
      const interval = 50;
      const tick = () => {
        if (this.frame < LAST_FRAME_INDEX) {
          this.frame++;
          this.tui.requestRender();
          this.timer = setTimeout(tick, interval);
        } else {
          this.timer = null;
          this.tui.requestRender();
        }
      };
      this.timer = setTimeout(tick, interval);
      this.timer.unref?.();
    }
  }

  render(width: number): string[] {
    const theme = this.ctx.ui.theme;
    const muted = (s: string) => theme.fg("muted", s);
    const dim = (s: string) => theme.fg("dim", s);

    const logoLines = piLogoFrame(this.frame, theme);
    const logoWidth = LOGO_PIXEL_WIDTH;
    const infoMaxWidth = Math.max(0, width - LOGO_PIXEL_WIDTH);

    const modelId = this.ctx.model?.id || "Default";
    const provider = this.ctx.model ? `(${this.ctx.model.provider}) ` : "";
    const effort = this.ctx.thinkingLevel ?? "off";
    const stats = this.stats;
    const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

    const piText = `${theme.bold(theme.fg("accent", "Pi"))} ${muted(`v${VERSION}`)}`;
    const welcome = theme.fg("accent", theme.bold(this.welcomeText));
    const modelLine = `🤖 ${muted(`${provider}${modelId}`)} · 🧠 ${muted(effort)}`;
    const statsLine = dim(`📦 ${plural(stats.skills, "skill")} · ${plural(stats.prompts, "prompt")} · ${plural(stats.extensions, "extension")} · ${plural(stats.themes, "theme")}`);

    const infoRows: Record<number, string> = { 2: piText, 3: welcome, 4: modelLine, 5: statsLine };

    const lines: string[] = [];
    for (let i = 0; i < logoLines.length; i++) {
      const right = infoRows[i + 1] ?? "";
      const logo = logoLines[i];
      const logoVisible = visibleWidth(logo);
      const pad = " ".repeat(Math.max(1, logoWidth - logoVisible));
      const clipped = truncateToWidth(right, Math.max(0, infoMaxWidth), "");
      lines.push(logo + pad + clipped);
    }
    return lines.map((l) => truncateToWidth(l, width, ""));
  }

  invalidate(): void {}

  dispose(): void {
    if (this.timer != null) clearTimeout(this.timer);
  }
}

/** Create the header component factory. */
export function createHeader(ctx: ExtensionContext) {
  return (tui: TUI) => new GgbondHeader(ctx, tui, false);
}
