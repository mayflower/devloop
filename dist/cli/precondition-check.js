// CLI: the AUTHORITATIVE fail-closed binding anchor (design §0.2/§5#1). Meant to run as a
// required check on the protected CI runner — NOT a prompt. It fails closed when a phase
// token is missing/stale, or when the diff touches the protected set (gate-tamper alarm).
// A skipped stop thus becomes a visible RED gap, not a silent pass.
//
// stdin JSON: { repo, stop, artifactPath, diffPaths?, protectedGlobs? }
import { assertPrecondition } from "../core/tokens.js";
import { touchesProtectedSet } from "../core/protected-set.js";
import { readStdin } from "./_stdin.js";
function fail(reason) {
    process.stdout.write(JSON.stringify({ ok: false, reason }) + "\n");
    process.exit(1);
}
const req = JSON.parse(await readStdin());
// 1. The phase token must be present and content-bound to the reviewed artifact.
try {
    assertPrecondition(req.stop, req.artifactPath, req.repo);
}
catch (e) {
    fail(e.message);
}
// 2. The diff must not touch the protected set (changing the gate instead of the code).
if (req.diffPaths &&
    req.protectedGlobs &&
    touchesProtectedSet(req.diffPaths, req.protectedGlobs)) {
    fail("protected-set-touched: the diff edits a guardian/gate config (reward-hacking alarm)");
}
process.stdout.write(JSON.stringify({ ok: true }) + "\n");
