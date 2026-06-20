import { test, expect } from "vitest";
import { isUnskipOnly } from "../../src/core/unskip.js";

// The seam where the test<->code separation stands or falls (§11 #3): the independent
// spec-to-tests station writes the COMPLETE test (skipped); implement may ONLY remove `.skip`.
// isUnskipOnly(old, new) is true iff the change is allowed: identical modulo removed `.skip`.

const OLD = `import { test, expect } from "vitest";
test.skip("REQ-A-1 does the thing", () => {
  expect(thing()).toBe(42);
});`;

test("removing .skip (and nothing else) is allowed", () => {
  const next = OLD.replace("test.skip(", "test(");
  expect(isUnskipOnly(OLD, next)).toBe(true);
});

test("no change at all is allowed (no violation)", () => {
  expect(isUnskipOnly(OLD, OLD)).toBe(true);
});

test("changing an assertion is FORBIDDEN (implement must not rewrite tests)", () => {
  const next = OLD.replace("test.skip(", "test(").replace("toBe(42)", "toBe(0)");
  expect(isUnskipOnly(OLD, next)).toBe(false);
});

test("changing the test title is FORBIDDEN", () => {
  const next = OLD.replace("REQ-A-1 does the thing", "REQ-A-1 does something else").replace("test.skip(", "test(");
  expect(isUnskipOnly(OLD, next)).toBe(false);
});

test("deleting a test is FORBIDDEN", () => {
  const next = `import { test, expect } from "vitest";\n`;
  expect(isUnskipOnly(OLD, next)).toBe(false);
});

test("ADDING a .skip (sneaking a test off) is FORBIDDEN", () => {
  const twoTests = `${OLD}\ntest("REQ-A-2 second", () => { expect(1).toBe(1); });`;
  const next = twoTests
    .replace("test.skip(", "test(") // unskip the first (allowed)
    .replace('test("REQ-A-2 second"', 'test.skip("REQ-A-2 second"'); // but skip the second (forbidden)
  expect(isUnskipOnly(twoTests, next)).toBe(false);
});
