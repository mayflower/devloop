// Deterministic risk-tier derivation from the set of touched paths.
// The tier is NEVER chosen by a caller/agent — only derived from what is touched,
// against a tier map that lives in the target repo's config (project-agnostic).

import { matchesAnyGlob } from "./glob.js";

export type Tier = "T0" | "T1" | "T2" | "T3";

export interface TierRule {
  tier: Tier;
  anyOf: string[];
}

export interface TierMap {
  rules: TierRule[];
  default: Tier;
}

const ORDER: Tier[] = ["T0", "T1", "T2", "T3"];
const rank = (t: Tier): number => ORDER.indexOf(t);
const higher = (a: Tier, b: Tier): Tier => (rank(a) >= rank(b) ? a : b);

export function deriveTier(touched: string[], map: TierMap): Tier {
  if (touched.length === 0) return map.default;
  let result: Tier | null = null;
  for (const path of touched) {
    let pathTier: Tier | null = null;
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
