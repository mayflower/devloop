import { test, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readSmokeTiers } from "../../src/core/smoke.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("[REQ-SMOKE-6] fehlende Config/Sektion -> [] (aus)", () => {
  expect(readSmokeTiers(undefined)).toEqual([]);
  expect(readSmokeTiers({ anchor: "b" })).toEqual([]);
  expect(readSmokeTiers({ smoke: { setup: "x" } })).toEqual([]);
  expect(readSmokeTiers({ smoke: { tiers: ["T3", "T2", "T3"] } })).toEqual(["T3", "T2"]);
});

test("[REQ-SMOKE-6] kaputte Werte -> undefined (fail-closed), nie still aus", () => {
  for (const c of [{ smoke: { tiers: ["t1"] } }, { smoke: { tiers: "T2" } }, { smoke: true }, [], "x"])
    expect(readSmokeTiers(c)).toBeUndefined();
});

function cli(config: string | null) {
  const dir = mkdtempSync(join(tmpdir(), "smoke-tiers-"));
  if (config !== null) {
    mkdirSync(join(dir, ".devloop"));
    writeFileSync(join(dir, ".devloop", "config.json"), config);
  }
  const r = spawnSync("node", [resolve(root, "dist/cli/smoke-tiers.js"), dir], { encoding: "utf8" });
  return { status: r.status, out: r.stdout.trim() };
}

test("[REQ-SMOKE-6] CLI: Tiers aus der Config, [] ohne Config, Exit 1 bei kaputter Config", () => {
  expect(cli('{"smoke":{"tiers":["T2","T3"]}}')).toEqual({ status: 0, out: '["T2","T3"]' });
  expect(cli(null)).toEqual({ status: 0, out: "[]" });
  expect(cli('{"smoke":{"tiers":["T9"]}}').status).toBe(1);
  expect(cli("{kaputt").status).toBe(1);
});
