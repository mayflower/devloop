// CLI: deterministic tier derivation. Reads JSON on stdin, writes {tier, tierMapPath?}.
// Two input modes:
//   - { touched, tierMap }        — caller supplies the map content (no path resolution)
//   - { touched, repo }           — devloop LOCATES the repo's tier-map robustly (absolute
//                                   path: .devloop/ -> tools/ -> root) and reads it itself.
// Always plain node (sandbox-clean) — never a repo's tsx-based `pnpm run tier`.

import { readFileSync } from "node:fs";
import { deriveTier, type TierMapInput } from "../core/tier.js";
import { resolveTierMapPath } from "../core/tier-map.js";
import { readStdin } from "./_stdin.js";

interface Request {
  touched: string[];
  repo?: string;
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

process.stdout.write(
  JSON.stringify({ tier: deriveTier(req.touched, tierMap), tierMapPath }) + "\n",
);
