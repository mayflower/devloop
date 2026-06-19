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
