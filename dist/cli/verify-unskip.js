// CLI: the unskip CI guard (Obol pilot §3.2/§4). Runs on EVERY PR (spec PR + implement PR):
//   - a NEW test file may be authored only if every test in it is `.skip`'d (spec PR);
//   - an EXISTING test file may change ONLY by removing `.skip` (implement PR).
// implement can thus neither author active tests nor edit existing ones. Fail-closed (exit 1).
//
// Usage: verify-unskip <repoPath> <baseRef>   (baseRef e.g. origin/main)
import { execFileSync } from "node:child_process";
import { isAllowedTestEdit } from "../core/unskip.js";
const repo = process.argv[2] ?? ".";
const base = process.argv[3] ?? "origin/main";
const gitSafe = (args) => {
    try {
        return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" });
    }
    catch {
        return "";
    }
};
const TEST_FILE = /\.(test|spec)\.[jt]sx?$/;
const changed = gitSafe(["diff", "--name-only", `${base}...HEAD`])
    .split("\n")
    .filter((f) => TEST_FILE.test(f));
const violations = [];
for (const file of changed) {
    const oldContent = gitSafe(["show", `${base}:${file}`]); // "" if the file is new
    const newContent = gitSafe(["show", `HEAD:${file}`]);
    if (!isAllowedTestEdit(oldContent, newContent)) {
        violations.push({
            file,
            reason: oldContent === ""
                ? "new test file contains an active (non-.skip) test (spec-PR tests must be skipped)"
                : "existing test file changed beyond removing `.skip` (implement must not edit tests)",
        });
    }
}
const ok = violations.length === 0;
process.stdout.write(JSON.stringify({ ok, base, checked: changed, violations }, null, 2) + "\n");
process.exit(ok ? 0 : 1);
