// Guardian precondition (the built-in safety, design §5): the autonomous back-edge
// loop may run ONLY where the non-corruptible guardians stand. checkGuardians inspects
// the TARGET repo (project-agnostic) and reports which guardians are absent.
//
// v0 detection contract — kept deliberately minimal and CALIBRATED against real Obol
// during the Erprobung phase (design §0.1/§5: "measured, not set freehand"). The signals
// here are presence checks of each guardian's primary artifact; tighten per Obol later.

import { type Dirent, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
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

const STRYKER_CONFIG_NAMES = new Set([
  "stryker.conf.json",
  "stryker.conf.js",
  "stryker.conf.mjs",
  "stryker.conf.cjs",
  "stryker.config.json",
  "stryker.config.js",
  "stryker.config.mjs",
  "stryker.config.cjs",
  "stryker.config.ts",
]);

// Dirs never worth descending into for a config file — keeps the monorepo scan cheap and
// avoids false positives from vendored/generated trees.
const SCAN_SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".stryker-tmp",
]);

// The mutation ratchet lives at the repo root in a single-package repo, but PER-SERVICE in a
// monorepo (e.g. services/<svc>/api/stryker.config.json — the bsk pilot layout). A root-only
// check was a systematic false negative there (forcing guardian overrides). Do a bounded,
// node_modules-skipping scan so a monorepo that has adopted the ratchet for at least one package
// registers — the coarse repo-level "the guardian stands" signal, consistent with the other
// detectors. Hidden dirs are skipped (configs never live in .git/.github/.claude worktrees).
function hasStrykerConfig(dir: string, depth: number): boolean {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return false; // unreadable dir (perms/race) — treat as absent, never throw
  }
  for (const e of entries) {
    if (e.isFile() && STRYKER_CONFIG_NAMES.has(e.name)) return true;
  }
  if (depth <= 0) return false;
  for (const e of entries) {
    if (e.isDirectory() && !e.name.startsWith(".") && !SCAN_SKIP_DIRS.has(e.name)) {
      if (hasStrykerConfig(join(dir, e.name), depth - 1)) return true;
    }
  }
  return false;
}

function hasMutationRatchet(repo: string): boolean {
  // depth 3 reaches services/<svc>/api/ and packages/<pkg>/ monorepo layouts.
  return hasStrykerConfig(repo, 3);
}

// Does any CI workflow reference `needle` (i.e. actually run that guard)?
export function workflowReferences(repo: string, needle: string): boolean {
  const dir = join(repo, ".github", "workflows");
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return false;
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .some((f) => readFileSync(join(dir, f), "utf8").includes(needle));
}

function hasSemgrepEscapeHatch(repo: string): boolean {
  if (dirHasEntries(join(repo, ".semgrep"))) return true;
  const configNames = [
    "semgrep.yml",
    "semgrep.yaml",
    ".semgrep.yml",
    ".semgrep.yaml",
    // Calibrated against Obol: the escape-hatch config can live under tools/.
    "tools/semgrep-escape-hatches.yml",
    "tools/semgrep.yml",
    "tools/semgrep.yaml",
  ];
  if (configNames.some((n) => fileExists(join(repo, n)))) return true;
  // Strongest signal: a workflow actually runs semgrep.
  return workflowReferences(repo, "semgrep");
}

function hasProtectedSet(repo: string): boolean {
  return ["CODEOWNERS", join(".github", "CODEOWNERS"), join("docs", "CODEOWNERS")].some((n) =>
    fileExists(join(repo, n)),
  );
}

function hasPreconditionCheck(repo: string): boolean {
  return workflowReferences(repo, "devloop-precondition-check");
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
