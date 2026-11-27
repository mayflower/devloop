// CLI: the AUTHORITATIVE CI gate under anchor (b). Runs on the protected runner. Verifies
// (1) a HUMAN (not the agent, not the author) approved the current HEAD via GitHub PR review,
// and (2) the diff does not touch the protected set (gate-tamper alarm). Fails closed.
//
// stdin JSON: { reviews, prAuthor, headSha, botLogins?, humanReviewers?, diffPaths?, protectedGlobs?,
//   tier?, headRef?, baseRef?, repo? }
// Spec-Aenderungen (REQ-SPECGATE-*) umgehen die T0/T1-Abkuerzung nicht und verlangen Basis-CODEOWNERS-Deckung.
// Mit baseRef kommen protectedGlobs und botLogins aus der Basis (Rueckfall: Arbeitsbaum, dann stdin;
// REQ-CFGBASE-2..4), und Config-Aenderungen (.devloop/**, tier-map) verhalten sich wie Spec-Aenderungen
// (REQ-CFGBASE-5/6), ausser bei Erstaufnahme. Mit baseRef gilt zusaetzlich das CODEOWNERS-Gate
// (REQ-COBASE-1..4): T2/T3-Diff-Pfade nach Basis-tier-map muessen von der Basis-CODEOWNERS gedeckt sein.
// reviews come from `gh api repos/{owner}/{repo}/pulls/{n}/reviews`.
import { evaluateApproval } from "../core/review.js";
import { touchesProtectedSet } from "../core/protected-set.js";
import { isSpecChange, readBaseCodeowners, specGlobs, specPaths, uncoveredByCodeowners, SPEC_GLOBS_PATH, } from "../core/spec-change.js";
import { BOT_LOGINS_PATH, PROTECTED_GLOBS_PATH, configPaths, isInitialAdoption, readConfigList, } from "../core/config-change.js";
import { readBaseTierMap } from "../core/tier-map.js";
import { deriveTier } from "../core/tier.js";
import { readStdin } from "./_stdin.js";
function fail(reason) {
    process.stdout.write(JSON.stringify({ ok: false, reason }) + "\n");
    process.exit(1);
}
const req = JSON.parse(await readStdin());
const reviews = req.reviews ?? [];
const repo = req.repo ?? ".";
// 0. Config-Listen aus der Basis (REQ-CFGBASE-2/3/4). Unlesbar = config-invalid (kein Rueckfall),
// nirgends vorhanden = config-missing. Ohne baseRef gilt nur der stdin-Wert wie bisher.
let protectedGlobs = req.protectedGlobs;
let botLogins = req.botLogins;
if (req.baseRef) {
    try {
        const pg = readConfigList(repo, req.baseRef, PROTECTED_GLOBS_PATH);
        const bl = readConfigList(repo, req.baseRef, BOT_LOGINS_PATH);
        protectedGlobs = pg?.list ?? req.protectedGlobs;
        botLogins = bl?.list ?? req.botLogins;
    }
    catch (e) {
        fail(`config-invalid: ${e.message}`);
    }
    const missing = [
        ...(protectedGlobs === undefined ? [PROTECTED_GLOBS_PATH] : []),
        ...(botLogins === undefined ? [BOT_LOGINS_PATH] : []),
    ];
    if (missing.length > 0) {
        fail(`config-missing: weder in der Basis ${req.baseRef}, im Arbeitsbaum noch auf stdin: ${missing.join(", ")}`);
    }
}
const approvalCtx = { ...req, botLogins };
// 1. Gate-tamper fails ALWAYS, independent of approval state (reward-hacking alarm).
if (req.diffPaths && protectedGlobs && touchesProtectedSet(req.diffPaths, protectedGlobs)) {
    fail("protected-set-touched: the diff edits a guardian/gate config (reward-hacking alarm)");
}
// 1b. Spec-Aenderung (REQ-SPECGATE-1..7). Config gilt immer (REQ-5): ungueltig = fail-closed.
let globs;
try {
    globs = specGlobs(repo, req.baseRef);
}
catch (e) {
    fail(`spec-globs-invalid: ${e.message}`);
}
const diffPaths = req.diffPaths ?? [];
const specChange = isSpecChange(req.headRef, diffPaths, globs);
if (specChange) {
    const paths = specPaths(diffPaths, globs);
    if (paths.length === 0) {
        // REQ-3: Spec-Branch ohne erkennbare Spec-Datei laesst sich nicht an CODEOWNERS binden.
        fail(`spec-unguarded: Branch ${req.headRef} ist ein Spec-Branch, der Diff enthaelt aber keinen Spec-Pfad ` +
            `(Default **/spec.md, anpassbar in ${SPEC_GLOBS_PATH})`);
    }
    if (!req.baseRef) {
        fail(`spec-unguarded: baseRef fehlt, Basis-CODEOWNERS nicht lesbar (Spec-Pfade: ${paths.join(", ")})`);
    }
    let owners;
    try {
        owners = readBaseCodeowners(repo, req.baseRef);
    }
    catch (e) {
        fail(`spec-unguarded: ${e.message} (Spec-Pfade: ${paths.join(", ")})`);
    }
    const uncovered = uncoveredByCodeowners(paths, owners);
    if (uncovered.length > 0) {
        fail(`spec-unguarded: Spec-Pfade ohne CODEOWNERS-Deckung in der Basis ${req.baseRef}` +
            `${owners === null ? " (keine CODEOWNERS gefunden)" : ""}: ${uncovered.join(", ")}`);
    }
}
// 1c. Config-Aenderung (REQ-CFGBASE-5/6): kein Abkuerzen, Basis-CODEOWNERS muessen die Pfade decken.
// Erstaufnahme (Basis ohne jeden Config-Pfad) ist ausgenommen: es gibt nichts zu schuetzen.
let configChange = false;
if (req.baseRef) {
    const cfgPaths = configPaths(diffPaths);
    if (cfgPaths.length > 0) {
        let adoption;
        try {
            adoption = isInitialAdoption(repo, req.baseRef);
        }
        catch (e) {
            fail(`config-invalid: ${e.message}`);
        }
        if (!adoption) {
            configChange = true;
            let owners;
            try {
                owners = readBaseCodeowners(repo, req.baseRef);
            }
            catch (e) {
                fail(`config-unguarded: ${e.message} (Config-Pfade: ${cfgPaths.join(", ")})`);
            }
            const uncovered = uncoveredByCodeowners(cfgPaths, owners);
            if (uncovered.length > 0) {
                fail(`config-unguarded: Config-Pfade ohne CODEOWNERS-Deckung in der Basis ${req.baseRef}` +
                    `${owners === null ? " (keine CODEOWNERS gefunden)" : ""}: ${uncovered.join(", ")}`);
            }
        }
    }
}
// 1d. CODEOWNERS-Wirksamkeit gegen die Basis (REQ-COBASE-1..4, 7): Review-pflichtige Pfade (Pfad-Tier
// T2/T3 nach der Basis-tier-map) muessen von der Basis-CODEOWNERS gedeckt sein, sonst verlangt GitHub
// kein Owner-Review. Nur mit baseRef; Erstaufnahme und Basis ohne tier-map sind ausgenommen. Hart, nie pending.
// Die Erstaufnahme-Ausnahme ist Verteidigung in der Tiefe: Alle tier-map-Kandidaten sind Config-Pfade,
// bei Erstaufnahme ist readBaseTierMap daher immer null (gemessen: Mutante ohne Ausnahme ist aequivalent).
if (req.baseRef) {
    let adoption;
    let base;
    try {
        adoption = isInitialAdoption(repo, req.baseRef);
        base = adoption ? null : readBaseTierMap(repo, req.baseRef);
    }
    catch (e) {
        fail(`config-invalid: ${e.message}`);
    }
    if (!adoption && base) {
        const baseMap = base.map;
        const gated = diffPaths.filter((p) => {
            const t = deriveTier([p], baseMap);
            return t === "T2" || t === "T3";
        });
        if (gated.length > 0) {
            let owners;
            try {
                owners = readBaseCodeowners(repo, req.baseRef);
            }
            catch (e) {
                fail(`codeowners-unguarded: ${e.message} (Pfade: ${gated.join(", ")})`);
            }
            const uncovered = uncoveredByCodeowners(gated, owners);
            if (uncovered.length > 0) {
                fail(`codeowners-unguarded: T2/T3-Pfade ohne CODEOWNERS-Deckung in der Basis ${req.baseRef}` +
                    `${owners === null ? " (keine CODEOWNERS gefunden)" : ""}: ${uncovered.join(", ")}`);
            }
        }
    }
}
// 2. Tier gate (§9): T0/T1 auto-merge — no approval required. (Gate-tamper above still applied.)
// Unknown/absent tier defaults to conservative "T3" (approval required). The authoritative
// T2/T3 merge block is branch protection's required CODEOWNER review on the high-tier paths;
// this check additionally validates a present approval (human, on HEAD) and the protected set.
const tier = req.tier ?? "T3";
if (!specChange && !configChange && (tier === "T0" || tier === "T1")) {
    process.stdout.write(JSON.stringify({ ok: true, tier, note: "tier T0/T1: no approval required (§9)" }) + "\n");
    process.exit(0);
}
const status = evaluateApproval(reviews, approvalCtx);
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
    process.stdout.write(JSON.stringify({
        ok: true,
        pending: true,
        note: "awaiting human CODEOWNER review (enforced by branch protection)",
    }) + "\n");
    process.exit(0);
}
// An approval is PRESENT but not valid on HEAD (agent/author self-approve, or stale) -> fail loud.
fail(`human-approval-${status}: an approval exists but is not a valid human approval on HEAD`);
