import { test, expect } from "vitest";
import { reqDelta } from "../../src/core/req-delta.js";

const OLD = `# Spec: account

- REQ-ACC-1: When the user submits valid data, the system shall create the account.
- REQ-ACC-2: If the email is taken, the system shall reject with 409.
- REQ-ACC-3: While locked, the system shall deny login.
`;

test("detects added / changed / removed REQs by id + criterion text", () => {
  const next = `# Spec: account

- REQ-ACC-1: When the user submits valid data, the system shall create the account.
- REQ-ACC-2: If the email is taken, the system shall reject with 422.
- REQ-ACC-4: Where 2FA is enabled, the system shall require a code.
`;
  expect(reqDelta(OLD, next)).toEqual({
    added: ["REQ-ACC-4"],
    changed: ["REQ-ACC-2"], // 409 -> 422
    removed: ["REQ-ACC-3"],
  });
});

test("no change -> all empty", () => {
  expect(reqDelta(OLD, OLD)).toEqual({ added: [], changed: [], removed: [] });
});

test("extracts REQ ids regardless of surrounding markdown / separators", () => {
  const a = `## REQ-X-1 — does a thing\nREQ-X-2: another`;
  const b = `## REQ-X-1 — does a thing\nREQ-X-2: another, changed`;
  expect(reqDelta(a, b)).toEqual({ added: [], changed: ["REQ-X-2"], removed: [] });
});

test("ignores whitespace-only differences in the criterion", () => {
  const a = `REQ-X-1:   the system shall do x`;
  const b = `REQ-X-1: the system shall do x`;
  expect(reqDelta(a, b)).toEqual({ added: [], changed: [], removed: [] });
});
