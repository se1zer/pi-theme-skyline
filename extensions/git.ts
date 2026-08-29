/** Parsed git status. */
export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: number;
  modified: number;
  untracked: number;
  deleted: number;
}

/** Empty git status (not in a repo, or git unavailable). */
export const EMPTY_GIT_STATUS: GitStatus = {
  branch: "",
  ahead: 0,
  behind: 0,
  staged: 0,
  modified: 0,
  untracked: 0,
  deleted: 0,
};

/** Parse `git status -sb` output into branch + ahead/behind + staged/modified/untracked/deleted. */
export function parseGitStatus(stdout: string): GitStatus {
  const lines = stdout.split("\n").filter((l) => l.length > 0);
  const head = lines[0] ?? "";

  let branch = "";
  let ahead = 0;
  let behind = 0;
  let staged = 0;
  let modified = 0;
  let untracked = 0;
  let deleted = 0;

  const content = head.startsWith("## ") ? head.slice(3) : "";
  const bracketIdx = content.indexOf(" [");
  const statusStr = bracketIdx >= 0 ? content.slice(bracketIdx + 2, -1) : "";
  const branchPart = bracketIdx >= 0 ? content.slice(0, bracketIdx) : content;
  branch = branchPart.split("...")[0];

  const aheadM = statusStr.match(/ahead (\d+)/);
  const behindM = statusStr.match(/behind (\d+)/);
  if (aheadM) ahead = parseInt(aheadM[1], 10);
  if (behindM) behind = parseInt(behindM[1], 10);

  // Porcelain v1: "XY path" — X = index (staged), Y = worktree.
  for (let i = 1; i < lines.length; i++) {
    const x = lines[i][0] ?? "";
    const y = lines[i][1] ?? "";
    if (x === "?" && y === "?") {
      untracked++;
    } else if (x === "D" || y === "D") {
      deleted++;
    } else if (y === "M") {
      modified++;
    } else if (x !== " " && x !== "!") {
      staged++;
    }
  }

  return { branch, ahead, behind, staged, modified, untracked, deleted };
}
