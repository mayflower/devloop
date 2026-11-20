// CLI: print the smoke-enabled tiers of a repo (.devloop/config.json -> smoke.tiers) as JSON.
// Usage: smoke-tiers <repoPath>. Missing config/section -> []. Malformed -> exit 1 (fail closed:
// a typo must not silently switch the smoke gate off).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readSmokeTiers } from "../core/smoke.js";

const repo = process.argv[2] ?? ".";
let config: unknown;
try {
  config = JSON.parse(readFileSync(join(repo, ".devloop", "config.json"), "utf8"));
} catch (e) {
  if ((e as NodeJS.ErrnoException).code === "ENOENT") config = undefined;
  else {
    process.stderr.write("smoke-tiers: .devloop/config.json unlesbar; refusing to guess (fail-closed)\n");
    process.exit(1);
  }
}
const tiers = readSmokeTiers(config);
if (tiers === undefined) {
  process.stderr.write("smoke-tiers: smoke.tiers ungültig (erlaubt: T0..T3); refusing to guess (fail-closed)\n");
  process.exit(1);
}
process.stdout.write(JSON.stringify(tiers) + "\n");
