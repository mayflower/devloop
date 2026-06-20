// Cleanup of local branches/worktrees whose work has landed on the remote default branch
// (design §10.1/§10.2: parallel actors create branches+worktrees that go stale after merge).
// PURE decision: given the local branches and what is protected/current/merged, decide which
// are SAFE to prune. Safety rules (never lose work):
//   - never a protected branch (main/master/...)
//   - never the current branch
//   - never an unmerged branch
// The actual git deletion (caller) additionally uses `git branch -d` (refuses unmerged) as a
// second safety net, and reports what it removes (no silent cleanup).

export interface BranchInfo {
  name: string;
  mergedIntoDefault: boolean;
  isCurrent: boolean;
  worktreePath?: string;
}

export interface PrunePlan {
  delete: { name: string; worktreePath?: string }[];
  keep: { name: string; reason: string }[];
}

export function planPrune(branches: BranchInfo[], protectedBranches: string[]): PrunePlan {
  const protectedSet = new Set(protectedBranches);
  const plan: PrunePlan = { delete: [], keep: [] };

  for (const branch of branches) {
    if (protectedSet.has(branch.name)) {
      plan.keep.push({ name: branch.name, reason: "protected" });
    } else if (branch.isCurrent) {
      plan.keep.push({ name: branch.name, reason: "current branch" });
    } else if (!branch.mergedIntoDefault) {
      plan.keep.push({ name: branch.name, reason: "not merged into default" });
    } else {
      plan.delete.push({ name: branch.name, worktreePath: branch.worktreePath });
    }
  }

  return plan;
}
