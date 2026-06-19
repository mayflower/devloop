import { test, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initRepo } from "../../src/core/init.js";

const TEMPLATE = "name: devloop-precondition-check\n# ...\n";

let repo: string;
beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "devloop-init-"));
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

test("init writes the CI binding-anchor workflow (containing the guardian marker)", () => {
  initRepo(repo, TEMPLATE);
  const wf = join(repo, ".github/workflows/devloop-precondition-check.yml");
  expect(existsSync(wf)).toBe(true);
  expect(readFileSync(wf, "utf8")).toContain("devloop-precondition-check");
});

test("init writes the config skeleton (protected-globs + tier-map + bot-logins for anchor b)", () => {
  initRepo(repo, TEMPLATE);
  expect(existsSync(join(repo, ".devloop/protected-globs.json"))).toBe(true);
  expect(existsSync(join(repo, ".devloop/tier-map.json"))).toBe(true);
  expect(existsSync(join(repo, ".devloop/bot-logins.json"))).toBe(true);
});

test("the bootstrapped repo then satisfies the precondition-check guardian", async () => {
  // After init, the workflow marker is present -> checkGuardians no longer reports it.
  initRepo(repo, TEMPLATE);
  const { checkGuardians } = await import("../../src/core/guardians.js");
  expect(checkGuardians(repo).missing).not.toContain("precondition-check");
});

test("init is idempotent: second run skips existing files, never throws", () => {
  const first = initRepo(repo, TEMPLATE);
  expect(first.created.length).toBeGreaterThan(0);
  const second = initRepo(repo, TEMPLATE);
  expect(second.created).toEqual([]);
  expect(second.skipped.length).toBe(first.created.length);
});
