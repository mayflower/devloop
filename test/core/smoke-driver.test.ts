import { test, expect } from "vitest";
import { nextAction, type DriverState } from "../../src/core/driver.js";
import type { LoopState, LoopParams } from "../../src/core/loop.js";

// REQ-SMOKE-1/4: the optional smoke gate between an accepted critic round and MARK_READY.
const loop: LoopState = {
  iteration: 1,
  gateChangedNotCode: false,
  freshContextUsed: false,
  lastRound: { judged: true, progress: true, oscillation: false },
};
const loopParams: LoopParams = { maxIter: 5 };
const TIERS = ["T0", "T1", "T2", "T3"] as const;
type Smoke = NonNullable<DriverState["smoke"]>;
const accepted = { status: "completed", verdict: "accepted", retried: false } as const;
const st = (over: Partial<DriverState> = {}): DriverState => ({
  tier: "T3",
  guardians: { ok: true, missing: [] },
  phase: "critiqued",
  gateVerdict: "green",
  critic: accepted,
  humanApprovals: {},
  loop,
  loopParams,
  ...over,
});

test("[REQ-SMOKE-1] ohne smokeTiers bleibt die Kette unverändert: accepted -> MARK_READY (jedes Tier)", () => {
  for (const tier of TIERS) {
    expect(nextAction(st({ tier }))).toEqual({ kind: "MARK_READY" });
    expect(nextAction(st({ tier, smokeTiers: [] }))).toEqual({ kind: "MARK_READY" });
  }
});

test("[REQ-SMOKE-1] Tier nicht eingeschaltet -> kein Smoke, auch wenn andere Tiers es sind", () => {
  expect(nextAction(st({ tier: "T1", smokeTiers: ["T2", "T3"] }))).toEqual({ kind: "MARK_READY" });
});

test("[REQ-SMOKE-1] eingeschaltetes Tier, noch kein Smoke -> smoke-Station spawnen statt MARK_READY", () => {
  for (const tier of TIERS)
    expect(nextAction(st({ tier, smokeTiers: [tier] }))).toEqual({ kind: "SPAWN_STATION", station: "smoke" });
});

test("[REQ-SMOKE-1] passed oder not-applicable -> MARK_READY", () => {
  for (const status of ["passed", "not-applicable"] as const)
    expect(nextAction(st({ smokeTiers: ["T3"], smoke: { status } }))).toEqual({ kind: "MARK_READY" });
});

test("[REQ-SMOKE-4] failed ist ein Defektsignal -> Rückkante über nextLoopDecision (RE_GEN), nie MARK_READY", () => {
  expect(nextAction(st({ smokeTiers: ["T3"], smoke: { status: "failed" } }))).toEqual({
    kind: "RE_GEN",
    feedback: "defect-signal",
    freshContext: false,
  });
  expect(nextAction(st({ smokeTiers: ["T3"], smoke: { status: "failed" }, loop: { ...loop, iteration: 5 } }))).toEqual({
    kind: "ESCALATE",
    reason: "ESCALATE_MAX_ITER",
  });
});

test("[REQ-SMOKE-4] not-run: genau ein Neustart, dann ESCALATE smoke-not-run", () => {
  expect(nextAction(st({ smokeTiers: ["T3"], smoke: { status: "not-run", retried: false } }))).toEqual({
    kind: "SPAWN_STATION",
    station: "smoke",
  });
  expect(nextAction(st({ smokeTiers: ["T3"], smoke: { status: "not-run", retried: true } }))).toEqual({
    kind: "ESCALATE",
    reason: "smoke-not-run",
  });
});

test("[REQ-SMOKE-1] Invariante: MARK_READY bei eingeschaltetem Tier nur mit passed/not-applicable", () => {
  const smokes: (Smoke | undefined)[] = [
    undefined,
    { status: "passed" },
    { status: "not-applicable" },
    { status: "failed" },
    { status: "not-run", retried: false },
    { status: "not-run", retried: true },
  ];
  const critics: DriverState["critic"][] = [
    undefined,
    accepted,
    { status: "completed", verdict: "rejected", retried: false },
    { status: "not-run", retried: false },
  ];
  for (const tier of TIERS)
    for (const smoke of smokes)
      for (const critic of critics)
        for (const ready of [undefined, false])
          for (const phase of ["gated", "critiqued", "merge-pending"] as const) {
            const a = nextAction(st({ tier, smokeTiers: [tier], smoke, critic, ready, phase }));
            if (a.kind === "MARK_READY" || a.kind === "DONE") {
              expect(["passed", "not-applicable"]).toContain(smoke?.status);
            }
          }
});

test("[REQ-SMOKE-1] smoke spawnt nie vor einem akzeptierten Critic-Verdikt", () => {
  for (const critic of [undefined, { status: "not-run", retried: false } as const, { status: "completed", verdict: "rejected", retried: false } as const]) {
    const a = nextAction(st({ smokeTiers: ["T3"], critic }));
    expect(a).not.toEqual({ kind: "SPAWN_STATION", station: "smoke" });
  }
});

test("[REQ-SMOKE-1] ein bereits ready PR (z. B. aus resume) wird nicht erneut gesmoket", () => {
  expect(nextAction(st({ smokeTiers: ["T3"], ready: true }))).toEqual({ kind: "STOP_FOR_HUMAN", stop: "t3-merge" });
});
