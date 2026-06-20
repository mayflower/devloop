import { test, expect } from "vitest";
import { planPrune, type BranchInfo } from "../../src/core/prune.js";

const b = (over: Partial<BranchInfo>): BranchInfo => ({
  name: "feature",
  mergedIntoDefault: false,
  isCurrent: false,
  ...over,
});

const protectedBranches = ["main", "master"];

test("a merged, non-current, non-protected branch is selected for deletion", () => {
  const plan = planPrune([b({ name: "devloop/foo", mergedIntoDefault: true })], protectedBranches);
  expect(plan.delete).toEqual([{ name: "devloop/foo", worktreePath: undefined }]);
});

test("carries the worktree path so the caller can remove it too", () => {
  const plan = planPrune(
    [b({ name: "devloop/foo", mergedIntoDefault: true, worktreePath: "/wt/foo" })],
    protectedBranches,
  );
  expect(plan.delete).toEqual([{ name: "devloop/foo", worktreePath: "/wt/foo" }]);
});

test("protected branches are never deleted, even when merged", () => {
  const plan = planPrune([b({ name: "main", mergedIntoDefault: true })], protectedBranches);
  expect(plan.delete).toEqual([]);
  expect(plan.keep).toContainEqual({ name: "main", reason: "protected" });
});

test("the current branch is never deleted, even when merged", () => {
  const plan = planPrune([b({ name: "devloop/foo", mergedIntoDefault: true, isCurrent: true })], protectedBranches);
  expect(plan.delete).toEqual([]);
  expect(plan.keep).toContainEqual({ name: "devloop/foo", reason: "current branch" });
});

test("an unmerged branch is kept (never lose unmerged work)", () => {
  const plan = planPrune([b({ name: "devloop/wip", mergedIntoDefault: false })], protectedBranches);
  expect(plan.delete).toEqual([]);
  expect(plan.keep).toContainEqual({ name: "devloop/wip", reason: "not merged into default" });
});

test("partitions a mixed set correctly", () => {
  const plan = planPrune(
    [
      b({ name: "main", mergedIntoDefault: true }),
      b({ name: "devloop/done", mergedIntoDefault: true }),
      b({ name: "devloop/current", mergedIntoDefault: true, isCurrent: true }),
      b({ name: "devloop/wip", mergedIntoDefault: false }),
    ],
    protectedBranches,
  );
  expect(plan.delete.map((d) => d.name)).toEqual(["devloop/done"]);
  expect(plan.keep.map((k) => k.name).sort()).toEqual(["devloop/current", "devloop/wip", "main"]);
});
