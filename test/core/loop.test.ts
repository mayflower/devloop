import { test, expect } from "vitest";
import {
  nextLoopDecision,
  type LoopState,
  type LoopParams,
} from "../../src/core/loop.js";

const params: LoopParams = { maxIter: 5, requireStrictlyDecreasing: true };

const state = (over: Partial<LoopState> = {}): LoopState => ({
  iteration: 1,
  errorCounts: [10, 7],
  gateChangedNotCode: false,
  freshContextUsed: false,
  ...over,
});

test("gate tampering escalates immediately, with top priority", () => {
  // even when also at max iter and stagnating, tamper wins
  expect(
    nextLoopDecision(
      state({ gateChangedNotCode: true, iteration: 99, errorCounts: [5, 5] }),
      params,
    ),
  ).toBe("ESCALATE_GATE_TAMPER");
});

test("reaching max iterations escalates", () => {
  expect(nextLoopDecision(state({ iteration: 5 }), params)).toBe("ESCALATE_MAX_ITER");
});

test("strictly decreasing errors under max iter -> RE_GEN", () => {
  expect(nextLoopDecision(state({ errorCounts: [10, 7, 4] }), params)).toBe("RE_GEN");
});

test("stagnation breaks in-session lock-in with one fresh-context retry first", () => {
  expect(
    nextLoopDecision(state({ errorCounts: [7, 7], freshContextUsed: false }), params),
  ).toBe("FRESH_CONTEXT_RETRY");
});

test("stagnation after the fresh-context retry escalates", () => {
  expect(
    nextLoopDecision(state({ errorCounts: [7, 7], freshContextUsed: true }), params),
  ).toBe("ESCALATE_STAGNATION");
});

test("first iteration without history keeps going (RE_GEN)", () => {
  expect(nextLoopDecision(state({ iteration: 0, errorCounts: [10] }), params)).toBe("RE_GEN");
});
