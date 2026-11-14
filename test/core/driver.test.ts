import { test, expect } from "vitest";
import { nextAction, type DriverState, type Action } from "../../src/core/driver.js";
import type { LoopState, LoopParams } from "../../src/core/loop.js";

const okGuards = { ok: true, missing: [] as string[] };
const loop: LoopState = {
  iteration: 1,
  gateChangedNotCode: false,
  freshContextUsed: false,
  lastRound: { judged: true, progress: true, oscillation: false },
};
const loopParams: LoopParams = { maxIter: 5 };

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
  const s = base({ tier: "T3", phase: "merge-pending", gateVerdict: "green", ready: true });
  expect(nextAction(s)).toEqual({ kind: "STOP_FOR_HUMAN", stop: "t3-merge" });
});

test("T3 proceeds to DONE only with the t3-merge token", () => {
  const s = base({ tier: "T3", phase: "merge-pending", gateVerdict: "green", ready: true, humanApprovals: { "t3-merge": true } });
  expect(nextAction(s)).toEqual({ kind: "DONE" });
});

test("T0/T1 auto-merge at green", () => {
  for (const tier of ["T0", "T1"] as const) {
    const s = base({ tier, phase: "merge-pending", gateVerdict: "green", ready: true });
    expect(nextAction(s)).toEqual({ kind: "DONE" });
  }
});

test("T2 stops for the required reviewer before merge", () => {
  const s = base({ tier: "T2", phase: "merge-pending", gateVerdict: "green", ready: true });
  expect(nextAction(s)).toEqual({ kind: "STOP_FOR_HUMAN", stop: "merge-review" });
});

// --- Human rejection (changes requested) is a back-edge, not a dead end --------
test("merge-pending + changes-requested -> RE_GEN (re-implement with the review as defect signal)", () => {
  const s = base({ tier: "T2", phase: "merge-pending", gateVerdict: "green", ready: true, reviewDecision: "changes-requested" });
  const a = nextAction(s);
  expect(a.kind).toBe("RE_GEN");
  if (a.kind === "RE_GEN") expect(a.feedback).toBe("defect-signal");
});

test("spec-pr-open + changes-requested -> re-spec (SPAWN specify, amend per the review)", () => {
  const s = base({ phase: "spec-pr-open", reviewDecision: "changes-requested" });
  expect(nextAction(s)).toEqual({ kind: "SPAWN_STATION", station: "specify" });
});

test("changes-requested does not apply to T0/T1 auto-merge (no review there)", () => {
  // reviewDecision undefined for T0/T1 -> normal auto-merge
  expect(nextAction(base({ tier: "T1", phase: "merge-pending", gateVerdict: "green", ready: true }))).toEqual({ kind: "DONE" });
});

// --- Optional spec-to-twin station (twin as a pluggable capability) -----------
test("tests-written spawns spec-to-twin when the twin is enabled (before the spec PR)", () => {
  expect(nextAction(base({ phase: "tests-written", twinEnabled: true }))).toEqual({
    kind: "SPAWN_STATION",
    station: "spec-to-twin",
  });
});

test("twin-written opens the spec PR (twin artifacts join spec + tests on the spec PR)", () => {
  expect(nextAction(base({ phase: "twin-written", twinEnabled: true }))).toEqual({ kind: "OPEN_SPEC_PR" });
});

