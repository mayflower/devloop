// Locate a repo's tier-map robustly. Two pilot stumbling blocks motivated this:
//   (a) the tier step must use devloop's node CLI (not a repo's tsx script — sandbox-broken),
//   (b) the map must be loaded by an ABSOLUTE path relative to the repo, never module-relative.
// Candidate order (most specific first): devloop's own dir, a common tools/ dir, repo root.

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { TierMapInput } from "./tier.js";
import { readTreeEntry } from "./tree-entry.js";

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

/**
 * tier-map aus der BASIS (`git show`), gleiche Kandidatenreihenfolge wie im Arbeitsbaum. null = die
 * Basis hat keinen Kandidaten. Ein Kandidat, der kein reguelaeres Blob ist oder nicht parst, wirft
 * (fail-closed). `path` hat die Form `<baseRef>:<kandidat>`.
 */
export function readBaseTierMap(repo: string, baseRef: string): { path: string; map: TierMapInput } | null {
  for (const cand of TIER_MAP_CANDIDATES) {
    const entry = readTreeEntry(repo, baseRef, cand);
    if (entry.kind === "missing") continue;
    if (entry.kind !== "file") throw new Error(`${cand} ist in der Basis kein regulaeres Blob (${entry.kind})`);
    return { path: `${baseRef}:${cand}`, map: JSON.parse(entry.content) as TierMapInput };
  }
  return null;
}
