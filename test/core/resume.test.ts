import { test, expect } from "vitest";
import { reconstructState, rollupStatus, type PrFacts } from "../../src/core/resume.js";

const facts = (over: Partial<PrFacts>): PrFacts => ({
  headBranch: "devloop/account-detail",
  merged: false,
  reviewDecision: "none",
  checks: "green",
  ...over,
});

test("impl PR, green, changes requested -> merge-pending with a rework signal", () => {
  const r = reconstructState(facts({ checks: "green", reviewDecision: "changes-requested" }));
  expect(r.phase).toBe("merge-pending");
  expect(r.reviewDecision).toBe("changes-requested");
  expect(r.gateVerdict).toBe("green");
  expect(r.done).toBe(false);
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
