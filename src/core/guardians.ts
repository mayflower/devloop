// Guardian precondition (the built-in safety, design §5): the autonomous back-edge
// loop may run ONLY where the non-corruptible guardians stand. checkGuardians inspects
// the TARGET repo (project-agnostic) and reports which guardians are absent.
//
// v0 detection contract — kept deliberately minimal and CALIBRATED against real Obol
// during the Erprobung phase (design §0.1/§5: "measured, not set freehand"). The signals
// here are presence checks of each guardian's primary artifact; tighten per Obol later.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export type GuardianId =
  | "mutation-ratchet"
  | "semgrep-escape-hatch"
  | "protected-set"
  | "precondition-check";

export interface GuardianResult {
  ok: boolean;
  missing: GuardianId[];
}

// Stable order so callers/tests get deterministic output.
const ALL: GuardianId[] = [
  "mutation-ratchet",
  "semgrep-escape-hatch",
  "protected-set",
  "precondition-check",
];

const fileExists = (p: string): boolean => existsSync(p) && statSync(p).isFile();
const dirHasEntries = (p: string): boolean =>
  existsSync(p) && statSync(p).isDirectory() && readdirSync(p).length > 0;

function hasMutationRatchet(repo: string): boolean {
  const names = [
    "stryker.conf.json",
    "stryker.conf.js",
    "stryker.conf.mjs",
    "stryker.conf.cjs",
    "stryker.config.json",
    "stryker.config.js",
    "stryker.config.mjs",
    "stryker.config.cjs",
    "stryker.config.ts",
  ];
  return names.some((n) => fileExists(join(repo, n)));
}

function hasSemgrepEscapeHatch(repo: string): boolean {
  if (dirHasEntries(join(repo, ".semgrep"))) return true;
  return ["semgrep.yml", "semgrep.yaml", ".semgrep.yml", ".semgrep.yaml"].some((n) =>
    fileExists(join(repo, n)),
  );
}

function hasProtectedSet(repo: string): boolean {
  return ["CODEOWNERS", join(".github", "CODEOWNERS"), join("docs", "CODEOWNERS")].some((n) =>
    fileExists(join(repo, n)),
  );
}

function hasPreconditionCheck(repo: string): boolean {
  const dir = join(repo, ".github", "workflows");
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return false;
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .some((f) => readFileSync(join(dir, f), "utf8").includes("devloop-precondition-check"));
}

const DETECTORS: Record<GuardianId, (repo: string) => boolean> = {
  "mutation-ratchet": hasMutationRatchet,
  "semgrep-escape-hatch": hasSemgrepEscapeHatch,
  "protected-set": hasProtectedSet,
  "precondition-check": hasPreconditionCheck,
};

export function checkGuardians(repoPath: string): GuardianResult {
  const missing = ALL.filter((g) => !DETECTORS[g](repoPath));
  return { ok: missing.length === 0, missing };
}
