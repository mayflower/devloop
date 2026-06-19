// "Agent changes the gate instead of the code" = alarm (design §5#3 / §10 duty 3).
// If a proposed diff touches the protected set (gate config / thresholds / semgrep rules /
// constitution), that is a reward-hacking signal, not progress. The protected globs come
// from the target repo (e.g. CODEOWNERS-covered paths) — project-agnostic.

import { matchesAnyGlob } from "./glob.js";

export function touchesProtectedSet(diffPaths: string[], protectedGlobs: string[]): boolean {
  return diffPaths.some((p) => matchesAnyGlob(p, protectedGlobs));
}
