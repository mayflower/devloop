// Server-authoritative approval (anchor b, design §5.1/§10.1): the authority is a HUMAN
// PR review on GitHub — a channel the agent cannot reach. This pure function decides, from
// the PR's review list, whether a valid human approval exists for the current HEAD.
//
// Core property: neither the agent (a bot identity) nor the PR author can self-approve.
// Content-binding: an approval counts only on the current HEAD commit (GitHub also dismisses
// stale reviews on push); approvals on older commits are "stale".

export interface Review {
  user: string;
  state: string; // e.g. "APPROVED", "CHANGES_REQUESTED", "COMMENTED"
  commit_id: string;
}

export interface ApprovalContext {
  prAuthor: string; // the author cannot self-approve
  headSha: string; // approval must be on this commit
  botLogins?: string[]; // identities that are NOT human (the agent) — cannot approve
  humanReviewers?: string[]; // optional CODEOWNERS allowlist; if set, only these count
}

export type ApprovalStatus = "ok" | "missing" | "stale";

export function evaluateApproval(reviews: Review[], ctx: ApprovalContext): ApprovalStatus {
  const bots = new Set(ctx.botLogins ?? []);
  const owners = ctx.humanReviewers ? new Set(ctx.humanReviewers) : null;

  const humanApprovals = reviews.filter(
    (r) =>
      r.state === "APPROVED" &&
      r.user !== ctx.prAuthor && // no self-approval
      !bots.has(r.user) && // the agent is not a human
      (owners === null || owners.has(r.user)), // CODEOWNER allowlist, if configured
  );

  if (humanApprovals.length === 0) return "missing";
  if (humanApprovals.some((r) => r.commit_id === ctx.headSha)) return "ok";
  return "stale";
}
