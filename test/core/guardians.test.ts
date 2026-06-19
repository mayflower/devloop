import { test, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { checkGuardians } from "../../src/core/guardians.js";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (n: string) => resolve(here, "../fixtures", n);

test("full guardians -> ok, nothing missing", () => {
  expect(checkGuardians(fx("repo-full-guardians"))).toEqual({ ok: true, missing: [] });
});

test("missing stryker -> not ok, reports mutation-ratchet", () => {
  const r = checkGuardians(fx("repo-missing-stryker"));
  expect(r.ok).toBe(false);
  expect(r.missing).toContain("mutation-ratchet");
});

test("missing semgrep -> reports semgrep-escape-hatch", () => {
  const r = checkGuardians(fx("repo-missing-semgrep"));
  expect(r.ok).toBe(false);
  expect(r.missing).toContain("semgrep-escape-hatch");
});

test("missing protected set -> reports protected-set", () => {
  const r = checkGuardians(fx("repo-missing-protected"));
  expect(r.ok).toBe(false);
  expect(r.missing).toContain("protected-set");
});

test("missing precondition-check binding anchor -> reports precondition-check", () => {
  const r = checkGuardians(fx("repo-missing-precondition-check"));
  expect(r.ok).toBe(false);
  expect(r.missing).toContain("precondition-check");
});

test("semgrep wired via CI (Obol-style tools/semgrep-*.yml, no .semgrep dir) is detected", () => {
  // Calibration against real Obol: the escape-hatch guard runs in CI from tools/, not .semgrep/.
  const r = checkGuardians(fx("repo-semgrep-in-ci"));
  expect(r.missing).not.toContain("semgrep-escape-hatch");
  expect(r).toEqual({ ok: true, missing: [] });
});

test("each missing-fixture reports exactly its one missing guardian", () => {
  expect(checkGuardians(fx("repo-missing-stryker")).missing).toEqual(["mutation-ratchet"]);
  expect(checkGuardians(fx("repo-missing-semgrep")).missing).toEqual(["semgrep-escape-hatch"]);
  expect(checkGuardians(fx("repo-missing-protected")).missing).toEqual(["protected-set"]);
  expect(checkGuardians(fx("repo-missing-precondition-check")).missing).toEqual(["precondition-check"]);
});