test("twin disabled (default) preserves the chain: tests-written goes straight to the spec PR", () => {
  expect(nextAction(base({ phase: "tests-written" }))).toEqual({ kind: "OPEN_SPEC_PR" });
  expect(nextAction(base({ phase: "tests-written", twinEnabled: false }))).toEqual({ kind: "OPEN_SPEC_PR" });
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
    "MARK_READY",
    "DONE",
  ];
  const phases: DriverState["phase"][] = [
    "init",
    "specified",
    "tests-written",
    "twin-written",
    "spec-pr-open",
    "spec-merged",
    "implemented",
    "gated",
    "critiqued",
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

// =====================================================================================
// Befund-Ledger + bindendes Critic-Verdikt (REQ-CRITIC-4/6/7, REQ-BIND-2/3/5)
// =====================================================================================
type Critic = NonNullable<DriverState["critic"]>;
const notRun = (retried: boolean): Critic => ({ status: "not-run", retried });
const rejected: Critic = { status: "completed", verdict: "rejected", retried: false };
const accepted: Critic = { status: "completed", verdict: "accepted", retried: false };
const critiqued = (critic: Critic | undefined, over: Partial<DriverState> = {}) =>
  base({ phase: "critiqued", gateVerdict: "green", critic, ...over });
const TIERS = ["T0", "T1", "T2", "T3"] as const;

// --- REQ-CRITIC-4 (Probe h): genau ein Neustart ------------------------------------------------
test("[REQ-CRITIC-4] critiqued + not-run, noch nicht neu gestartet -> critic erneut spawnen", () => {
  for (const tier of TIERS) {
    expect(nextAction(critiqued(notRun(false), { tier }))).toEqual({
      kind: "SPAWN_STATION",
      station: "critic",
    });
  }
});

test("[REQ-CRITIC-4] (Probe h) critiqued + not-run NACH dem Neustart -> ESCALATE critic-not-run (nicht ein zweiter Neustart)", () => {
  for (const tier of TIERS) {
    expect(nextAction(critiqued(notRun(true), { tier }))).toEqual({
      kind: "ESCALATE",
      reason: "critic-not-run",
    });
  }
});

test("[REQ-CRITIC-4] (Probe b) not-run führt nie zu MARK_READY oder DONE, in keinem Tier", () => {
  for (const tier of TIERS)
    for (const retried of [false, true])
      for (const ready of [undefined, false, true]) {
        const a = nextAction(critiqued(notRun(retried), { tier, ready, humanApprovals: { "merge-review": true, "t3-merge": true } }));
        expect(["MARK_READY", "DONE"]).not.toContain(a.kind);
      }
});

// --- REQ-CRITIC-6: rejected -> Rückkante über nextLoopDecision ---------------------------------------
test("[REQ-CRITIC-6] rejected -> RE_GEN wie beim roten Gate (gleiche Action)", () => {
  for (const tier of TIERS) {
    const viaCritic = nextAction(critiqued(rejected, { tier, loop, loopParams }));
    const viaRedGate = nextAction(base({ tier, phase: "gated", gateVerdict: "red", loop, loopParams }));
    expect(viaCritic).toEqual(viaRedGate);
    expect(viaCritic).toEqual({ kind: "RE_GEN", feedback: "defect-signal", freshContext: false });
  }
});

test("[REQ-CRITIC-6] rejected + Stagnation -> RE_GEN mit frischem Kontext; danach ESCALATE_STAGNATION", () => {
  const stag = { ...loop, lastRound: { judged: true, progress: false, oscillation: false } };
  expect(nextAction(critiqued(rejected, { loop: stag, loopParams }))).toEqual({
    kind: "RE_GEN",
    feedback: "defect-signal",
    freshContext: true,
  });
  expect(nextAction(critiqued(rejected, { loop: { ...stag, freshContextUsed: true }, loopParams }))).toEqual({
    kind: "ESCALATE",
    reason: "ESCALATE_STAGNATION",
  });
});

test("[REQ-CRITIC-6] rejected + Oszillation / MaxIter / Tamper eskalieren mit dem Entscheidungsnamen", () => {
  const osc = { ...loop, lastRound: { judged: true, progress: true, oscillation: true } };
  expect(nextAction(critiqued(rejected, { loop: osc, loopParams }))).toEqual({ kind: "ESCALATE", reason: "ESCALATE_OSCILLATION" });
  expect(nextAction(critiqued(rejected, { loop: { ...loop, iteration: 5 }, loopParams }))).toEqual({ kind: "ESCALATE", reason: "ESCALATE_MAX_ITER" });
  expect(nextAction(critiqued(rejected, { loop: { ...loop, gateChangedNotCode: true }, loopParams }))).toEqual({ kind: "ESCALATE", reason: "ESCALATE_GATE_TAMPER" });
});

test("[REQ-CRITIC-6] rejected ohne loop/loopParams -> ESCALATE loop-params-required (wie beim roten Gate)", () => {
  expect(nextAction(critiqued(rejected))).toEqual({ kind: "ESCALATE", reason: "loop-params-required" });
});

test("[REQ-CRITIC-6] rejected führt nie zu MARK_READY oder DONE, auch nicht bei T0/T1 oder mit ready/Approvals", () => {
  for (const tier of TIERS)
    for (const ready of [undefined, false, true]) {
      const a = nextAction(critiqued(rejected, { tier, ready, loop, loopParams, humanApprovals: { "merge-review": true, "t3-merge": true } }));
      expect(["MARK_READY", "DONE"]).not.toContain(a.kind);
    }
});

// --- REQ-CRITIC-7 / REQ-BIND-2: accepted -> MARK_READY, danach merge-pending-Verhalten --------------
test("[REQ-CRITIC-7] accepted und noch nicht ready -> MARK_READY (jedes Tier)", () => {
  for (const tier of TIERS) {
    expect(nextAction(critiqued(accepted, { tier }))).toEqual({ kind: "MARK_READY" });
    expect(nextAction(critiqued(accepted, { tier, ready: false }))).toEqual({ kind: "MARK_READY" });
  }
});

test("[REQ-BIND-2] MARK_READY kommt vor jedem Merge-Stop: auch bei T3 mit vorhandenem Token zuerst MARK_READY", () => {
  expect(nextAction(critiqued(accepted, { tier: "T3", humanApprovals: { "t3-merge": true } }))).toEqual({ kind: "MARK_READY" });
});

test("[REQ-CRITIC-7] accepted + ready verhält sich wie merge-pending (T0/T1 DONE, T2/T3 Stop)", () => {
  for (const tier of ["T0", "T1"] as const) {
    expect(nextAction(critiqued(accepted, { tier, ready: true }))).toEqual({ kind: "DONE" });
  }
  expect(nextAction(critiqued(accepted, { tier: "T2", ready: true }))).toEqual({ kind: "STOP_FOR_HUMAN", stop: "merge-review" });
  expect(nextAction(critiqued(accepted, { tier: "T3", ready: true }))).toEqual({ kind: "STOP_FOR_HUMAN", stop: "t3-merge" });
  expect(nextAction(critiqued(accepted, { tier: "T3", ready: true, humanApprovals: { "t3-merge": true } }))).toEqual({ kind: "DONE" });
});

// --- REQ-BIND-5: kein Pfad nach merge-pending/DONE ohne bewiesenes accepted ----------------------------
test("[REQ-BIND-5] merge-pending ohne ready === true liefert nie DONE/Merge-Stop, sondern critic (jedes Tier, mit allen Approvals)", () => {
  for (const tier of TIERS)
    for (const ready of [undefined, false])
      for (const humanApprovals of [{}, { "merge-review": true, "t3-merge": true }] as const) {
        expect(nextAction(base({ tier, phase: "merge-pending", gateVerdict: "green", ready, humanApprovals }))).toEqual({
          kind: "SPAWN_STATION",
          station: "critic",
        });
      }
});

test("[REQ-BIND-5] Invariante: DONE nur aus bewiesenem accepted (ready === true) in merge-pending bzw. critiqued+accepted", () => {
  const phases: DriverState["phase"][] = [
    "init", "specified", "tests-written", "twin-written", "spec-pr-open", "spec-merged",
    "implemented", "gated", "critiqued", "merge-pending",
  ];
  const critics: (Critic | undefined)[] = [undefined, notRun(false), notRun(true), rejected, accepted];
  const approvals = [{}, { "spec-review": true, "merge-review": true, "t3-merge": true }] as const;
  for (const phase of phases)
    for (const tier of TIERS)
      for (const gateVerdict of [undefined, "green", "red"] as const)
        for (const critic of critics)
          for (const ready of [undefined, false, true])
            for (const reviewDecision of [undefined, "changes-requested"] as const)
              for (const humanApprovals of approvals) {
                const a = nextAction(base({ phase, tier, gateVerdict, critic, ready, reviewDecision, humanApprovals, loop, loopParams }));
                if (a.kind === "DONE") {
                  expect(ready).toBe(true);
                  expect(["merge-pending", "critiqued"]).toContain(phase);
                  if (phase === "critiqued") expect(critic).toMatchObject({ status: "completed", verdict: "accepted" });
                }
                if (a.kind === "MARK_READY") {
                  expect(phase).toBe("critiqued");
                  expect(critic).toMatchObject({ status: "completed", verdict: "accepted" });
                  expect(ready).not.toBe(true);
                }
                if (a.kind === "STOP_FOR_HUMAN" && (a.stop === "merge-review" || a.stop === "t3-merge")) {
                  expect(ready).toBe(true);
                }
              }
});

test("[REQ-BIND-5] critiqued ohne critic-Ergebnis liefert nie MARK_READY/DONE", () => {
  for (const tier of TIERS)
    for (const ready of [undefined, false, true]) {
      const a = nextAction(critiqued(undefined, { tier, ready }));
      expect(["MARK_READY", "DONE"]).not.toContain(a.kind);
    }
});

// --- REQ-BIND-3: changes-requested auf ready-PR -> zurück auf Draft ----------------------------------------
test("[REQ-BIND-3] merge-pending + changes-requested -> RE_GEN mit markDraft: true (jedes Tier)", () => {
  for (const tier of TIERS) {
    const a = nextAction(base({ tier, phase: "merge-pending", gateVerdict: "green", ready: true, reviewDecision: "changes-requested" }));
    expect(a).toEqual({ kind: "RE_GEN", feedback: "defect-signal", freshContext: false, markDraft: true });
  }
});

test("[REQ-BIND-3] markDraft kommt nur bei der Human-Rückkante, nicht beim roten Gate und nicht bei Critic-rejected", () => {
  const red = nextAction(base({ phase: "gated", gateVerdict: "red", loop, loopParams }));
  const rej = nextAction(critiqued(rejected, { loop, loopParams }));
  for (const a of [red, rej]) {
    expect(a.kind).toBe("RE_GEN");
    expect((a as { markDraft?: boolean }).markDraft ?? false).toBe(false);
  }
});
