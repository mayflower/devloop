// The driver state machine (design §3/§8) — the heart of the orchestration.
// PURE function: given the current state, return the next action. The Slash-Command is
// merely its executor; the safety-relevant invariants live HERE and are unit-tested.
//
// Flow (spec-PR-first, surfaced by the Obol pilot): the spec + its (skipped) tests are
// reviewed as their own PR BEFORE any code, so the spec-review stop has a real reviewable
// HEAD (anchor b) and the artifact handoff runs via merge-to-main -> pull:
//   specify -> spec-to-tests(skipped) -> OPEN_SPEC_PR -> spec-review stop -> MERGE_SPEC_PR
//   -> implement (unskip + code) -> gates -> critic -> merge.
//
// Invariants proven by driver.test.ts (1:1 with the §8 Definition of Done):
//   1. Guardians missing  -> REFUSE_GUARDIANS (no path loops without the guardians).
//   2. Spec-review stop is not skippable (no branch leaves "spec-pr-open" without the token).
//   3. T3-merge stop is not skippable; T0/T1 auto-merge at green.
//   4. The driver NEVER produces an artifact inline — SPAWN_STATION is the only producer.
//   5. The back-edge feedback is a defect SIGNAL, never a solution (type-enforced).
//   6. T3's irreversible step stays human-gated (the auto-loop runs only on reversible
//      pre-stages; merge is the t3-merge stop).
import { nextLoopDecision } from "./loop.js";
function handleRedGate(state) {
    if (!state.loop || !state.loopParams) {
        return { kind: "ESCALATE", reason: "loop-params-required" };
    }
    const decision = nextLoopDecision(state.loop, state.loopParams);
    switch (decision) {
        case "RE_GEN":
            return { kind: "RE_GEN", feedback: "defect-signal", freshContext: false };
        case "FRESH_CONTEXT_RETRY":
            return { kind: "RE_GEN", feedback: "defect-signal", freshContext: true };
        default:
            return { kind: "ESCALATE", reason: decision };
    }
}
function handleMerge(state) {
    switch (state.tier) {
        case "T0":
        case "T1":
            return { kind: "DONE" }; // auto-merge at green
        case "T2":
            return state.humanApprovals["merge-review"]
                ? { kind: "DONE" }
                : { kind: "STOP_FOR_HUMAN", stop: "merge-review" };
        case "T3":
            return state.humanApprovals["t3-merge"]
                ? { kind: "DONE" }
                : { kind: "STOP_FOR_HUMAN", stop: "t3-merge" };
    }
}
export function nextAction(state) {
    // Invariant 1: without the guardians, the autonomous loop is refused outright.
    if (!state.guardians.ok) {
        return { kind: "REFUSE_GUARDIANS", missing: state.guardians.missing };
    }
    switch (state.phase) {
        case "init":
            return { kind: "SPAWN_STATION", station: "specify" };
        case "specified":
            // Tests are authored by the independent station BEFORE the spec-review stop, so the
            // reviewer sees spec + its (skipped) tests together. No code yet -> §5.1 preserved.
            return { kind: "SPAWN_STATION", station: "spec-to-tests" };
        case "tests-written":
            // When the twin is enabled, the independent oracle (reference model + invariants) is
            // authored by its OWN isolated station BEFORE the spec PR, so it is reviewed together with
            // the spec + tests. Default off -> straight to the spec PR (chain unchanged).
            return state.twinEnabled
                ? { kind: "SPAWN_STATION", station: "spec-to-twin" }
                : { kind: "OPEN_SPEC_PR" };
        case "twin-written":
            return { kind: "OPEN_SPEC_PR" };
        case "spec-pr-open":
            // Invariant 2: the spec-review stop is hard for every tier (§5.1 root of trust). It is
            // now a real CODEOWNER review on the spec PR (anchor b). Approved -> merge the spec.
            // Changes requested -> re-spec (specify amends per the review), then re-review.
            if (state.reviewDecision === "changes-requested") {
                return { kind: "SPAWN_STATION", station: "specify" };
            }
            return state.humanApprovals["spec-review"]
                ? { kind: "MERGE_SPEC_PR" }
                : { kind: "STOP_FOR_HUMAN", stop: "spec-review" };
        case "spec-merged":
            // Spec is on main; implement (separate, isolated) builds on it: unskip + code.
            return { kind: "SPAWN_STATION", station: "implement" };
        case "implemented":
            return { kind: "RUN_GATES" };
        case "gated":
            // Green -> adversarial critic; red -> back-edge (loop on the reversible pre-stage).
            return state.gateVerdict === "green"
                ? { kind: "SPAWN_STATION", station: "critic" }
                : handleRedGate(state);
        case "merge-pending":
            // A human "changes requested" on the impl PR is a defect signal -> re-implement (the loop
            // feeds the review comments back). Resumable across sessions: the decision lives on GitHub.
            if (state.reviewDecision === "changes-requested") {
                return { kind: "RE_GEN", feedback: "defect-signal", freshContext: false };
            }
            // Invariant 3 & 6: T3 merge is human-gated; T0/T1 auto-merge.
            return handleMerge(state);
    }
}
