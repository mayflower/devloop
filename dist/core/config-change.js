// `.devloop/`-Config aus der Basis (Issue #13, docs/2026-11-27-devloop-config-aus-basis-design.md).
// Die Precondition-Action darf die Regeln, nach denen ein PR geprueft wird, nicht aus dem PR-HEAD
// lesen. Dieses Modul liest Config-Listen aus der Basis (`git show`) und erkennt Config-Aenderungen;
// die CODEOWNERS-Deckung der Basis (wie bei Spec-Pfaden, #4) erzwingt das Review.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { matchesAnyGlob } from "./glob.js";
import { readTreeEntry } from "./tree-entry.js";
export const PROTECTED_GLOBS_PATH = ".devloop/protected-globs.json";
export const BOT_LOGINS_PATH = ".devloop/bot-logins.json";
/** Config-Pfade: alles unter `.devloop/` plus die tier-map-Kandidaten ausserhalb davon. */
export const CONFIG_GLOBS = [".devloop/**", "tools/tier-map.json", "tier-map.json"];
export class ConfigInvalidError extends Error {
}
export const configPaths = (diffPaths) => diffPaths.filter((p) => matchesAnyGlob(p, [...CONFIG_GLOBS]));
export const isConfigChange = (diffPaths) => configPaths(diffPaths).length > 0;
function assertRefResolvable(repo, baseRef) {
    if (baseRef.startsWith("-"))
        throw new ConfigInvalidError(`ungueltiger baseRef: ${baseRef}`);
    try {
        execFileSync("git", ["-C", repo, "rev-parse", "--verify", "--quiet", `${baseRef}^{commit}`], {
            stdio: ["ignore", "pipe", "ignore"],
        });
    }
    catch {
        throw new ConfigInvalidError(`baseRef nicht aufloesbar: ${baseRef}`);
    }
}
/**
 * Erstaufnahme: die Basis enthaelt keinen einzigen Config-Pfad (der PR, der devloop einrichtet).
 * Ein unaufloesbarer baseRef wirft (fail-closed), er gilt nie als "leere Basis".
 */
export function isInitialAdoption(repo, baseRef) {
    assertRefResolvable(repo, baseRef);
    let out;
    try {
        out = execFileSync("git", ["-C", repo, "--literal-pathspecs", "ls-tree", "-r", "-z", "--name-only", baseRef, "--", ".devloop", "tools/tier-map.json", "tier-map.json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
    }
    catch (e) {
        throw new ConfigInvalidError(`Basis ${baseRef} nicht lesbar: ${e.message}`);
    }
    return !out.split("\0").some((p) => p !== "" && matchesAnyGlob(p, [...CONFIG_GLOBS]));
}
/** Parst ein JSON-Array von Strings (leeres Array ist gueltig). Sonst ConfigInvalidError. */
export function parseStringArray(raw, label) {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        throw new ConfigInvalidError(`${label} ist kein gueltiges JSON`);
    }
    if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === "string")) {
        throw new ConfigInvalidError(`${label} ist kein JSON-Array von Strings`);
    }
    return parsed;
}
/**
 * Liest eine String-Listen-Config. Rangfolge: (1) Basis, (2) Arbeitsbaum, (3) null (Aufrufer
 * entscheidet, z. B. stdin-Wert). Existiert die Basis-Datei, aber ist unlesbar (kein JSON, falsche
 * Form, kein reguelaeres Blob), wirft sie ConfigInvalidError: kein Rueckfall auf HEAD.
 */
export function readConfigList(repo, baseRef, path) {
    assertRefResolvable(repo, baseRef);
    let entry;
    try {
        entry = readTreeEntry(repo, baseRef, path);
    }
    catch (e) {
        throw new ConfigInvalidError(`${path} in der Basis ${baseRef} nicht lesbar: ${e.message}`);
    }
    if (entry.kind === "file")
        return { list: parseStringArray(entry.content, `${path} (Basis)`), source: "base" };
    if (entry.kind !== "missing") {
        throw new ConfigInvalidError(`${path} in der Basis ${baseRef} ist kein regulaeres Blob (${entry.kind})`);
    }
    let raw;
    try {
        raw = readFileSync(join(repo, path), "utf8");
    }
    catch (e) {
        if (e.code === "ENOENT")
            return null;
        throw new ConfigInvalidError(`${path} im Arbeitsbaum nicht lesbar: ${e.message}`);
    }
    return { list: parseStringArray(raw, `${path} (Arbeitsbaum)`), source: "worktree" };
}
