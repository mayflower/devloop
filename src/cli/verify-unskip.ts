// CLI: the unskip CI guard (Obol pilot §3.2/§4). Runs on the implement PR; asserts that every
// changed test file differs from the base ONLY by removed `.skip` tokens — implement may
// activate tests, never rewrite/add/remove them. Fail-closed (exit 1) on any violation.
//
// Usage: verify-unskip <repoPath> <baseRef>   (baseRef e.g. origin/main)

import { execFileSync } from "node:child_process";
import { isUnskipOnly } from "../core/unskip.js";

const repo = process.argv[2] ?? ".";
const base = process.argv[3] ?? "origin/main";

const gitSafe = (args: string[]): string => {
  try {
    return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  } catch {
    return "";
  }
};

const TEST_FILE = /\.(test|spec)\.[jt]sx?$/;

const changed = gitSafe(["diff", "--name-only", `${base}...HEAD`])
  .split("\n")
  .filter((f) => TEST_FILE.test(f));

const violations: { file: string; reason: string }[] = [];
for (const file of changed) {
  const oldContent = gitSafe(["show", `${base}:${file}`]); // "" if the file is new
  const newContent = gitSafe(["show", `HEAD:${file}`]);
  if (!isUnskipOnly(oldContent, newContent)) {
    violations.push({
      file,
      reason: "test file changed beyond removing `.skip` (implement must not author/edit tests)",
    });
  }
}

const ok = violations.length === 0;
process.stdout.write(JSON.stringify({ ok, base, checked: changed, violations }, null, 2) + "\n");
process.exit(ok ? 0 : 1);
