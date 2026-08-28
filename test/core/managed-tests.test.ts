import { test, expect } from "vitest";
import {
  MANAGED_TESTS_PATH,
  isManagedTestPath,
  parseManagedTestGlobs,
} from "../../src/core/managed-tests.js";

// The seam (§11 test<->code separation) must bind the tests devloop MANAGES — the ones
// spec-to-tests derived from a reviewed spec — and nothing else. The scope comes from a config
// file inside the target repo's PROTECTED set, never from the branch name (self-serve).

test("the config lives in the protected .devloop/ directory (an agent cannot widen it)", () => {
  expect(MANAGED_TESTS_PATH.startsWith(".devloop/")).toBe(true);
});

// --- fail-closed: no usable config => everything is managed (today's behaviour) -------------
test("absent config => every test file is managed (backwards compatible, fail-closed)", () => {
  for (const raw of [null, undefined, "", "   \n"]) {
    expect(parseManagedTestGlobs(raw)).toBe(null);
    expect(isManagedTestPath("tools/dead-members/x.test.ts", parseManagedTestGlobs(raw))).toBe(true);
  }
});

test("malformed / wrong-shaped config => fail closed to 'manage everything', never a partial list", () => {
  for (const raw of ['["services/**"', "not json", "42", '"a string"', "null", '{"other": ["x"]}', '["ok", 7]']) {
    expect(parseManagedTestGlobs(raw)).toBe(null);
    expect(isManagedTestPath("anything.test.ts", parseManagedTestGlobs(raw))).toBe(true);
  }
});

// --- the two accepted shapes ---------------------------------------------------------------
test("accepts a bare array (like protected-globs.json) and the {globs:[…]} object form", () => {
  expect(parseManagedTestGlobs('["services/**/*.test.ts"]')).toEqual(["services/**/*.test.ts"]);
  expect(parseManagedTestGlobs('{"globs": ["services/**/*.test.ts"]}')).toEqual([
    "services/**/*.test.ts",
  ]);
});

test("an EXPLICIT empty list is honoured (a deliberate statement in a protected file)", () => {
  expect(parseManagedTestGlobs("[]")).toEqual([]);
  expect(isManagedTestPath("a.test.ts", [])).toBe(false);
});

// --- scoping ------------------------------------------------------------------------------
test("only paths matching a configured glob are managed", () => {
  const globs = parseManagedTestGlobs('["services/*/src/**/*.test.ts", "services/*/twin/**"]');
  expect(isManagedTestPath("services/forum-service/src/a/b.test.ts", globs)).toBe(true);
  expect(isManagedTestPath("services/forum-service/twin/model.test.ts", globs)).toBe(true);
  // an ordinary dev tool's own tests are NOT devloop-managed -> the seam must not bind them
  expect(isManagedTestPath("tools/dead-members/scan.test.ts", globs)).toBe(false);
  expect(isManagedTestPath("scripts/x.spec.js", globs)).toBe(false);
});
