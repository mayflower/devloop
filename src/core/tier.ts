// Deterministic risk-tier derivation from the set of touched paths.
// The tier is NEVER chosen by a caller/agent — only derived from what is touched,
// against a tier map that lives in the target repo's config (project-agnostic).

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

// Dependency-free glob -> RegExp. Supports **, **/ (zero-or-more dirs), *, ?.
function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        if (glob[i + 2] === "/") {
          re += "(?:.*/)?";
          i += 2;
        } else {
          re += ".*";
          i += 1;
        }
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp("^" + re + "$");
}

const matchesAny = (path: string, globs: string[]): boolean =>
  globs.some((g) => globToRegExp(g).test(path));

export function deriveTier(touched: string[], map: TierMap): Tier {
  if (touched.length === 0) return map.default;
  let result: Tier | null = null;
  for (const path of touched) {
    let pathTier: Tier | null = null;
    for (const rule of map.rules) {
      if (matchesAny(path, rule.anyOf)) {
        pathTier = pathTier ? higher(pathTier, rule.tier) : rule.tier;
      }
    }
    // An unmatched (unknown) path is conservative: escalate to the default tier.
    const effective = pathTier ?? map.default;
    result = result ? higher(result, effective) : effective;
  }
  return result ?? map.default;
}
