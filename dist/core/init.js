// Bootstrap a target repo for devloop (design §0.3): writes the CI binding-anchor workflow
// and a config skeleton in ONE step, so the guardian precondition (incl. the
// precondition-check guardian) becomes satisfiable. Idempotent: never overwrites silently.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
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
export function initRepo(targetRepo, ciTemplate) {
    const result = { created: [], skipped: [] };
    const writeIfAbsent = (relPath, content) => {
        const abs = join(targetRepo, relPath);
        if (existsSync(abs)) {
            result.skipped.push(relPath);
            return;
        }
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, content);
        result.created.push(relPath);
    };
    writeIfAbsent(".github/workflows/devloop-precondition-check.yml", ciTemplate);
    writeIfAbsent(".devloop/protected-globs.json", PROTECTED_GLOBS_SKELETON + "\n");
    writeIfAbsent(".devloop/tier-map.json", TIER_MAP_SKELETON + "\n");
    writeIfAbsent(".devloop/bot-logins.json", BOT_LOGINS_SKELETON + "\n");
    // Anchor (b) is the default: CI is authoritative. Recorded explicitly so the local merge
    // hook defers to CI instead of demanding the (anchor-a) local token.
    writeIfAbsent(".devloop/config.json", JSON.stringify({ anchor: "b" }, null, 2) + "\n");
    return result;
}
