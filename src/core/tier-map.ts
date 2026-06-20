// Locate a repo's tier-map robustly. Two pilot stumbling blocks motivated this:
//   (a) the tier step must use devloop's node CLI (not a repo's tsx script — sandbox-broken),
//   (b) the map must be loaded by an ABSOLUTE path relative to the repo, never module-relative.
// Candidate order (most specific first): devloop's own dir, a common tools/ dir, repo root.

import { existsSync } from "node:fs";
import { join } from "node:path";

export const TIER_MAP_CANDIDATES = [
  ".devloop/tier-map.json",
  "tools/tier-map.json",
  "tier-map.json",
];

export function resolveTierMapPath(repo: string): string | null {
  for (const candidate of TIER_MAP_CANDIDATES) {
    const path = join(repo, candidate);
    if (existsSync(path)) return path;
  }
  return null;
}
