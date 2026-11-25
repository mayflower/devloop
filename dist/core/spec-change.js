// Spec-Aenderungen brauchen unabhaengig vom Tier eine menschliche Freigabe (REQ-SPECGATE-1..7,
// docs/2026-11-25-spec-pr-freigabe-design.md). Serverseitig durchsetzbar ist nur, was GitHub selbst
// prueft: die CODEOWNERS der BASIS muessen jeden geaenderten Spec-Pfad decken. Dieses Modul
// entscheidet das statisch und fail-closed.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { codeownersCovers, parseCodeowners } from "./codeowners.js";
import { matchesAnyGlob } from "./glob.js";
import { isSpecBranch } from "./unskip.js";
/** Repo-relativer Pfad der (optionalen) Spec-Glob-Liste. */
export const SPEC_GLOBS_PATH = ".devloop/spec-globs.json";
export const DEFAULT_SPEC_GLOBS = ["**/spec.md"];
/** Reihenfolge, in der GitHub CODEOWNERS sucht; die erste existierende gewinnt. */
export const CODEOWNERS_PATHS = ["CODEOWNERS", ".github/CODEOWNERS", "docs/CODEOWNERS"];
export class SpecConfigError extends Error {
}
/**
 * Parst den Inhalt von spec-globs.json. Gueltig: nicht-leeres JSON-Array nicht-leerer Strings.
 * Alles andere (kein JSON, kein Array, leeres Array, ungueltiges Element) wirft: fail-closed.
 * Ein leeres Array waere gueltiges JSON, schaltete aber die Pfad-Erkennung ab (REQ-SPECGATE-5).
 */
export function parseSpecGlobs(raw) {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        throw new SpecConfigError(`${SPEC_GLOBS_PATH} ist kein gueltiges JSON`);
    }
    if (!Array.isArray(parsed))
        throw new SpecConfigError(`${SPEC_GLOBS_PATH} ist kein JSON-Array`);
    if (parsed.length === 0)
        throw new SpecConfigError(`${SPEC_GLOBS_PATH} ist ein leeres Array`);
    if (!parsed.every((g) => typeof g === "string" && g.length > 0)) {
        throw new SpecConfigError(`${SPEC_GLOBS_PATH} enthaelt ein Element, das kein nicht-leerer String ist`);
    }
    return parsed;
}
/** Spec-Globs des Repos: Datei fehlt -> Default; Datei vorhanden aber ungueltig -> wirft. */
export function specGlobs(repo) {
    let raw;
    try {
        raw = readFileSync(join(repo, SPEC_GLOBS_PATH), "utf8");
    }
    catch (e) {
        if (e.code === "ENOENT")
            return [...DEFAULT_SPEC_GLOBS];
        throw new SpecConfigError(`${SPEC_GLOBS_PATH} nicht lesbar`);
    }
    return parseSpecGlobs(raw);
}
export const specPaths = (diffPaths, globs) => diffPaths.filter((p) => matchesAnyGlob(p, globs));
/** Spec-Aenderung: Head-Branch devloop/spec/* ODER mindestens ein Spec-Pfad im Diff. */
export function isSpecChange(headRef, diffPaths, globs) {
    return (headRef !== undefined && isSpecBranch(headRef)) || specPaths(diffPaths, globs).length > 0;
}
function git(repo, args) {
    return execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}
/**
 * Basis-CODEOWNERS per `git show <baseRef>:<pfad>`, nie aus dem Arbeitsbaum. Liefert den Inhalt der
 * ersten existierenden Datei oder null (keine CODEOWNERS in der Basis). Ein unaufloesbarer baseRef
 * wirft (fail-closed), statt als "keine CODEOWNERS" durchzugehen.
 */
export function readBaseCodeowners(repo, baseRef) {
    if (baseRef.startsWith("-"))
        throw new Error(`ungueltiger baseRef: ${baseRef}`);
    try {
        git(repo, ["rev-parse", "--verify", "--quiet", `${baseRef}^{commit}`]);
    }
    catch {
        throw new Error(`baseRef nicht aufloesbar: ${baseRef}`);
    }
    for (const p of CODEOWNERS_PATHS) {
        try {
            return git(repo, ["show", `${baseRef}:${p}`]);
        }
        catch {
            /* Datei existiert in der Basis nicht -> naechste */
        }
    }
    return null;
}
/** Spec-Pfade, die von keinem Owner-Muster gedeckt sind. null/leer = nichts gedeckt. */
export function uncoveredSpecPaths(paths, ownedPatterns) {
    return paths.filter((p) => !ownedPatterns.some((pat) => codeownersCovers(p, pat)));
}
/** Komfort: ungedeckte Spec-Pfade gegen rohe CODEOWNERS-Inhalte (null = keine Datei). */
export function uncoveredByCodeowners(paths, codeowners) {
    return uncoveredSpecPaths(paths, codeowners === null ? [] : parseCodeowners(codeowners));
}
