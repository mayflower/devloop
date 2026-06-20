import { test, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluateHook } from "../../src/hooks/pretooluse.js";

let repo: string;
beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "devloop-hook-"));
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

// A devloop-managed repo has a .devloop/ dir (created by /devloop:init).
const markManaged = () => mkdirSync(join(repo, ".devloop"), { recursive: true });
const approveMerge = () => {
  markManaged();
  writeFileSync(join(repo, ".devloop", "t3-merge.approved"), "deadbeef");
};
// Anchor b is wired when the authoritative CI precondition-check workflow exists.
const wireAnchorBWorkflow = () => {
  mkdirSync(join(repo, ".github", "workflows"), { recursive: true });
  writeFileSync(join(repo, ".github/workflows/devloop-precondition-check.yml"), "name: devloop-precondition-check\n");
};
const setAnchorConfig = (anchor: "a" | "b") => {
  markManaged();
  writeFileSync(join(repo, ".devloop", "config.json"), JSON.stringify({ anchor }));
};

// --- Bug (Obol PR #8): anchor-b repo blocked by the tier/anchor-blind local token --------
test("anchor-b repo (CI precondition-check wired) does NOT block a merge without a local token", () => {
  markManaged();
  wireAnchorBWorkflow(); // anchor b -> CI is authoritative; local anchor-a token is irrelevant
  // No .devloop/t3-merge.approved present (anchor b never writes it).
  expect(evaluateHook({ tool_name: "Bash", tool_input: { command: "gh pr merge 8 --squash" } }, repo).block).toBe(false);
});

test("explicit .devloop/config.json anchor:b makes the hook defer to CI (no block)", () => {
  setAnchorConfig("b");
  expect(evaluateHook({ tool_name: "Bash", tool_input: { command: "gh pr merge 8" } }, repo).block).toBe(false);
});

// --- Anchor a (explicit / no CI anchor): local token is the advisory fast-fail gate ------
test("anchor-a repo (no CI workflow) without token still blocks (opt-in local convenience)", () => {
  markManaged();
  const r = evaluateHook({ tool_name: "Bash", tool_input: { command: "gh pr merge 42 --squash" } }, repo);
  expect(r.block).toBe(true);
});

test("explicit anchor:a without token blocks; with token allows", () => {
  setAnchorConfig("a");
  expect(evaluateHook({ tool_name: "Bash", tool_input: { command: "git merge feature" } }, repo).block).toBe(true);
  writeFileSync(join(repo, ".devloop", "t3-merge.approved"), "deadbeef");
  expect(evaluateHook({ tool_name: "Bash", tool_input: { command: "git merge feature" } }, repo).block).toBe(false);
});

test("does NOT block in a non-devloop repo (no .devloop dir) — global plugin must not interfere", () => {
  // repo has no .devloop/ -> not managed by devloop -> hook is a no-op
  expect(evaluateHook({ tool_name: "Bash", tool_input: { command: "gh pr merge 42" } }, repo).block).toBe(false);
  expect(evaluateHook({ tool_name: "Bash", tool_input: { command: "git merge main" } }, repo).block).toBe(false);
});

test("allows the merge once the token is present", () => {
  approveMerge();
  expect(evaluateHook({ tool_name: "Bash", tool_input: { command: "gh pr merge 42" } }, repo).block).toBe(false);
});

test("allows non-merge Bash commands", () => {
  expect(evaluateHook({ tool_name: "Bash", tool_input: { command: "npm test" } }, repo).block).toBe(false);
});

test("allows non-Bash tools", () => {
  expect(evaluateHook({ tool_name: "Read", tool_input: {} }, repo).block).toBe(false);
});
