// CLI: the AUTHORITATIVE CI gate under anchor (b). Runs on the protected runner. Verifies
// (1) a HUMAN (not the agent, not the author) approved the current HEAD via GitHub PR review,
// and (2) the diff does not touch the protected set (gate-tamper alarm). Fails closed.
//
// stdin JSON: { reviews, prAuthor, headSha, botLogins?, humanReviewers?, diffPaths?, protectedGlobs? }
// reviews come from `gh api repos/{owner}/{repo}/pulls/{n}/reviews`.

import { evaluateApproval, type Review, type ApprovalContext } from "../core/review.js";
import { touchesProtectedSet } from "../core/protected-set.js";
import { readStdin } from "./_stdin.js";

interface Request extends ApprovalContext {
  reviews?: Review[];
  diffPaths?: string[];
  protectedGlobs?: string[];
}

function fail(reason: string): never {
  process.stdout.write(JSON.stringify({ ok: false, reason }) + "\n");
  process.exit(1);
}

const req = JSON.parse(await readStdin()) as Request;

const reviews = req.reviews ?? [];

// 1. Gate-tamper fails ALWAYS, independent of approval state (reward-hacking alarm).
if (
  req.diffPaths &&
  req.protectedGlobs &&
  touchesProtectedSet(req.diffPaths, req.protectedGlobs)
) {
  fail("protected-set-touched: the diff edits a guardian/gate config (reward-hacking alarm)");
}

const status = evaluateApproval(reviews, req);
if (status === "ok") {
  process.stdout.write(JSON.stringify({ ok: true }) + "\n");
  process.exit(0);
}

// No approval YET (nobody has approved) — non-blocking PENDING. The authoritative "must be
// approved" gate under anchor b is branch protection's required CODEOWNER review, not this
// check. Failing here would leave a stale FAILURE run that lingers across the pull_request /
// pull_request_review events and blocks the merge even after a later approve.
const anyApproved = reviews.some((r) => r.state === "APPROVED");
if (!anyApproved) {
  process.stdout.write(
    JSON.stringify({
      ok: true,
      pending: true,
      note: "awaiting human CODEOWNER review (enforced by branch protection)",
    }) + "\n",
  );
  process.exit(0);
}

// An approval is PRESENT but not valid on HEAD (agent/author self-approve, or stale) -> fail loud.
fail(`human-approval-${status}: an approval exists but is not a valid human approval on HEAD`);
