// CLI: the unskip CI guard (Obol pilot §3.2/§4). Runs on EVERY PR (spec PR + implement PR):
//   - a NEW test file may be authored only if every test in it is `.skip`'d (spec PR);
//   - an EXISTING test file may change ONLY by removing `.skip` (implement PR).
// implement can thus neither author active tests nor edit existing ones. Fail-closed (exit 1).
//
// SCOPE: the seam applies to the tests devloop MANAGES (those `spec-to-tests` derives from a
// reviewed spec), not to every test file in the repo. The target repo declares them in
// `.devloop/managed-tests.json` (glob list) — read from the BASE; changing it is a config change
// that needs a CODEOWNERS review (verify-review, #13), so an agent cannot widen it on its own.
// No such file => every test file is managed (today's behaviour, fail-closed).
// Deliberately NOT branch-name-driven: an agent chooses its own branch name.
//
// Usage: verify-unskip <repoPath> <baseRef> [headBranch]   (baseRef e.g. origin/main)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isAllowedTestEdit, isSpecBranch } from "../core/unskip.js";
import { parseNulPaths } from "../core/diff-paths.js";
import { readTreeEntry, TreeEntryReadError } from "../core/tree-entry.js";
import { MANAGED_TESTS_PATH, isManagedTestPath, parseManagedTestGlobs, } from "../core/managed-tests.js";
const repo = process.argv[2] ?? ".";
const base = process.argv[3] ?? "origin/main";
const headBranch = process.argv[4] ?? "";
// Spec-PR: spec-to-tests is the legitimate test author here (gated by spec-review + vitest +
// mutation). The unskip seam applies only to the Impl-PR. No-op pass on devloop/spec/* branches.
if (isSpecBranch(headBranch)) {
    process.stdout.write(JSON.stringify({ ok: true, skipped: "spec-PR (devloop/spec/*)" }) + "\n");
    process.exit(0);
}
// What counts as a test file: vitest's DEFAULT include (**/*.{test,spec}.?(c|m)[jt]s?(x)).
// Limit: a project with its own `include`, or another runner, can run files this does not name
// (see #21).
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;
// The glob list is read from the BASE ref first: the scope that is already on the protected
// branch decides, so a PR cannot loosen the seam for itself. Only if the file does not exist on
// base do we fall back to the checkout (a repo adopting the file — that PR necessarily touches
// `.devloop/**`, a config change that verify-review handles: review required unless initial adoption).
const readWorktree = (rel) => {
    try {
        return readFileSync(join(repo, rel), "utf8");
    }
    catch {
        return "";
    }
};
// Read errors fail closed (exit 1) — never "empty", never a fallback to the PR's own worktree.
const fail = (msg) => {
    process.stderr.write(`verify-unskip: ${msg}\n`);
    process.exit(1);
};
const entryAt = (ref, path) => {
    try {
        return readTreeEntry(repo, ref, path);
    }
    catch (e) {
        return fail(e instanceof TreeEntryReadError ? e.message : `cannot read ${path} @ ${ref}: ${String(e)}`);
    }
};
const cfg = entryAt(base, MANAGED_TESTS_PATH);
if (cfg.kind !== "missing" && cfg.kind !== "file") {
    fail(`${MANAGED_TESTS_PATH} @ ${base} exists but is not a regular file (${cfg.kind}); refusing to guess the scope`);
}
const fromBase = cfg.kind === "file" ? cfg.content : "";
const fromWorktree = cfg.kind === "missing" ? readWorktree(MANAGED_TESTS_PATH) : "";
const managedRaw = cfg.kind === "file" ? fromBase : fromWorktree;
const managedSource = cfg.kind === "file" ? "base" : fromWorktree !== "" ? "worktree" : "default";
const managedGlobs = parseManagedTestGlobs(managedRaw);
// The changed paths: NUL-separated (-z: no quoting of non-ASCII/special characters) and without
// rename detection (a rename shows BOTH the old and the new path, so the old one is judged as a
// deletion). Unlike `git show` of an absent file, a failing diff (unresolvable base, ...) is NOT
// "no test files": it fails closed with exit 1.
const changedPaths = () => {
    try {
        const raw = execFileSync("git", ["-C", repo, "diff", "--no-renames", "-z", "--name-only", `${base}...HEAD`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 * 1024 * 1024 });
        return parseNulPaths(raw);
    }
    catch (e) {
        const detail = String(e.stderr ?? e.message ?? e).trim();
        process.stderr.write(`verify-unskip: cannot compute the changed paths against base "${base}" (git diff failed): ${detail}\n`);
        process.exit(1);
    }
};
const testFiles = changedPaths().filter((f) => TEST_FILE.test(f));
const changed = testFiles.filter((f) => isManagedTestPath(f, managedGlobs));
const unmanaged = testFiles.filter((f) => !isManagedTestPath(f, managedGlobs));
const violations = [];
const describe = (e) => e.kind === "symlink"
    ? "symlink"
    : e.kind === "submodule"
        ? "submodule (gitlink)"
        : e.kind === "other"
            ? e.type
            : null;
const contentOf = (e) => (e.kind === "file" ? e.content : ""); // "" = absent
for (const file of changed) {
    const oldEntry = entryAt(base, file);
    const newEntry = entryAt("HEAD", file);
    // The diff reported this path as changed, so it exists in base or HEAD. Missing in both means
    // the read missed it (e.g. a name that did not survive decoding): a read error, never "empty".
    if (oldEntry.kind === "missing" && newEntry.kind === "missing") {
        fail(`changed test path ${JSON.stringify(file)} was found in neither ${base} nor HEAD (read error)`);
    }
    const oldType = describe(oldEntry);
    const newType = describe(newEntry);
    if (oldType !== null || newType !== null) {
        const where = [oldType !== null ? `${oldType} in base` : "", newType !== null ? `${newType} in HEAD` : ""]
            .filter((x) => x !== "")
            .join(", ");
        violations.push({
            file,
            reason: `managed test path is not a regular file (${where}); only regular test files are allowed`,
        });
        continue;
    }
    const oldContent = contentOf(oldEntry); // "" if the file is new
    const newContent = contentOf(newEntry);
    if (!isAllowedTestEdit(oldContent, newContent)) {
        violations.push({
            file,
            reason: oldContent === ""
                ? "new test file contains an active (non-.skip) test (spec-PR tests must be skipped)"
                : newContent === ""
                    ? "existing test file deleted or emptied (also when renamed away; implement must not remove tests)"
                    : "existing test file changed beyond removing `.skip` (implement must not edit tests)",
        });
    }
}
const ok = violations.length === 0;
process.stdout.write(JSON.stringify({
    ok,
    base,
    // Which scope was in force — printed so a green run is never silently a disarmed one.
    managed: managedGlobs === null ? "all-test-files (no .devloop/managed-tests.json)" : managedGlobs,
    managedSource,
    checked: changed,
    unmanaged,
    violations,
}, null, 2) + "\n");
process.exit(ok ? 0 : 1);
