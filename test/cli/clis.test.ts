import { test, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

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
  expect(JSON.parse(r.stdout).tier).toBe("T3");
});

test("init pins the reusable action to the current version (no ${DEVLOOP_REF} placeholder leaks)", () => {
  const repo = mkdtempSync(join(tmpdir(), "devloop-initpin-"));
  try {
    const r = spawnSync("node", [resolve(root, "dist/cli/init.js"), repo], { encoding: "utf8" });
    expect(r.status).toBe(0);
    const wf = readFileSync(join(repo, ".github/workflows/devloop-precondition-check.yml"), "utf8");
    const version = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version;
    expect(wf).toContain(`precondition-check@v${version}`);
    expect(wf).not.toContain("${DEVLOOP_REF}");
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("derive-tier --repo mode locates the repo's tier-map by absolute path (no tsx, no module-relative load)", () => {
  const repo = mkdtempSync(join(tmpdir(), "devloop-dt-"));
  try {
    mkdirSync(join(repo, "tools"), { recursive: true });
    // Obol-style record map under tools/
    writeFileSync(
      join(repo, "tools/tier-map.json"),
      JSON.stringify({ T3: ["**/migrations/**"], T2: ["services/**"], T1: ["**"] }),
    );
    const input = JSON.stringify({ touched: ["services/db/migrations/1.sql"], repo });
    const r = run("derive-tier.ts", [], input);
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.tier).toBe("T3");
    expect(out.tierMapPath).toBe(join(repo, "tools/tier-map.json"));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
