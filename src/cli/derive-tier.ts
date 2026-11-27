// CLI: deterministic tier derivation. Reads JSON on stdin, writes {tier, tierMapPath?}.
// Two input modes:
//   - { touched, tierMap }        — caller supplies the map content (no path resolution)
//   - { touched, repo }           — devloop LOCATES the repo's tier-map robustly (absolute
//                                   path: .devloop/ -> tools/ -> root) and reads it itself.
//   - { touched, repo, baseRef }  — wie oben, aber die Suche laeuft in der BASIS (`git show`):
//                                   ein PR waehlt seine tier-map nicht selbst (Issue #13). Hat die
//                                   Basis keinen Kandidaten, gilt der erste Kandidat im Arbeitsbaum.
// Always plain node (sandbox-clean) — never a repo's tsx-based `pnpm run tier`.

import { readFileSync } from "node:fs";
import { deriveTier, type TierMapInput } from "../core/tier.js";
import { resolveTierMapPath, TIER_MAP_CANDIDATES } from "../core/tier-map.js";
import { readTreeEntry } from "../core/tree-entry.js";
import { readStdin } from "./_stdin.js";

interface Request {
  touched: string[];
  repo?: string;
  baseRef?: string;
  tierMap?: TierMapInput;
}

const req = JSON.parse(await readStdin()) as Request;

let tierMap = req.tierMap;
let tierMapPath: string | undefined;

if (!tierMap) {
  if (!req.repo) {
    process.stderr.write("derive-tier: provide either `tierMap` or `repo` on stdin\n");
    process.exit(2);
  }
  let fromBase = false;
  if (req.baseRef) {
    try {
      for (const cand of TIER_MAP_CANDIDATES) {
        const entry = readTreeEntry(req.repo, req.baseRef, cand);
        if (entry.kind === "missing") continue;
        if (entry.kind !== "file") throw new Error(`${cand} ist in der Basis kein regulaeres Blob (${entry.kind})`);
        tierMap = JSON.parse(entry.content) as TierMapInput;
        tierMapPath = `${req.baseRef}:${cand}`;
        fromBase = true;
        break;
      }
    } catch (e) {
      process.stderr.write(`derive-tier: tier-map der Basis ${req.baseRef} unlesbar: ${(e as Error).message}\n`);
      process.exit(1);
    }
  }
  if (!fromBase) {
    const found = resolveTierMapPath(req.repo);
    if (!found) {
      process.stderr.write(
        `derive-tier: no tier-map found under ${req.repo} (.devloop/ , tools/ , or root)\n`,
      );
      process.exit(2);
    }
    tierMapPath = found;
    tierMap = JSON.parse(readFileSync(found, "utf8")) as TierMapInput;
  }
}

process.stdout.write(
  JSON.stringify({ tier: deriveTier(req.touched, tierMap as TierMapInput), tierMapPath }) + "\n",
);
