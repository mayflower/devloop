import { test, expect } from "vitest";
import { nextAction } from "../../src/core/driver.js";
import { reconstructState, rollupStatus, type PrFacts } from "../../src/core/resume.js";

const facts = (over: Partial<PrFacts>): PrFacts => ({
  headBranch: "devloop/account-detail",
  merged: false,
  reviewDecision: "none",
  checks: "green",
  draft: false,
  ...over,
});

test("impl PR, green, changes requested -> merge-pending with a rework signal", () => {
  const r = reconstructState(facts({ checks: "green", reviewDecision: "changes-requested" }));
  expect(r.phase).toBe("merge-pending");
  expect(r.reviewDecision).toBe("changes-requested");
  expect(r.gateVerdict).toBe("green");
  expect(r.done).toBe(false);
});

test("[REQ-BIND-4] impl PR, green, nicht draft -> merge-pending und ready", () => {
  const r = reconstructState(facts({ checks: "green", draft: false }));
  expect(r.phase).toBe("merge-pending");
  expect(r.gateVerdict).toBe("green");
  expect(r.ready).toBe(true);
});

// Probe (k): reconstructState ignoriert draft
test("[REQ-BIND-4] (Probe k) impl PR, green, DRAFT -> gated/green (Critic steht aus), nicht merge-pending", () => {
  const r = reconstructState(facts({ checks: "green", draft: true }));
  expect(r.phase).toBe("gated");
  expect(r.gateVerdict).toBe("green");
  expect(r.done).toBe(false);
  expect(r.ready).not.toBe(true);
});

test("[REQ-BIND-5] (Probe k) Draft + grün ist für KEINE Review-Entscheidung merge-pending und nie ready", () => {
  for (const reviewDecision of ["none", "approved", "changes-requested"] as const) {
    const r = reconstructState(facts({ checks: "green", draft: true, reviewDecision }));
    expect(r.phase).not.toBe("merge-pending");
    expect(r.ready).not.toBe(true);
    expect(r.phase).toBe("gated");
    expect(r.gateVerdict).toBe("green");
  }
});

test("[REQ-BIND-4] Draft ändert rote/ausstehende Checks nicht: red -> gated/red, pending -> implemented", () => {
  expect(reconstructState(facts({ checks: "red", draft: true })).gateVerdict).toBe("red");
  expect(reconstructState(facts({ checks: "red", draft: true })).phase).toBe("gated");
  expect(reconstructState(facts({ checks: "pending", draft: true })).phase).toBe("implemented");
});

test("[REQ-BIND-4] Draft-PR aus resume speist den Driver in den Critic (nicht in Merge/DONE)", () => {
  const r = reconstructState(facts({ checks: "green", draft: true }));
  const a = nextAction({ tier: "T1", guardians: { ok: true, missing: [] }, phase: r.phase, gateVerdict: r.gateVerdict, humanApprovals: r.humanApprovals, ready: r.ready });
  expect(a).toEqual({ kind: "SPAWN_STATION", station: "critic" });
});

test("impl PR, green, approved -> merge-pending with the merge approvals set", () => {
  const r = reconstructState(facts({ reviewDecision: "approved" }));
  expect(r.phase).toBe("merge-pending");
  expect(r.humanApprovals["merge-review"]).toBe(true);
  expect(r.humanApprovals["t3-merge"]).toBe(true);
});

test("impl PR, red checks -> back-edge (gated/red)", () => {
  const r = reconstructState(facts({ checks: "red" }));
  expect(r.phase).toBe("gated");
  expect(r.gateVerdict).toBe("red");
});

test("impl PR merged -> done", () => {
  expect(reconstructState(facts({ merged: true })).done).toBe(true);
});

test("spec PR open, awaiting review -> spec-pr-open", () => {
  const r = reconstructState(facts({ headBranch: "devloop/spec/account-detail", reviewDecision: "none" }));
  expect(r.phase).toBe("spec-pr-open");
  expect(r.humanApprovals["spec-review"]).toBeUndefined();
});

test("spec PR open, changes requested -> spec-pr-open + rework signal", () => {
  const r = reconstructState(facts({ headBranch: "devloop/spec/x", reviewDecision: "changes-requested" }));
  expect(r.phase).toBe("spec-pr-open");
  expect(r.reviewDecision).toBe("changes-requested");
});

test("spec PR merged -> spec-merged (implement is next)", () => {
  expect(reconstructState(facts({ headBranch: "devloop/spec/x", merged: true })).phase).toBe("spec-merged");
});

test("rollupStatus maps GitHub check rollups", () => {
  expect(rollupStatus([])).toBe("pending");
  expect(rollupStatus([{ status: "IN_PROGRESS" }])).toBe("pending");
  expect(rollupStatus([{ status: "COMPLETED", conclusion: "SUCCESS" }, { status: "COMPLETED", conclusion: "SKIPPED" }])).toBe("green");
  expect(rollupStatus([{ status: "COMPLETED", conclusion: "SUCCESS" }, { status: "COMPLETED", conclusion: "FAILURE" }])).toBe("red");
});

// Typ-Wächter (REQ-BIND-4): `draft` ist Pflichtfeld. Ist es optional, ist das Literal gültig, das
// @ts-expect-error unbenutzt und `npm run typecheck` wird rot (fehlendes draft wirkte sonst als "nicht Draft" = fail-open).
test("[REQ-BIND-4] PrFacts.draft ist Pflichtfeld (Typ-Wächter via npm run typecheck)", () => {
  // @ts-expect-error draft fehlt: muss ein Typfehler sein
  const missing: PrFacts = { headBranch: "devloop/x", merged: false, reviewDecision: "none", checks: "green" };
  expect(missing.headBranch).toBe("devloop/x");
});
