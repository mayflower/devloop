// Deterministic risk-tier derivation from the set of touched paths.
// The tier is NEVER chosen by a caller/agent — only derived from what is touched,
// against a tier map that lives in the target repo's config (project-agnostic).
import { matchesAnyGlob } from "./glob.js";
const ORDER = ["T0", "T1", "T2", "T3"];
const rank = (t) => ORDER.indexOf(t);
const higher = (a, b) => (rank(a) >= rank(b) ? a : b);
export function deriveTier(touched, map) {
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
