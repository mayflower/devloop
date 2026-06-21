// Stateless resume: reconstruct the driver phase from a PR's GitHub facts (no local run-state —
// GitHub + the repo ARE the durable state). A new session can pick up a feature mid-flight,
// including after the human ended the session, reviewed, and requested changes.

import type { Phase } from "./driver.js";
import type { Stop } from "./types.js";
import { isSpecBranch } from "./unskip.js";

export interface PrFacts {
  headBranch: string; // github.event.pull_request.head.ref / `gh pr view --json headRefName`
  merged: boolean;
  reviewDecision: "approved" | "changes-requested" | "none";
  checks: "green" | "red" | "pending";
}

export interface Reconstructed {
  phase: Phase;
  humanApprovals: Partial<Record<Stop, boolean>>;
  reviewDecision?: "approved" | "changes-requested";
  gateVerdict?: "green" | "red";
  done: boolean;
}

// Map GitHub's statusCheckRollup entries to a single checks verdict. No checks yet -> pending
// (don't mistake "CI hasn't run" for green); any incomplete -> pending; any non-success
// conclusion -> red; otherwise green.
const PASSING = new Set(["SUCCESS", "NEUTRAL", "SKIPPED"]);
export function rollupStatus(
  entries: { status?: string; conclusion?: string }[],
): "green" | "red" | "pending" {
  if (entries.length === 0) return "pending";
  if (entries.some((e) => e.status && e.status !== "COMPLETED")) return "pending";
  if (entries.some((e) => !PASSING.has(e.conclusion ?? ""))) return "red";
  return "green";
}

export function reconstructState(facts: PrFacts): Reconstructed {
  const out: Reconstructed = { phase: "implemented", humanApprovals: {}, done: false };
  if (facts.reviewDecision === "changes-requested") out.reviewDecision = "changes-requested";

  if (isSpecBranch(facts.headBranch)) {
    if (facts.merged) {
      out.phase = "spec-merged"; // spec is on main -> implement is next
    } else {
      out.phase = "spec-pr-open";
      if (facts.reviewDecision === "approved") out.humanApprovals["spec-review"] = true;
    }
    return out;
  }

  // Implementation PR.
  if (facts.merged) {
    out.phase = "merge-pending";
    out.done = true; // feature already merged — nothing to do
    return out;
  }
  if (facts.checks === "red") {
    out.phase = "gated";
    out.gateVerdict = "red"; // back-edge: re-implement against the red gate
    return out;
  }
  if (facts.checks === "pending") {
    out.phase = "implemented"; // gates still running — observe / await CI
    return out;
  }
  // checks green -> at the merge gate; the review decision drives what happens next.
  out.phase = "merge-pending";
  out.gateVerdict = "green";
  if (facts.reviewDecision === "approved") {
    out.humanApprovals["merge-review"] = true;
    out.humanApprovals["t3-merge"] = true; // GitHub approval satisfies whichever the tier needs
  }
  return out;
}
