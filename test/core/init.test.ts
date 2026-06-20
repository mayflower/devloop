import { test, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
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

test("init records the anchor explicitly as b (config.json), so the local hook defers to CI", () => {
  initRepo(repo, TEMPLATE);
  const cfgPath = join(repo, ".devloop/config.json");
  expect(existsSync(cfgPath)).toBe(true);
  expect(JSON.parse(readFileSync(cfgPath, "utf8")).anchor).toBe("b");
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

test("does NOT write .devloop/tier-map.json when the repo already has a tier-map (no shadowing)", () => {
  // Obol case: tools/tier-map.json exists; writing a default .devloop/ map would shadow it
  // (resolveTierMapPath prefers .devloop/) -> a silent gate regression.
  mkdirSync(join(repo, "tools"), { recursive: true });
  writeFileSync(join(repo, "tools/tier-map.json"), JSON.stringify({ T3: ["tools/**"], T1: ["**"] }));
  const r = initRepo(repo, TEMPLATE);
  expect(existsSync(join(repo, ".devloop/tier-map.json"))).toBe(false);
  expect(r.notes.join(" ")).toMatch(/tier-map/i);
});

test("on upgrade, an existing workflow is NOT silently updated — loud note + --force overwrites", () => {
  mkdirSync(join(repo, ".github/workflows"), { recursive: true });
  writeFileSync(join(repo, ".github/workflows/devloop-precondition-check.yml"), "old-v0.1-content");

  const noForce = initRepo(repo, "NEW-TEMPLATE");
  expect(readFileSync(join(repo, ".github/workflows/devloop-precondition-check.yml"), "utf8")).toBe("old-v0.1-content");
  expect(noForce.notes.join(" ")).toMatch(/NOT updated|--force|migrate/i);

  const forced = initRepo(repo, "NEW-TEMPLATE", { force: true });
  expect(readFileSync(join(repo, ".github/workflows/devloop-precondition-check.yml"), "utf8")).toBe("NEW-TEMPLATE");
  expect(forced.created.concat(forced.notes).join(" ")).toMatch(/workflow/i);
});
