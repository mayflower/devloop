// Drift guard (Obol pilot): under the chosen §9 model the T2/T3 merge gate is CODEOWNERS-by-path.
// If a T2/T3 path in the tier-map is NOT covered by any CODEOWNERS entry, a T2/T3 PR could
// auto-merge unreviewed. This module finds such gaps so a CI check can fail closed.
//
// Heuristic + deliberately CONSERVATIVE: a tier glob is flagged ONLY when NO CODEOWNERS pattern
// even plausibly covers it (zero overlap) — so a hard-fail never trips on partial-coverage edge
// cases. Catches the real failure mode: a whole tier path added with no CODEOWNERS line at all.
import { globToRegExp } from "./glob.js";
// Owners look like @user, @org/team, or an email. A line "pattern owner..." assigns ownership.
const looksLikeOwner = (t) => t.startsWith("@") || t.includes("@");
export function parseCodeowners(content) {
    return content
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith("#"))
        .map((l) => l.split(/\s+/))
        .filter((parts) => parts.length >= 2 && parts.slice(1).some(looksLikeOwner))
        .map((parts) => parts[0]);
}
// Does a CODEOWNERS pattern cover a concrete sample path? Lenient (favours "covered" to avoid
// false drift flags): `*` = everything; leading `/` anchors to root, else matches anywhere;
// trailing `/` = the whole directory subtree.
export function codeownersCovers(samplePath, pattern) {
    if (pattern === "*" || pattern === "/*")
        return true;
    const anchored = pattern.startsWith("/");
    let body = pattern.replace(/^\//, "");
    if (body.endsWith("/"))
        body += "**"; // directory -> everything under it
    const full = anchored ? body : `**/${body}`; // unanchored -> match at any depth
    return globToRegExp(full).test(samplePath);
}
// Concrete representative path(s) for a glob; leading **/ also yields a root-level variant.
function representativePaths(glob) {
    const canonical = glob
        .replace(/\*\*/g, "d")
        .replace(/\*/g, "f")
        .replace(/\?/g, "c")
        .replace(/\/+/g, "/")
        .replace(/^\//, "");
    const out = [canonical];
    if (glob.startsWith("**/"))
        out.push(canonical.replace(/^d\//, ""));
    return out;
}
export function findUncoveredTierGlobs(t2t3Globs, ownedPatterns) {
    return t2t3Globs.filter((glob) => {
        const samples = representativePaths(glob);
        // Flagged only if NO sample is covered by ANY owned pattern (clearly zero overlap).
        return !samples.some((s) => ownedPatterns.some((p) => codeownersCovers(s, p)));
    });
}
