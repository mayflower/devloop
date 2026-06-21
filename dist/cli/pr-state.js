// CLI: reconstruct the devloop phase of a PR from GitHub (stateless resume). Reads the PR facts
// via `gh` and maps them to a phase + the back-edge/approval signals the driver needs.
// Usage: pr-state <repoPath> <prNumber>
import { execFileSync } from "node:child_process";
import { reconstructState, rollupStatus } from "../core/resume.js";
const repo = process.argv[2] ?? ".";
const pr = process.argv[3];
if (!pr) {
    process.stderr.write("usage: pr-state <repoPath> <prNumber>\n");
    process.exit(64);
}
const raw = execFileSync("gh", ["pr", "view", pr, "--json", "headRefName,state,reviewDecision,statusCheckRollup"], { cwd: repo, encoding: "utf8" });
const v = JSON.parse(raw);
const reviewMap = {
    APPROVED: "approved",
    CHANGES_REQUESTED: "changes-requested",
};
const facts = {
    headBranch: v.headRefName,
    merged: v.state === "MERGED",
    reviewDecision: reviewMap[v.reviewDecision ?? ""] ?? "none",
    checks: rollupStatus(v.statusCheckRollup ?? []),
};
process.stdout.write(JSON.stringify({ pr: Number(pr), facts, reconstructed: reconstructState(facts) }, null, 2) + "\n");
