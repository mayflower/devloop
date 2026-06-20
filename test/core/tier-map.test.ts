import { test, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveTierMapPath, TIER_MAP_CANDIDATES } from "../../src/core/tier-map.js";

let repo: string;
beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "devloop-tiermap-"));
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

const writeMap = (rel: string) => {
  const p = join(repo, rel);
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, "{}");
};

test("finds tools/tier-map.json (Obol's location)", () => {
  writeMap("tools/tier-map.json");
  expect(resolveTierMapPath(repo)).toBe(join(repo, "tools/tier-map.json"));
});

test(".devloop/tier-map.json takes priority over tools/", () => {
  writeMap("tools/tier-map.json");
  writeMap(".devloop/tier-map.json");
  expect(resolveTierMapPath(repo)).toBe(join(repo, ".devloop/tier-map.json"));
});

test("returns an absolute path (not module-relative — fixes the brittle resolution)", () => {
  writeMap("tier-map.json");
  const p = resolveTierMapPath(repo);
  expect(p).toBe(join(repo, "tier-map.json"));
  expect(p?.startsWith(repo)).toBe(true);
});

test("returns null when no tier-map exists", () => {
  expect(resolveTierMapPath(repo)).toBeNull();
});

test("candidate order is .devloop -> tools -> root", () => {
  expect(TIER_MAP_CANDIDATES).toEqual([
    ".devloop/tier-map.json",
    "tools/tier-map.json",
    "tier-map.json",
  ]);
});
