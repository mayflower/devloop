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

// Alternative, simpler config shape: tier -> globs (e.g. {"T3":[...],"T2":[...],"T1":["**"]}),
// with the floor encoded as a `**` catch-all (or an optional explicit `default`). This is a
// common convention (Obol uses it); deriveTier accepts it natively so a repo's existing
// tier-map can be reused without an adapter.
export type TierRecord = Partial<Record<Tier, readonly string[]>> & { default?: Tier };

export type TierMapInput = TierMap | TierRecord;

const ORDER: Tier[] = ["T0", "T1", "T2", "T3"];
const rank = (t: Tier): number => ORDER.indexOf(t);
const higher = (a: Tier, b: Tier): Tier => (rank(a) >= rank(b) ? a : b);

const isTierMap = (m: TierMapInput): m is TierMap =>
  Array.isArray((m as TierMap).rules);

function normalizeTierMap(map: TierMapInput): TierMap {
  if (isTierMap(map)) return map;
  const entries = Object.entries(map).filter(
    ([k, v]) => k !== "default" && Array.isArray(v),
  ) as [Tier, string[]][];
  const rules: TierRule[] = entries.map(([tier, anyOf]) => ({ tier, anyOf: [...anyOf] }));
  // Default for unmatched paths: explicit `default`, else the highest tier present
  // (conservative — an unknown path is never silently downgraded, §9).
  const fallback = entries.reduce<Tier>((hi, [t]) => higher(hi, t), "T0");
  return { rules, default: map.default ?? fallback };
}

// All globs assigned to the given tiers (e.g. the T2/T3 "needs-review" paths). Accepts either
// map shape. Used by the CODEOWNERS drift guard.
export function tierGlobs(mapInput: TierMapInput, tiers: Tier[]): string[] {
  const wanted = new Set(tiers);
  return normalizeTierMap(mapInput)
    .rules.filter((r) => wanted.has(r.tier))
    .flatMap((r) => r.anyOf);
}

export function deriveTier(touched: string[], mapInput: TierMapInput): Tier {
  const map = normalizeTierMap(mapInput);
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
