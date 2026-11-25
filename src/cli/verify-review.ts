// CLI: the AUTHORITATIVE CI gate under anchor (b). Runs on the protected runner. Verifies
// (1) a HUMAN (not the agent, not the author) approved the current HEAD via GitHub PR review,
// and (2) the diff does not touch the protected set (gate-tamper alarm). Fails closed.
//
// stdin JSON: { reviews, prAuthor, headSha, botLogins?, humanReviewers?, diffPaths?, protectedGlobs?,
//   tier?, headRef?, baseRef?, repo? }
// Spec-Aenderungen (REQ-SPECGATE-*) umgehen die T0/T1-Abkuerzung nicht und verlangen Basis-CODEOWNERS-Deckung.
// reviews come from `gh api repos/{owner}/{repo}/pulls/{n}/reviews`.

import { evaluateApproval, type Review, type ApprovalContext } from "../core/review.js";
import { touchesProtectedSet } from "../core/protected-set.js";
import {
  isSpecChange,
  readBaseCodeowners,
  specGlobs,
  specPaths,
  uncoveredByCodeowners,
  SPEC_GLOBS_PATH,
} from "../core/spec-change.js";
import { readStdin } from "./_stdin.js";

interface Request extends ApprovalContext {
  reviews?: Review[];
  diffPaths?: string[];
  protectedGlobs?: string[];
  headRef?: string; // PR head branch (devloop/spec/* = Spec-Aenderung)
  baseRef?: string; // e.g. origin/main; Basis-CODEOWNERS werden per git show von hier gelesen
  repo?: string; // repo root, default "."
  tier?: string; // from tier.json (derive-tier). Absent -> conservative default (require approval).
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

// 1b. Spec-Aenderung (REQ-SPECGATE-1..7). Config gilt immer (REQ-5): ungueltig = fail-closed.
const repo = req.repo ?? ".";
let globs: string[];
try {
  globs = specGlobs(repo, req.baseRef);
} catch (e) {
  fail(`spec-globs-invalid: ${(e as Error).message}`);
}
const diffPaths = req.diffPaths ?? [];
const specChange = isSpecChange(req.headRef, diffPaths, globs);
if (specChange) {
  const paths = specPaths(diffPaths, globs);
  if (paths.length === 0) {
    // REQ-3: Spec-Branch ohne erkennbare Spec-Datei laesst sich nicht an CODEOWNERS binden.
    fail(
      `spec-unguarded: Branch ${req.headRef} ist ein Spec-Branch, der Diff enthaelt aber keinen Spec-Pfad ` +
        `(Default **/spec.md, anpassbar in ${SPEC_GLOBS_PATH})`,
    );
  }
  if (!req.baseRef) {
    fail(`spec-unguarded: baseRef fehlt, Basis-CODEOWNERS nicht lesbar (Spec-Pfade: ${paths.join(", ")})`);
  }
  let owners: string | null;
  try {
    owners = readBaseCodeowners(repo, req.baseRef);
  } catch (e) {
    fail(`spec-unguarded: ${(e as Error).message} (Spec-Pfade: ${paths.join(", ")})`);
  }
  const uncovered = uncoveredByCodeowners(paths, owners);
  if (uncovered.length > 0) {
    fail(
      `spec-unguarded: Spec-Pfade ohne CODEOWNERS-Deckung in der Basis ${req.baseRef}` +
        `${owners === null ? " (keine CODEOWNERS gefunden)" : ""}: ${uncovered.join(", ")}`,
    );
  }
}

// 2. Tier gate (§9): T0/T1 auto-merge — no approval required. (Gate-tamper above still applied.)
// Unknown/absent tier defaults to conservative "T3" (approval required). The authoritative
// T2/T3 merge block is branch protection's required CODEOWNER review on the high-tier paths;
// this check additionally validates a present approval (human, on HEAD) and the protected set.
const tier = req.tier ?? "T3";
if (!specChange && (tier === "T0" || tier === "T1")) {
  process.stdout.write(JSON.stringify({ ok: true, tier, note: "tier T0/T1: no approval required (§9)" }) + "\n");
  process.exit(0);
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
