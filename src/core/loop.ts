// Back-edge termination + escalation (design §5#2 / §10 duty 2). Pure decision over the
// loop state. The thresholds (maxIter, progress criterion) are INJECTED parameters, never
// defaulted in code — they are pilot measurements (§1.1/§12), not a design choice here.

// Signals of the last evaluated round, produced by the ledger (applyRound). Progress is NOT a
// count of findings but a statement about finding identity over rounds (REQ-LEDGER-6/7/11).
export interface RoundSignal {
  judged: boolean; // false: nothing blocker/major was open at round start -> neither progress nor stagnation
  progress: boolean;
  oscillation: boolean; // a blocker/major key was reopened for the 2nd+ time this round
}

export interface LoopState {
  iteration: number;
  lastRound?: RoundSignal | null; // null/absent: no round evaluated yet
  gateChangedNotCode: boolean; // the "fix" was a diff on the protected set
  freshContextUsed: boolean; // whether the one fresh-context retry was already spent
}

export interface LoopParams {
  maxIter: number;
}

export type LoopDecision =
  | "RE_GEN"
  | "FRESH_CONTEXT_RETRY"
  | "ESCALATE_STAGNATION"
  | "ESCALATE_MAX_ITER"
  | "ESCALATE_OSCILLATION"
  | "ESCALATE_GATE_TAMPER";

export function nextLoopDecision(state: LoopState, params: LoopParams): LoopDecision {
  // Priority 1: tampering with the guardians is an alarm, not progress.
  if (state.gateChangedNotCode) return "ESCALATE_GATE_TAMPER";
  // Priority 2: hard iteration ceiling.
  if (state.iteration >= params.maxIter) return "ESCALATE_MAX_ITER";
  // Priority 3: oscillation (a fix reverted twice) -> stop; a fresh context would not help.
  if (state.lastRound?.oscillation) return "ESCALATE_OSCILLATION";
  // Priority 4: stagnation (only a judged round can stagnate) -> one fresh context to break
  // in-session lock-in, then stop.
  if (state.lastRound?.judged && !state.lastRound.progress) {
    return state.freshContextUsed ? "ESCALATE_STAGNATION" : "FRESH_CONTEXT_RETRY";
  }
  // Otherwise: feed the defect signal back and re-generate.
  return "RE_GEN";
}
