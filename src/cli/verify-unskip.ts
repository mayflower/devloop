// CLI: the unskip CI guard (Obol pilot §3.2/§4). Runs on EVERY PR (spec PR + implement PR):
//   - a NEW test file may be authored only if every test in it is `.skip`'d (spec PR);
//   - an EXISTING test file may change ONLY by removing `.skip` (implement PR).
// implement can thus neither author active tests nor edit existing ones. Fail-closed (exit 1).
//
// SCOPE: the seam applies to the tests devloop MANAGES (those `spec-to-tests` derives from a
// reviewed spec), not to every test file in the repo. The target repo declares them in
// `.devloop/managed-tests.json` (glob list) — a file inside the protected set, so an agent
// cannot widen it. No such file => every test file is managed (today's behaviour, fail-closed).
// Deliberately NOT branch-name-driven: an agent chooses its own branch name.
//
// Usage: verify-unskip <repoPath> <baseRef> [headBranch]   (baseRef e.g. origin/main)

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isAllowedTestEdit, isSpecBranch } from "../core/unskip.js";
import {
  MANAGED_TESTS_PATH,
  isManagedTestPath,
  parseManagedTestGlobs,
} from "../core/managed-tests.js";

const repo = process.argv[2] ?? ".";
const base = process.argv[3] ?? "origin/main";
const headBranch = process.argv[4] ?? "";

// Spec-PR: spec-to-tests is the legitimate test author here (gated by spec-review + vitest +
// mutation). The unskip seam applies only to the Impl-PR. No-op pass on devloop/spec/* branches.
if (isSpecBranch(headBranch)) {
  process.stdout.write(JSON.stringify({ ok: true, skipped: "spec-PR (devloop/spec/*)" }) + "\n");
  process.exit(0);
}

const gitSafe = (args: string[]): string => {
  try {
    // stderr ignored: `git show <ref>:<new file>` legitimately fails for every file the PR adds
    // (and for an absent config) — the "fatal: path ... does not exist" noise is not a finding.
    return execFileSync("git", ["-C", repo, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return "";
  }
};

const TEST_FILE = /\.(test|spec)\.[jt]sx?$/;

// The glob list is read from the BASE ref first: the scope that is already on the protected
// branch decides, so a PR cannot loosen the seam for itself. Only if the file does not exist on
// base do we fall back to the checkout (a repo adopting the file — that PR necessarily touches
// `.devloop/**` = the protected set and is already flagged by verify-review).
const readWorktree = (rel: string): string => {
  try {
    return readFileSync(join(repo, rel), "utf8");
  } catch {
    return "";
  }
};
const fromBase = gitSafe(["show", `${base}:${MANAGED_TESTS_PATH}`]);
const fromWorktree = fromBase === "" ? readWorktree(MANAGED_TESTS_PATH) : "";
const managedRaw = fromBase !== "" ? fromBase : fromWorktree;
const managedSource = fromBase !== "" ? "base" : fromWorktree !== "" ? "worktree" : "default";
const managedGlobs = parseManagedTestGlobs(managedRaw);

const testFiles = gitSafe(["diff", "--name-only", `${base}...HEAD`])
  .split("\n")
  .filter((f) => TEST_FILE.test(f));

const changed = testFiles.filter((f) => isManagedTestPath(f, managedGlobs));
const unmanaged = testFiles.filter((f) => !isManagedTestPath(f, managedGlobs));

const violations: { file: string; reason: string }[] = [];
for (const file of changed) {
  const oldContent = gitSafe(["show", `${base}:${file}`]); // "" if the file is new
  const newContent = gitSafe(["show", `HEAD:${file}`]);
  if (!isAllowedTestEdit(oldContent, newContent)) {
    violations.push({
      file,
      reason:
        oldContent === ""
          ? "new test file contains an active (non-.skip) test (spec-PR tests must be skipped)"
          : "existing test file changed beyond removing `.skip` (implement must not edit tests)",
    });
  }
}

const ok = violations.length === 0;
process.stdout.write(
  JSON.stringify(
    {
      ok,
      base,
      // Which scope was in force — printed so a green run is never silently a disarmed one.
      managed: managedGlobs === null ? "all-test-files (no .devloop/managed-tests.json)" : managedGlobs,
      managedSource,
      checked: changed,
      unmanaged,
      violations,
    },
    null,
    2,
  ) + "\n",
);
process.exit(ok ? 0 : 1);
