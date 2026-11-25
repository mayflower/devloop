import { test, expect } from "vitest";
import { parseNulPaths } from "../../src/core/diff-paths.js";

test("[REQ-UNSKIPDIFF-2] splits at NUL and drops empty entries", () => {
  expect(parseNulPaths("a.test.ts\0b.test.ts\0")).toEqual(["a.test.ts", "b.test.ts"]);
  expect(parseNulPaths("")).toEqual([]);
  expect(parseNulPaths("\0\0")).toEqual([]);
});

test("[REQ-UNSKIPDIFF-2] a newline or quote inside a path stays part of the path", () => {
  expect(parseNulPaths('größe "x" y.test.ts\0a\nb.test.ts\0')).toEqual(['größe "x" y.test.ts', "a\nb.test.ts"]);
});
