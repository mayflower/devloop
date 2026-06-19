// Deterministic risk-tier derivation from the set of touched paths.
// The tier is NEVER chosen by a caller/agent — only derived from what is touched,
// against a tier map that lives in the target repo's config (project-agnostic).
import { matchesAnyGlob } from "./glob.js";
const ORDER = ["T0", "T1", "T2", "T3"];
const rank = (t) => ORDER.indexOf(t);
const higher = (a, b) => (rank(a) >= rank(b) ? a : b);
const isTierMap = (m) => Array.isArray(m.rules);
function normalizeTierMap(map) {
    if (isTierMap(map))
        return map;
    const entries = Object.entries(map).filter(([k, v]) => k !== "default" && Array.isArray(v));
    const rules = entries.map(([tier, anyOf]) => ({ tier, anyOf: [...anyOf] }));
    // Default for unmatched paths: explicit `default`, else the highest tier present
    // (conservative — an unknown path is never silently downgraded, §9).
    const fallback = entries.reduce((hi, [t]) => higher(hi, t), "T0");
    return { rules, default: map.default ?? fallback };
}
export function deriveTier(touched, mapInput) {
    const map = normalizeTierMap(mapInput);
    if (touched.length === 0)
        return map.default;
    let result = null;
    for (const path of touched) {
        let pathTier = null;
        for (const rule of map.rules) {
            if (matchesAnyGlob(path, rule.anyOf)) {
                pathTier = pathTier ? higher(pathTier, rule.tier) : rule.tier;
            }
        }
        // An unmatched (unknown) path is conservative: escalate to the default tier.
        const effective = pathTier ?? map.default;
        result = result ? higher(result, effective) : effective;
    }
    return result ?? map.default;
}
