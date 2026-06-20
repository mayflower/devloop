// CLI: /devloop:cleanup — detect local branches merged on the remote default and prune them
// (and their worktrees). Dry-run by default; pass --apply to actually delete. Safe by design:
// the pure planner (core/prune) excludes protected/current/unmerged; deletion uses `git
// branch -d` (refuses unmerged) as a second net; everything done is reported (no silent prune).
//
// Usage: cleanup [repoPath] [--apply]
import { execFileSync } from "node:child_process";
import { planPrune } from "../core/prune.js";
const apply = process.argv.includes("--apply");
const repo = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? ".";
const git = (args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
const gitSafe = (args) => {
    try {
        return git(args);
    }
    catch {
        return "";
    }
};
function defaultBranch() {
    const head = gitSafe(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]); // "origin/main"
    if (head)
        return head.replace(/^origin\//, "");
    for (const candidate of ["main", "master"]) {
        if (gitSafe(["rev-parse", "--verify", candidate]))
            return candidate;
    }
    return "main";
}
gitSafe(["fetch", "--prune"]); // best-effort: keeps merged-detection accurate; tolerate offline
const def = defaultBranch();
const base = gitSafe(["rev-parse", "--verify", `origin/${def}`]) ? `origin/${def}` : def;
const current = gitSafe(["branch", "--show-current"]);
const merged = new Set(gitSafe(["branch", "--merged", base, "--format=%(refname:short)"]).split("\n").filter(Boolean));
const all = gitSafe(["branch", "--format=%(refname:short)"]).split("\n").filter(Boolean);
// Map branch -> worktree path (so a pruned branch's worktree is removed too).
const worktreeOf = {};
let wtPath = "";
for (const line of gitSafe(["worktree", "list", "--porcelain"]).split("\n")) {
    if (line.startsWith("worktree "))
        wtPath = line.slice("worktree ".length);
    else if (line.startsWith("branch "))
        worktreeOf[line.slice("branch ".length).replace("refs/heads/", "")] = wtPath;
}
const branches = all.map((name) => ({
    name,
    mergedIntoDefault: merged.has(name),
    isCurrent: name === current,
    worktreePath: worktreeOf[name],
}));
const protectedBranches = [...new Set([def, "main", "master"])];
const plan = planPrune(branches, protectedBranches);
const results = [];
if (apply) {
    for (const d of plan.delete) {
        if (d.worktreePath)
            gitSafe(["worktree", "remove", d.worktreePath]);
        try {
            git(["branch", "-d", d.name]); // -d refuses if git disagrees about merged-ness
            results.push({ name: d.name, status: "deleted" });
        }
        catch {
            results.push({ name: d.name, status: "skipped (git -d refused — unmerged?)" });
        }
    }
    gitSafe(["worktree", "prune"]);
}
process.stdout.write(JSON.stringify({ base, current, plan, applied: apply, results }, null, 2) + "\n");
