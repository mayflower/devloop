import { test, expect } from "vitest";
import { nextAction, type DriverState, type Action } from "../../src/core/driver.js";
import type { LoopState, LoopParams } from "../../src/core/loop.js";

const okGuards = { ok: true, missing: [] as string[] };
const loop: LoopState = {
  iteration: 1,
  errorCounts: [10, 7],
  gateChangedNotCode: false,
  freshContextUsed: false,
};
const loopParams: LoopParams = { maxIter: 5, requireStrictlyDecreasing: true };

const base = (over: Partial<DriverState> = {}): DriverState => ({
  tier: "T2",
  guardians: okGuards,
  phase: "init",
  humanApprovals: {},
  ...over,
});

// --- Invariant 1: guardian precondition ---------------------------------------
test("refuses the autonomous loop when guardians are missing (any phase)", () => {
  const s = base({
    tier: "T1",
    guardians: { ok: false, missing: ["mutation-ratchet"] },
    phase: "implemented",
  });
  expect(nextAction(s)).toEqual({ kind: "REFUSE_GUARDIANS", missing: ["mutation-ratchet"] });
});

test("guardian refusal has top priority even at init", () => {
  const s = base({ guardians: { ok: false, missing: ["precondition-check"] }, phase: "init" });
  expect(nextAction(s).kind).toBe("REFUSE_GUARDIANS");
});

// --- Forward chain: spec-PR-first (spec+tests reviewed before code) ------------
test("init spawns specify", () => {
  expect(nextAction(base({ phase: "init" }))).toEqual({ kind: "SPAWN_STATION", station: "specify" });
});

test("specified spawns spec-to-tests (tests are authored before the spec-review stop)", () => {
  expect(nextAction(base({ phase: "specified" }))).toEqual({
    kind: "SPAWN_STATION",
    station: "spec-to-tests",
  });
});

test("tests-written opens the spec PR (spec + skipped tests) for review", () => {
  expect(nextAction(base({ phase: "tests-written" }))).toEqual({ kind: "OPEN_SPEC_PR" });
});

// --- Invariant 2: spec-review stop is not skippable (now on the spec PR) -------
test("spec-review stop is not skippable: spec-pr-open without approval stops for the human", () => {
  const s = base({ phase: "spec-pr-open", humanApprovals: {} });
  expect(nextAction(s)).toEqual({ kind: "STOP_FOR_HUMAN", stop: "spec-review" });
});

test("after spec-review approval, the spec PR is merged (not code yet)", () => {
  const s = base({ phase: "spec-pr-open", humanApprovals: { "spec-review": true } });
  expect(nextAction(s)).toEqual({ kind: "MERGE_SPEC_PR" });
});

test("spec-review is required for EVERY tier", () => {
  for (const tier of ["T0", "T1", "T2", "T3"] as const) {
    expect(nextAction(base({ tier, phase: "spec-pr-open", humanApprovals: {} }))).toEqual({
      kind: "STOP_FOR_HUMAN",
      stop: "spec-review",
    });
  }
});

test("only after the spec is merged to main does implement run (artifact handoff via main)", () => {
  expect(nextAction(base({ phase: "spec-merged" }))).toEqual({
    kind: "SPAWN_STATION",
    station: "implement",
  });
});

test("implemented runs the gates", () => {
  expect(nextAction(base({ phase: "implemented" }))).toEqual({ kind: "RUN_GATES" });
});

// --- Back-edge ----------------------------------------------------------------
test("green gate proceeds to the critic", () => {
  const s = base({ phase: "gated", gateVerdict: "green" });
  expect(nextAction(s)).toEqual({ kind: "SPAWN_STATION", station: "critic" });
});

test("red gate re-generates with a defect signal", () => {
  const s = base({ phase: "gated", gateVerdict: "red", loop, loopParams });
  const a = nextAction(s);
  expect(a.kind).toBe("RE_GEN");
  if (a.kind === "RE_GEN") expect(a.feedback).toBe("defect-signal");
});

test("gate tampering escalates (reward-hacking alarm)", () => {
  const s = base({
    phase: "gated",
    gateVerdict: "red",
    loop: { ...loop, gateChangedNotCode: true },
    loopParams,
  });
  expect(nextAction(s).kind).toBe("ESCALATE");
});

// --- Invariant 3: T3-merge stop not skippable; T0/T1 auto-merge ----------------
test("T3 merge stop is not skippable", () => {
  const s = base({ tier: "T3", phase: "merge-pending", gateVerdict: "green" });
  expect(nextAction(s)).toEqual({ kind: "STOP_FOR_HUMAN", stop: "t3-merge" });
});

test("T3 proceeds to DONE only with the t3-merge token", () => {
  const s = base({ tier: "T3", phase: "merge-pending", gateVerdict: "green", humanApprovals: { "t3-merge": true } });
  expect(nextAction(s)).toEqual({ kind: "DONE" });
});

test("T0/T1 auto-merge at green", () => {
  for (const tier of ["T0", "T1"] as const) {
    const s = base({ tier, phase: "merge-pending", gateVerdict: "green" });
    expect(nextAction(s)).toEqual({ kind: "DONE" });
  }
});

test("T2 stops for the required reviewer before merge", () => {
  const s = base({ tier: "T2", phase: "merge-pending", gateVerdict: "green" });
  expect(nextAction(s)).toEqual({ kind: "STOP_FOR_HUMAN", stop: "merge-review" });
});

// --- Invariant 4: the driver never produces artifacts inline ------------------
test("nextAction never produces artifacts inline (SPAWN_STATION is the only producer)", () => {
  const ALLOWED: Action["kind"][] = [
    "REFUSE_GUARDIANS",
    "SPAWN_STATION",
    "OPEN_SPEC_PR",
    "MERGE_SPEC_PR",
    "RUN_GATES",
    "STOP_FOR_HUMAN",
    "RE_GEN",
    "ESCALATE",
    "DONE",
  ];
  const phases: DriverState["phase"][] = [
    "init",
    "specified",
    "tests-written",
    "spec-pr-open",
    "spec-merged",
    "implemented",
    "gated",
    "merge-pending",
  ];
  const tiers = ["T0", "T1", "T2", "T3"] as const;
  const verdicts = [undefined, "green", "red"] as const;
  const approvalSets = [
    {},
    { "spec-review": true },
    { "spec-review": true, "merge-review": true, "t3-merge": true },
  ] as const;

  for (const phase of phases)
    for (const tier of tiers)
      for (const gateVerdict of verdicts)
        for (const humanApprovals of approvalSets) {
          const a = nextAction(base({ phase, tier, gateVerdict, humanApprovals, loop, loopParams }));
          expect(ALLOWED).toContain(a.kind);
          if (a.kind !== "SPAWN_STATION") expect("station" in a).toBe(false);
        }
});
