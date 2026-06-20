// Bootstrap a target repo for devloop (design §0.3): writes the CI binding-anchor workflow
// and a config skeleton in ONE step, so the guardian precondition (incl. the
// precondition-check guardian) becomes satisfiable. Idempotent: never overwrites silently.
// Upgrade-aware: it will NOT shadow an existing tier-map, and it warns LOUDLY (notes) when an
// existing workflow is left stale — `force` overwrites the workflow for a real migration.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { resolveTierMapPath } from "./tier-map.js";
import { tierGlobs } from "./tier.js";
import { parseCodeowners, findUncoveredTierGlobs } from "./codeowners.js";
// Convert a tier glob to a CODEOWNERS path: `services/**` -> `/services/` (anchored dir),
// `**/auth/**` -> `auth/` (matches anywhere). A skeleton line for the human to assign owners.
function tierGlobToCodeownersPath(glob) {
    if (glob.startsWith("**/")) {
        return glob.slice(3).replace(/\/\*\*$/, "/").replace(/\*\*$/, "");
    }
    return "/" + glob.replace(/\/\*\*$/, "/").replace(/\*\*$/, "").replace(/\*$/, "");
}
// Project-agnostic skeletons — the adopter tunes them in their constitution/CI.
const PROTECTED_GLOBS_SKELETON = JSON.stringify(["**/stryker.conf.*", "**/.semgrep/**", "**/constitution.md", "**/CODEOWNERS", "**/*.eslintrc*"], null, 2);
// Anchor (b): identities that are NOT human (the agent's bot/app account). A review by any
// of these never counts as a human approval. The adopter fills in their agent's login(s).
const BOT_LOGINS_SKELETON = JSON.stringify(["devloop-agent[bot]"], null, 2);
// tier -> globs, highest match wins; the floor is the `**` catch-all in T1 (no separate
// `default` needed). deriveTier also accepts the verbose {rules,default} shape.
const TIER_MAP_SKELETON = JSON.stringify({
    T3: ["**/migrations/**", "**/auth/**", "**/payment/**", "**/contracts/**"],
    T2: ["src/**", "services/**"],
    T1: ["**"],
}, null, 2);
export function initRepo(targetRepo, ciTemplate, opts = {}) {
    const result = { created: [], skipped: [], notes: [] };
    const write = (relPath, content) => {
        const abs = join(targetRepo, relPath);
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, content);
        result.created.push(relPath);
    };
    const writeIfAbsent = (relPath, content) => {
        if (existsSync(join(targetRepo, relPath)))
            result.skipped.push(relPath);
        else
            write(relPath, content);
    };
    // The workflow goes STALE across versions. If it exists and we're not forcing, leave it but
    // warn loudly — a silent "skipped" reads as "migrated" when the old gate is still wired.
    const workflow = ".github/workflows/devloop-precondition-check.yml";
    if (existsSync(join(targetRepo, workflow)) && !opts.force) {
        result.skipped.push(workflow);
        result.notes.push(`⚠️ ${workflow} exists and was NOT updated — re-run with --force to migrate it, then a ` +
            `HUMAN must push it (a bot GitHub App lacks the 'workflows' permission to push .github/workflows/**).`);
    }
    else {
        write(workflow, ciTemplate); // create (fresh) or overwrite (--force migration)
    }
    writeIfAbsent(".devloop/protected-globs.json", PROTECTED_GLOBS_SKELETON + "\n");
    writeIfAbsent(".devloop/bot-logins.json", BOT_LOGINS_SKELETON + "\n");
    // Anchor (b) is the default: CI is authoritative. Recorded explicitly so the local merge
    // hook defers to CI instead of demanding the (anchor-a) local token.
    writeIfAbsent(".devloop/config.json", JSON.stringify({ anchor: "b" }, null, 2) + "\n");
    // Tier-map: NEVER shadow an existing one. resolveTierMapPath prefers .devloop/, so writing a
    // default there would silently override a repo's own tools/tier-map.json -> gate regression.
    const existingTierMap = resolveTierMapPath(targetRepo);
    if (existingTierMap) {
        result.skipped.push(".devloop/tier-map.json");
        result.notes.push(`tier-map already present (${existingTierMap.replace(targetRepo + "/", "")}) — not writing ` +
            `.devloop/tier-map.json (it would shadow yours). Reconcile your map with the devloop tier rules.`);
    }
    else {
        write(".devloop/tier-map.json", TIER_MAP_SKELETON + "\n");
    }
    // CODEOWNERS = the §9 T2/T3 merge gate. Scaffold one covering the T2/T3 tier paths if absent;
    // NEVER clobber an existing (curated) one — just flag uncovered paths so the human closes the drift.
    const tierMapPath = resolveTierMapPath(targetRepo);
    if (tierMapPath) {
        const t2t3 = tierGlobs(JSON.parse(readFileSync(tierMapPath, "utf8")), ["T2", "T3"]);
        const coRel = ["CODEOWNERS", ".github/CODEOWNERS", "docs/CODEOWNERS"].find((r) => existsSync(join(targetRepo, r)));
        if (!coRel) {
            const owners = [...new Set(t2t3.map(tierGlobToCodeownersPath))].map((p) => `${p} @OWNER`);
            write(".github/CODEOWNERS", "# devloop: T2/T3 tier paths require a human CODEOWNER review (the §9 merge gate).\n" +
                "# Replace @OWNER with the real owner(s). Keep your protected set (gate configs) covered too.\n" +
                owners.join("\n") +
                "\n");
        }
        else {
            result.skipped.push(coRel);
            const uncovered = findUncoveredTierGlobs(t2t3, parseCodeowners(readFileSync(join(targetRepo, coRel), "utf8")));
            if (uncovered.length > 0) {
                result.notes.push(`CODEOWNERS (${coRel}) does not cover these T2/T3 tier paths — add owner lines, else such ` +
                    `a PR could auto-merge unreviewed: ${uncovered.join(", ")}`);
            }
        }
    }
    return result;
}
