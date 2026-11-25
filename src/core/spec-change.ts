// Spec-Aenderungen brauchen unabhaengig vom Tier eine menschliche Freigabe (REQ-SPECGATE-1..7,
// docs/2026-11-25-spec-pr-freigabe-design.md). Serverseitig durchsetzbar ist nur, was GitHub selbst
// prueft: die CODEOWNERS der BASIS muessen jeden geaenderten Spec-Pfad decken. Dieses Modul
// entscheidet das statisch und fail-closed.

import { execFileSync } from "node:child_process";
import { codeownersCovers, parseCodeowners } from "./codeowners.js";
import { matchesAnyGlob } from "./glob.js";
import { isSpecBranch } from "./unskip.js";

/** Repo-relativer Pfad der (optionalen) Spec-Glob-Liste. */
export const SPEC_GLOBS_PATH = ".devloop/spec-globs.json";
export const DEFAULT_SPEC_GLOBS: readonly string[] = ["**/spec.md"];
/** Reihenfolge, in der GitHub CODEOWNERS sucht; die erste existierende gewinnt. */
export const CODEOWNERS_PATHS: readonly string[] = [".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS"];

export class SpecConfigError extends Error {}

/**
 * Parst den Inhalt von spec-globs.json. Gueltig: nicht-leeres JSON-Array nicht-leerer Strings.
 * Alles andere (kein JSON, kein Array, leeres Array, ungueltiges Element) wirft: fail-closed.
 * Ein leeres Array waere gueltiges JSON, schaltete aber die Pfad-Erkennung ab (REQ-SPECGATE-5).
 */
export function parseSpecGlobs(raw: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new SpecConfigError(`${SPEC_GLOBS_PATH} ist kein gueltiges JSON`);
  }
  if (!Array.isArray(parsed)) throw new SpecConfigError(`${SPEC_GLOBS_PATH} ist kein JSON-Array`);
  if (parsed.length === 0) throw new SpecConfigError(`${SPEC_GLOBS_PATH} ist ein leeres Array`);
  if (!parsed.every((g) => typeof g === "string" && g.length > 0)) {
    throw new SpecConfigError(`${SPEC_GLOBS_PATH} enthaelt ein Element, das kein nicht-leerer String ist`);
  }
  return parsed as string[];
}

/**
 * Spec-Globs aus der BASIS (REQ-SPECGATE-8), nie aus Arbeitsbaum/HEAD: ein PR darf sich seine
 * Spec-Pfade nicht per spec-globs.json aus der Erkennung nehmen. Fehlt baseRef oder die Datei in
 * der Basis -> Default; Inhalt ungueltig -> wirft SpecConfigError; baseRef nicht aufloesbar -> wirft.
 */
export function specGlobs(repo: string, baseRef?: string): string[] {
  if (!baseRef) return [...DEFAULT_SPEC_GLOBS];
  const raw = readBaseFile(repo, baseRef, SPEC_GLOBS_PATH);
  return raw === null ? [...DEFAULT_SPEC_GLOBS] : parseSpecGlobs(raw);
}

export const specPaths = (diffPaths: string[], globs: string[]): string[] =>
  diffPaths.filter((p) => matchesAnyGlob(p, globs));

/** Spec-Aenderung: Head-Branch devloop/spec/* ODER mindestens ein Spec-Pfad im Diff. */
export function isSpecChange(headRef: string | undefined, diffPaths: string[], globs: string[]): boolean {
  return (headRef !== undefined && isSpecBranch(headRef)) || specPaths(diffPaths, globs).length > 0;
}

function git(repo: string, args: string[]): string {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

/**
 * Datei aus dem Basis-Ref per `git show <baseRef>:<pfad>`, nie aus dem Arbeitsbaum. null = der Pfad
 * existiert in der Basis nicht. Ein unaufloesbarer baseRef wirft (fail-closed) und wird nicht mit
 * "Datei fehlt" verwechselt.
 */
export function readBaseFile(repo: string, baseRef: string, path: string): string | null {
  if (baseRef.startsWith("-")) throw new Error(`ungueltiger baseRef: ${baseRef}`);
  try {
    git(repo, ["rev-parse", "--verify", "--quiet", `${baseRef}^{commit}`]);
  } catch {
    throw new Error(`baseRef nicht aufloesbar: ${baseRef}`);
  }
  try {
    return git(repo, ["show", `${baseRef}:${path}`]);
  } catch {
    return null;
  }
}

/** Basis-CODEOWNERS: erste existierende Datei in GitHubs Suchreihenfolge, sonst null. */
export function readBaseCodeowners(repo: string, baseRef: string): string | null {
  for (const p of CODEOWNERS_PATHS) {
    const c = readBaseFile(repo, baseRef, p);
    if (c !== null) return c;
  }
  return null;
}

/** Spec-Pfade, die von keinem Owner-Muster gedeckt sind. null/leer = nichts gedeckt. */
export function uncoveredSpecPaths(paths: string[], ownedPatterns: string[]): string[] {
  return paths.filter((p) => !ownedPatterns.some((pat) => codeownersCovers(p, pat)));
}

/** Komfort: ungedeckte Spec-Pfade gegen rohe CODEOWNERS-Inhalte (null = keine Datei). */
export function uncoveredByCodeowners(paths: string[], codeowners: string | null): string[] {
  return uncoveredSpecPaths(paths, codeowners === null ? [] : parseCodeowners(codeowners));
}
