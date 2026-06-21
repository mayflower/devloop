// CLI: which REQs changed between two spec.md versions -> {added, changed, removed}. spec-to-tests
// uses it to amend exactly the affected tests on a spec change (surgical re-derivation).
// Usage: req-delta <oldSpecPath> <newSpecPath>   (oldSpecPath may be absent -> treated as empty).

import { readFileSync } from "node:fs";
import { reqDelta } from "../core/req-delta.js";

const [, , oldPath, newPath] = process.argv;
if (!newPath) {
  process.stderr.write("usage: req-delta <oldSpecPath> <newSpecPath>\n");
  process.exit(64);
}
const readOr = (p: string | undefined, fallback: string): string => {
  try {
    return p ? readFileSync(p, "utf8") : fallback;
  } catch {
    return fallback;
  }
};
process.stdout.write(
  JSON.stringify(reqDelta(readOr(oldPath, ""), readOr(newPath, "")), null, 2) + "\n",
);
