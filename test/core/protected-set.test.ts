import { test, expect } from "vitest";
import { touchesProtectedSet } from "../../src/core/protected-set.js";

const prot = ["**/stryker.conf.*", "**/.semgrep/**", "**/constitution.md", "**/*.eslintrc*"];

test("diff that edits a gate config is flagged (reward-hacking alarm)", () => {
  expect(touchesProtectedSet(["src/a.ts", "stryker.conf.mjs"], prot)).toBe(true);
});

test("diff editing a semgrep rule is flagged", () => {
  expect(touchesProtectedSet(["service/.semgrep/escape-hatch.yml"], prot)).toBe(true);
});

test("pure product diff is not flagged", () => {
  expect(touchesProtectedSet(["src/a.ts", "src/b.ts"], prot)).toBe(false);
});

test("empty diff is not flagged", () => {
  expect(touchesProtectedSet([], prot)).toBe(false);
});
