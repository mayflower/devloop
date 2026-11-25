import { test, expect, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  parseSpecGlobs,
  specGlobs,
  isSpecChange,
  specPaths,
  readBaseCodeowners,
  uncoveredSpecPaths,
  uncoveredByCodeowners,
} from "../../src/core/spec-change.js";

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});
const sh = (repo: string, ...a: string[]) => {
  const r = spawnSync("git", ["-c", "commit.gpgsign=false", ...a], { cwd: repo, encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
};
function repoWith(files: Record<string, string>): string {
  const repo = mkdtempSync(join(tmpdir(), "spec-change-"));
  dirs.push(repo);
  sh(repo, "init", "-q", "-b", "base");
  sh(repo, "config", "user.name", "T");
  sh(repo, "config", "user.email", "t@example.invalid");
  files["README.md"] = "x\n";
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, p)), { recursive: true });
    writeFileSync(join(repo, p), c);
  }
  sh(repo, "add", "-A");
  sh(repo, "commit", "-q", "-m", "base");
  return repo;
}

test("parseSpecGlobs: gueltig = nicht-leeres Array nicht-leerer Strings", () => {
  expect(parseSpecGlobs('["a/*.md","b"]')).toEqual(["a/*.md", "b"]);
});

test("parseSpecGlobs: kaputt, kein Array, leer, leerer String, Nicht-String -> wirft", () => {
  for (const raw of ["[nope", "{}", '"x"', "null", "[]", '[""]', "[1]", '["a",null]']) {
    expect(() => parseSpecGlobs(raw), raw).toThrow();
  }
});

test("specGlobs: liest die BASIS; Datei fehlt in Basis oder baseRef fehlt -> Default; ungueltiger Basis-Inhalt -> wirft", () => {
  expect(specGlobs(repoWith({}), "base")).toEqual(["**/spec.md"]);
  expect(specGlobs(repoWith({ ".devloop/spec-globs.json": '["x/*.md"]' }), "base")).toEqual(["x/*.md"]);
  expect(specGlobs(repoWith({ ".devloop/spec-globs.json": '["x/*.md"]' }))).toEqual(["**/spec.md"]); // kein baseRef
  expect(() => specGlobs(repoWith({ ".devloop/spec-globs.json": "[]" }), "base")).toThrow();
  expect(() => specGlobs(repoWith({}), "nope")).toThrow(); // unaufloesbarer Ref != Datei fehlt
});

test("specGlobs: Arbeitsbaum zaehlt nicht (weder neue noch geloeschte Datei)", () => {
  const r = repoWith({ ".devloop/spec-globs.json": '["x/*.md"]' });
  writeFileSync(join(r, ".devloop/spec-globs.json"), '["nomatch/**"]');
  expect(specGlobs(r, "base")).toEqual(["x/*.md"]);
  const r2 = repoWith({});
  mkdirSync(join(r2, ".devloop"), { recursive: true });
  writeFileSync(join(r2, ".devloop/spec-globs.json"), "{}"); // kaputt, aber nur im Arbeitsbaum
  expect(specGlobs(r2, "base")).toEqual(["**/spec.md"]);
});

test("isSpecChange: Branch ODER Pfad", () => {
  const g = ["**/spec.md"];
  expect(isSpecChange("devloop/spec/x", ["src/a.ts"], g)).toBe(true);
  expect(isSpecChange("feature/y", ["specs/x/spec.md"], g)).toBe(true);
  expect(isSpecChange("spec.md", ["spec.md"], g)).toBe(true); // Root-Level
  expect(isSpecChange("feature/y", ["src/a.ts"], g)).toBe(false);
  expect(isSpecChange(undefined, ["src/a.ts"], g)).toBe(false);
  expect(specPaths(["specs/x/spec.md", "src/a.ts"], g)).toEqual(["specs/x/spec.md"]);
});

test("readBaseCodeowners: Reihenfolge, erste existierende gewinnt; keine -> null", () => {
  const r = repoWith({ CODEOWNERS: "/a/ @x\n", ".github/CODEOWNERS": "/b/ @x\n", "docs/CODEOWNERS": "/d/ @x\n" });
  expect(readBaseCodeowners(r, "base")).toBe("/b/ @x\n"); // .github/ vor Root vor docs/
  expect(readBaseCodeowners(repoWith({ CODEOWNERS: "/a/ @x\n", "docs/CODEOWNERS": "/d/ @x\n" }), "base")).toBe("/a/ @x\n");
  expect(readBaseCodeowners(repoWith({ "docs/CODEOWNERS": "/c/ @x\n" }), "base")).toBe("/c/ @x\n");
  expect(readBaseCodeowners(repoWith({}), "base")).toBeNull();
});

test("readBaseCodeowners: liest die Basis, nicht den Arbeitsbaum; unaufloesbarer Ref wirft", () => {
  const r = repoWith({ CODEOWNERS: "/a/ @x\n" });
  writeFileSync(join(r, "CODEOWNERS"), "/specs/ @evil\n");
  expect(readBaseCodeowners(r, "base")).toBe("/a/ @x\n");
  expect(() => readBaseCodeowners(r, "nope")).toThrow();
  expect(() => readBaseCodeowners(r, "--output=x")).toThrow();
});

test("uncoveredSpecPaths / uncoveredByCodeowners", () => {
  expect(uncoveredSpecPaths(["specs/a/spec.md", "docs/b/spec.md"], ["/specs/"])).toEqual(["docs/b/spec.md"]);
  expect(uncoveredSpecPaths(["x/spec.md"], ["*"])).toEqual([]);
  expect(uncoveredByCodeowners(["specs/a/spec.md"], null)).toEqual(["specs/a/spec.md"]);
  expect(uncoveredByCodeowners(["specs/a/spec.md"], "# c\n/specs/ @alice\n")).toEqual([]);
  expect(uncoveredByCodeowners(["specs/a/spec.md"], "/specs/\n")).toEqual(["specs/a/spec.md"]); // ohne Owner
});
