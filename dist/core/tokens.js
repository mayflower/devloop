// Content-bound approval tokens (design §0.2) — the heart of the binding mechanism.
// A stop is only "passed" if a token exists that is bound to the sha256 of the EXACT
// reviewed artifact. Editing the artifact after approval breaks the hash -> "stale".
// Skipping the stop -> "missing". Either way the gap is DETECTABLE (not a silent skip);
// the deterministic anchors (CI required-check / hook) act on this verdict.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
const TOKEN_DIR = ".devloop";
const tokenPath = (repo, stop) => join(repo, TOKEN_DIR, `${stop}.approved`);
const hashFile = (artifactPath) => createHash("sha256").update(readFileSync(artifactPath)).digest("hex");
// Written ONLY by a real human approval action — never by the driver prompt.
export function writeApproval(stop, artifactPath, repo) {
    const p = tokenPath(repo, stop);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, hashFile(artifactPath));
}
export function verifyApproval(stop, artifactPath, repo) {
    const p = tokenPath(repo, stop);
    if (!existsSync(p))
        return "missing";
    const recorded = readFileSync(p, "utf8").trim();
    return recorded === hashFile(artifactPath) ? "ok" : "stale";
}
export function assertPrecondition(stop, artifactPath, repo) {
    const status = verifyApproval(stop, artifactPath, repo);
    if (status !== "ok") {
        throw new Error(`devloop precondition failed: stop "${stop}" is ${status} for ${artifactPath} ` +
            `(no valid human approval token under ${TOKEN_DIR}/). Fail-closed.`);
    }
}
