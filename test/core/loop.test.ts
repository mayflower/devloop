import { test, expect } from "vitest";
import { nextLoopDecision, type LoopState, type LoopParams } from "../../src/core/loop.js";

const params: LoopParams = { maxIter: 5 };

type Last = NonNullable<LoopState["lastRound"]>;
const PROGRESS: Last = { judged: true, progress: true, oscillation: false };
const STAGNATION: Last = { judged: true, progress: false, oscillation: false };

const state = (over: Partial<LoopState> = {}): LoopState => ({
  iteration: 1,
  gateChangedNotCode: false,
  freshContextUsed: false,
  lastRound: PROGRESS,
  ...over,
});

test("gate tampering escalates immediately, with top priority", () => {
  // even when also at max iter, oscillating and stagnating, tamper wins
  expect(
    nextLoopDecision(
      state({
        gateChangedNotCode: true,
        iteration: 99,
        lastRound: { judged: true, progress: false, oscillation: true },
      }),
      params,
    ),
  ).toBe("ESCALATE_GATE_TAMPER");
});

test("reaching max iterations escalates", () => {
  expect(nextLoopDecision(state({ iteration: 5 }), params)).toBe("ESCALATE_MAX_ITER");
});

test("below max iterations does not escalate for max-iter", () => {
  expect(nextLoopDecision(state({ iteration: 4 }), params)).toBe("RE_GEN");
});

test("[REQ-LEDGER-7] max-iter has priority over oscillation", () => {
  expect(
    nextLoopDecision(
      state({ iteration: 5, lastRound: { judged: true, progress: false, oscillation: true } }),
      params,
    ),
  ).toBe("ESCALATE_MAX_ITER");
});

test("[REQ-LEDGER-6] Fortschritt der letzten Runde -> RE_GEN", () => {
  expect(nextLoopDecision(state({ lastRound: PROGRESS }), params)).toBe("RE_GEN");
});

test("stagnation (bewertete Runde ohne Fortschritt) bricht den Kontext-Lock-in mit einem Fresh-Context-Retry", () => {
  expect(nextLoopDecision(state({ lastRound: STAGNATION, freshContextUsed: false }), params)).toBe(
    "FRESH_CONTEXT_RETRY",
  );
});

test("stagnation nach dem Fresh-Context-Retry eskaliert", () => {
  expect(nextLoopDecision(state({ lastRound: STAGNATION, freshContextUsed: true }), params)).toBe(
    "ESCALATE_STAGNATION",
  );
});

test("first iteration without any round (lastRound null) keeps going (RE_GEN)", () => {
  expect(nextLoopDecision(state({ iteration: 0, lastRound: null }), params)).toBe("RE_GEN");
  expect(nextLoopDecision(state({ iteration: 0, lastRound: null, freshContextUsed: true }), params)).toBe(
    "RE_GEN",
  );
});

// REQ-LEDGER-7 / Probe (g)
test("[REQ-LEDGER-7] (Probe g) Oszillation eskaliert VOR der Stagnationsprüfung (kein Fresh-Retry)", () => {
  const osc: Last = { judged: true, progress: false, oscillation: true };
  expect(nextLoopDecision(state({ lastRound: osc, freshContextUsed: false }), params)).toBe(
    "ESCALATE_OSCILLATION",
  );
  expect(nextLoopDecision(state({ lastRound: osc, freshContextUsed: true }), params)).toBe(
    "ESCALATE_OSCILLATION",
  );
});

test("[REQ-LEDGER-7] Oszillation eskaliert auch bei gleichzeitigem Fortschritt", () => {
  expect(
    nextLoopDecision(state({ lastRound: { judged: true, progress: true, oscillation: true } }), params),
  ).toBe("ESCALATE_OSCILLATION");
});

test("[REQ-LEDGER-7] Oszillation eskaliert auch in einer nicht bewerteten Runde (unabhängig von REQ-LEDGER-11)", () => {
  expect(
    nextLoopDecision(state({ lastRound: { judged: false, progress: false, oscillation: true } }), params),
  ).toBe("ESCALATE_OSCILLATION");
});

test("[REQ-LEDGER-7] Gate-Tamper hat Vorrang vor Oszillation", () => {
  expect(
    nextLoopDecision(
      state({ gateChangedNotCode: true, lastRound: { judged: true, progress: false, oscillation: true } }),
      params,
    ),
  ).toBe("ESCALATE_GATE_TAMPER");
});

// REQ-LEDGER-11 / Probe (l)
test("[REQ-LEDGER-11] (Probe l) nicht bewertete Runde (judged=false) ist keine Stagnation -> RE_GEN", () => {
  const unjudged: Last = { judged: false, progress: false, oscillation: false };
  expect(nextLoopDecision(state({ lastRound: unjudged, freshContextUsed: false }), params)).toBe("RE_GEN");
});

test("[REQ-LEDGER-11] (Probe l) nicht bewertete Runde verbrennt den Fresh-Retry nicht, auch wenn er schon verbraucht ist -> RE_GEN", () => {
  const unjudged: Last = { judged: false, progress: false, oscillation: false };
  expect(nextLoopDecision(state({ lastRound: unjudged, freshContextUsed: true }), params)).toBe("RE_GEN");
});

// REQ-LEDGER-8 / Probe (a): errorCounts entfällt, Entscheidung nur aus lastRound
test("[REQ-LEDGER-8] (Probe a) ein veraltetes errorCounts-Feld beeinflusst die Entscheidung nicht (fallend, aber Stagnation)", () => {
  const s = { ...state({ lastRound: STAGNATION }), errorCounts: [10, 7, 4] } as unknown as LoopState;
  expect(nextLoopDecision(s, params)).toBe("FRESH_CONTEXT_RETRY");
});

test("[REQ-LEDGER-8] (Probe a) ein veraltetes errorCounts-Feld beeinflusst die Entscheidung nicht (steigend, aber Fortschritt)", () => {
  const s = { ...state({ lastRound: PROGRESS }), errorCounts: [1, 2] } as unknown as LoopState;
  expect(nextLoopDecision(s, params)).toBe("RE_GEN");
});

test("[REQ-LEDGER-8] LoopParams kennt requireStrictlyDecreasing nicht mehr: ein übergebener Wert ändert nichts", () => {
  const p = { maxIter: 5, requireStrictlyDecreasing: false } as unknown as LoopParams;
  expect(nextLoopDecision(state({ lastRound: STAGNATION }), p)).toBe("FRESH_CONTEXT_RETRY");
});
