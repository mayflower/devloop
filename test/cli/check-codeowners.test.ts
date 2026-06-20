import { test, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const cli = resolve(dirname(fileURLToPath(import.meta.url)), "../../dist/cli/check-codeowners.js");

let repo: string;
beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "devloop-co-"));
  // tier-map with T2/T3 paths (Obol-style record format)
  mkdirSync(join(repo, "tools"), { recursive: true });
  writeFileSync(
    join(repo, "tools/tier-map.json"),
    JSON.stringify({ T3: ["**/migrations/**", "**/auth/**"], T2: ["services/**"], T1: ["**"] }),
  );
  mkdirSync(join(repo, ".github"), { recursive: true });
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

const run = () => spawnSync("node", [cli, repo], { encoding: "utf8" });

test("exit 0 when CODEOWNERS covers all T2/T3 tier paths", () => {
  writeFileSync(join(repo, ".github/CODEOWNERS"), `**/migrations/ @db\n**/auth/ @sec\n/services/ @team\n`);
  const r = run();
  expect(r.status).toBe(0);
  expect(JSON.parse(r.stdout).ok).toBe(true);
});

test("exit 1 when a T2/T3 tier path is not covered by CODEOWNERS (drift)", () => {
  // services/** (T2) has no CODEOWNERS entry
  writeFileSync(join(repo, ".github/CODEOWNERS"), `**/migrations/ @db\n**/auth/ @sec\n`);
  const r = run();
  expect(r.status).toBe(1);
  expect(JSON.parse(r.stdout).uncovered).toContain("services/**");
});

test("exit 1 when there is no CODEOWNERS file at all", () => {
  const r = run();
  expect(r.status).toBe(1);
  expect(JSON.parse(r.stdout).reason).toMatch(/no CODEOWNERS/i);
});
