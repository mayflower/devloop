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

const status = evaluateApproval(req.reviews ?? [], req);
if (status !== "ok") {
  fail(`human-approval-${status}: no valid human PR approval on HEAD (the agent/author cannot self-approve)`);
}

if (
  req.diffPaths &&
  req.protectedGlobs &&
  touchesProtectedSet(req.diffPaths, req.protectedGlobs)
) {
  fail("protected-set-touched: the diff edits a guardian/gate config (reward-hacking alarm)");
}

process.stdout.write(JSON.stringify({ ok: true }) + "\n");
