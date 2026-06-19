// Back-edge termination + escalation (design §5#2 / §10 duty 2). Pure decision over the
// loop state. The thresholds (maxIter, progress criterion) are INJECTED parameters, never
// defaulted in code — they are pilot measurements (§1.1/§12), not a design choice here.

export interface LoopState {
  iteration: number;
  errorCounts: number[]; // history of error/finding counts, oldest -> newest
  gateChangedNotCode: boolean; // the "fix" was a diff on the protected set
  freshContextUsed: boolean; // whether the one fresh-context retry was already spent
}

export interface LoopParams {
  maxIter: number;
  requireStrictlyDecreasing: boolean; // progress := strictly fewer errors than before
}

export type LoopDecision =
  | "RE_GEN"
  | "FRESH_CONTEXT_RETRY"
  | "ESCALATE_STAGNATION"
  | "ESCALATE_MAX_ITER"
  | "ESCALATE_GATE_TAMPER";

function isStagnating(errorCounts: number[], requireStrictlyDecreasing: boolean): boolean {
  if (errorCounts.length < 2) return false; // no history yet -> can't judge
  const last = errorCounts[errorCounts.length - 1];
  const prev = errorCounts[errorCounts.length - 2];
  const improved = requireStrictlyDecreasing ? last < prev : last <= prev;
  return !improved;
}

export function nextLoopDecision(state: LoopState, params: LoopParams): LoopDecision {
  // Priority 1: tampering with the guardians is an alarm, not progress.
  if (state.gateChangedNotCode) return "ESCALATE_GATE_TAMPER";
  // Priority 2: hard iteration ceiling.
  if (state.iteration >= params.maxIter) return "ESCALATE_MAX_ITER";
  // Priority 3: stagnation -> one fresh context to break in-session lock-in, then stop.
  if (isStagnating(state.errorCounts, params.requireStrictlyDecreasing)) {
    return state.freshContextUsed ? "ESCALATE_STAGNATION" : "FRESH_CONTEXT_RETRY";
  }
  // Otherwise: feed the defect signal back and re-generate.
  return "RE_GEN";
}
