// CLI: LOCAL/ADVISORY precondition check over the content-bound token (anchor a path).
// NOTE: the AUTHORITATIVE CI gate under the chosen anchor (b) is `verify-review` (human
// GitHub PR approval, which the agent cannot forge) + protected-set. Use this CLI for the
// local fast pre-check, or for repos that opt into the local-token anchor (a). It fails
// closed when the token is missing/stale or the diff touches the protected set.
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
