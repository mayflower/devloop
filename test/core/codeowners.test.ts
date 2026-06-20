import { test, expect } from "vitest";
import {
  parseCodeowners,
  codeownersCovers,
  findUncoveredTierGlobs,
} from "../../src/core/codeowners.js";

test("parseCodeowners keeps only lines that assign an owner; skips comments/blanks", () => {
  const content = `# comment\n\n/services/ @team\ndocs/ \n* @org/reviewers\n/auth/ @alice @bob`;
  expect(parseCodeowners(content)).toEqual(["/services/", "*", "/auth/"]);
});

test("codeownersCovers: directory prefixes, anchored vs anywhere, and the global catch-all", () => {
  expect(codeownersCovers("services/x/y.ts", "/services/")).toBe(true);
  expect(codeownersCovers("lib/auth/login.ts", "auth/")).toBe(true); // unanchored -> anywhere
  expect(codeownersCovers("anything/at/all.ts", "*")).toBe(true); // global owner
  expect(codeownersCovers("payments/charge.ts", "/services/")).toBe(false);
});

test("all T2/T3 tier paths covered -> no drift", () => {
  const globs = ["services/**", "**/auth/**", "packages/contracts/**"];
  const owned = ["/services/", "**/auth/", "/packages/contracts/"];
  expect(findUncoveredTierGlobs(globs, owned)).toEqual([]);
});

test("a T2/T3 path with NO covering CODEOWNERS entry is flagged (the drift)", () => {
  const globs = ["services/**", "payments/**"]; // payments newly added to tier-map, forgotten in CODEOWNERS
  const owned = ["/services/"];
  expect(findUncoveredTierGlobs(globs, owned)).toEqual(["payments/**"]);
});

test("a global catch-all owner covers everything (no drift)", () => {
  expect(findUncoveredTierGlobs(["services/**", "**/migrations/**"], ["*"])).toEqual([]);
});
