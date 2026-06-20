import { test, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const fx = (n: string) => resolve(root, "test/fixtures", n);
// Run the built dist with node (sandbox-clean, tests the shipped artifact). `.ts` -> `.js`.
const cli = (rel: string) => resolve(root, "dist/cli", rel.replace(/\.ts$/, ".js"));

function run(script: string, args: string[] = [], input?: string) {
  return spawnSync("node", [cli(script), ...args], {
    encoding: "utf8",
    input,
    cwd: root,
  });
}

test("check-guardians exits 1 and lists missing on incomplete repo", () => {
  const r = run("check-guardians.ts", [fx("repo-missing-stryker")]);
  expect(r.status).toBe(1);
  expect(JSON.parse(r.stdout).missing).toContain("mutation-ratchet");
});

test("check-guardians exits 0 on a full-guardian repo", () => {
  const r = run("check-guardians.ts", [fx("repo-full-guardians")]);
  expect(r.status).toBe(0);
  expect(JSON.parse(r.stdout)).toEqual({ ok: true, missing: [] });
});

test("next-action returns SPAWN specify for an init state", () => {
  const state = { tier: "T2", guardians: { ok: true, missing: [] }, phase: "init", humanApprovals: {} };
  const r = run("next-action.ts", [], JSON.stringify(state));
  expect(r.status).toBe(0);
  expect(JSON.parse(r.stdout)).toEqual({ kind: "SPAWN_STATION", station: "specify" });
});

test("derive-tier returns the highest touched tier", () => {
  const input = JSON.stringify({
    touched: ["src/x.ts", "db/migrations/001.sql"],
    tierMap: {
      rules: [
        { tier: "T3", anyOf: ["**/migrations/**"] },
        { tier: "T2", anyOf: ["src/**"] },
      ],
      default: "T0",
    },
  });
  const r = run("derive-tier.ts", [], input);
  expect(r.status).toBe(0);
  expect(JSON.parse(r.stdout)).toEqual({ tier: "T3" });
});
