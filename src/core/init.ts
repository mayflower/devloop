// Bootstrap a target repo for devloop (design §0.3): writes the CI binding-anchor workflow
// and a config skeleton in ONE step, so the guardian precondition (incl. the
// precondition-check guardian) becomes satisfiable. Idempotent: never overwrites silently.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface InitResult {
  created: string[];
  skipped: string[];
}

// Project-agnostic skeletons — the adopter tunes them in their constitution/CI.
const PROTECTED_GLOBS_SKELETON = JSON.stringify(
  ["**/stryker.conf.*", "**/.semgrep/**", "**/constitution.md", "**/CODEOWNERS", "**/*.eslintrc*"],
  null,
  2,
);

// Anchor (b): identities that are NOT human (the agent's bot/app account). A review by any
// of these never counts as a human approval. The adopter fills in their agent's login(s).
const BOT_LOGINS_SKELETON = JSON.stringify(["devloop-agent[bot]"], null, 2);

const TIER_MAP_SKELETON = JSON.stringify(
  {
    rules: [
      { tier: "T3", anyOf: ["**/migrations/**", "**/auth/**", "**/payment/**"] },
      { tier: "T2", anyOf: ["src/**"] },
      { tier: "T1", anyOf: ["**/*.md", "docs/**"] },
    ],
    default: "T3",
  },
  null,
  2,
);

export function initRepo(targetRepo: string, ciTemplate: string): InitResult {
  const result: InitResult = { created: [], skipped: [] };

  const writeIfAbsent = (relPath: string, content: string): void => {
    const abs = join(targetRepo, relPath);
    if (existsSync(abs)) {
      result.skipped.push(relPath);
      return;
    }
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
    result.created.push(relPath);
  };

  writeIfAbsent(".github/workflows/devloop-precondition-check.yml", ciTemplate);
  writeIfAbsent(".devloop/protected-globs.json", PROTECTED_GLOBS_SKELETON + "\n");
  writeIfAbsent(".devloop/tier-map.json", TIER_MAP_SKELETON + "\n");
  writeIfAbsent(".devloop/bot-logins.json", BOT_LOGINS_SKELETON + "\n");

  return result;
}
