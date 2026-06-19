// Shared types across the deterministic core.

// Human stops. The two HARD, token-gated, non-skippable stops (design §3/§8) are
// "spec-review" (§5.1 root of trust) and "t3-merge" (§9 irreversible gate).
// "merge-review" is T2's ordinary required-reviewer stop (§6) — also human, satisfied by
// standard branch-protection infra, not token-hard. Only the two hard stops carry tokens.
export type Stop = "spec-review" | "merge-review" | "t3-merge";

export const HARD_STOPS: Stop[] = ["spec-review", "t3-merge"];
