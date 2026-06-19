import { test, expect } from "vitest";
import { deriveTier, type TierMap } from "../../src/core/tier.js";

const tierMap: TierMap = {
  rules: [
    { tier: "T3", anyOf: ["**/migrations/**", "**/auth/**"] },
    { tier: "T2", anyOf: ["src/**"] },
    { tier: "T1", anyOf: ["**/*.md", "docs/**"] },
  ],
  default: "T3",
};

test("highest touched tier wins", () => {
  expect(deriveTier(["src/x.ts", "db/migrations/001.sql"], tierMap)).toBe("T3");
  expect(deriveTier(["src/x.ts"], tierMap)).toBe("T2");
  expect(deriveTier(["docs/readme.md"], tierMap)).toBe("T1");
});

test("unknown touched path falls back to conservative default", () => {
  expect(deriveTier(["weird/unmapped.bin"], tierMap)).toBe("T3");
});

test("empty touch set falls back to default (no caller-chosen tier)", () => {
  expect(deriveTier([], tierMap)).toBe("T3");
});

test("a lower-tier match does not override a higher-tier match regardless of order", () => {
  // docs/*.md (T1) plus auth (T3) -> T3
  expect(deriveTier(["docs/a.md", "service/auth/login.ts"], tierMap)).toBe("T3");
});

// --- Obol-style record format {tier:[globs]} (calibration) ------------------
const recordMap = {
  T3: ["**/migrations/**", "**/auth/**", "packages/contracts/**"],
  T2: ["services/**"],
  T1: ["**"], // catch-all floor (Obol's convention instead of a `default` field)
} as const;

test("accepts the {tier:[globs]} record format with upgrade-wins", () => {
  expect(deriveTier(["services/x.ts"], recordMap)).toBe("T2");
  expect(deriveTier(["services/db/migrations/1.sql", "services/x.ts"], recordMap)).toBe("T3");
  expect(deriveTier(["README"], recordMap)).toBe("T1"); // ** catch-all
});

test("record format without a catch-all: an unmatched path stays conservative (highest tier)", () => {
  const noFloor = { T3: ["**/auth/**"], T2: ["src/**"] };
  expect(deriveTier(["weird.bin"], noFloor)).toBe("T3");
  expect(deriveTier(["src/a.ts"], noFloor)).toBe("T2");
});

test("record format honours an explicit default key when present", () => {
  const withDefault = { T2: ["src/**"], default: "T1" as const };
  expect(deriveTier(["unmatched.bin"], withDefault)).toBe("T1");
});
