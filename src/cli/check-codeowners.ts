// CLI: §9 drift guard — every T2/T3 path in the tier-map must be covered by CODEOWNERS, because
// under the chosen model the T2/T3 merge gate IS branch protection's required CODEOWNER review.
// If a T2/T3 path has no CODEOWNERS coverage (or there is no CODEOWNERS at all), a T2/T3 PR could
// auto-merge unreviewed -> fail closed. Wire as a required check.
//
// Usage: check-codeowners <repoPath>   (defaults to cwd)

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tierGlobs, type TierMapInput } from "../core/tier.js";
import { resolveTierMapPath } from "../core/tier-map.js";
import { parseCodeowners, findUncoveredTierGlobs } from "../core/codeowners.js";

const repo = process.argv[2] ?? ".";

const mapPath = resolveTierMapPath(repo);
if (!mapPath) {
  process.stderr.write(`check-codeowners: no tier-map found under ${repo}\n`);
  process.exit(2);
}
const globs = tierGlobs(JSON.parse(readFileSync(mapPath, "utf8")) as TierMapInput, ["T2", "T3"]);

const coPath = ["CODEOWNERS", ".github/CODEOWNERS", "docs/CODEOWNERS"]
  .map((p) => join(repo, p))
  .find((p) => existsSync(p));

const owned = coPath ? parseCodeowners(readFileSync(coPath, "utf8")) : [];
const uncovered = findUncoveredTierGlobs(globs, owned);
const ok = coPath !== undefined && uncovered.length === 0;

process.stdout.write(
  JSON.stringify(
    {
      ok,
      codeownersPath: coPath ?? null,
      uncovered,
      reason: ok
        ? undefined
        : !coPath
          ? "no CODEOWNERS file — T2/T3 paths are unguarded"
          : "tier-map T2/T3 paths not covered by CODEOWNERS (a T2/T3 PR could auto-merge unreviewed)",
    },
    null,
    2,
  ) + "\n",
);
process.exit(ok ? 0 : 1);
