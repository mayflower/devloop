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

const approveMerge = () => {
  mkdirSync(join(repo, ".devloop"), { recursive: true });
  writeFileSync(join(repo, ".devloop", "t3-merge.approved"), "deadbeef");
};

test("blocks a merge command when the t3-merge token is absent", () => {
  const r = evaluateHook({ tool_name: "Bash", tool_input: { command: "gh pr merge 42 --squash" } }, repo);
  expect(r.block).toBe(true);
});

test("blocks a raw git merge too", () => {
  expect(evaluateHook({ tool_name: "Bash", tool_input: { command: "git merge feature" } }, repo).block).toBe(true);
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
