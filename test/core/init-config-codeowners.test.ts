// [REQ-CFGBASE-8] init deckt /.devloop/ in der CODEOWNERS ab bzw. meldet die Luecke.
import { test, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initRepo } from "../../src/core/init.js";

const TEMPLATE = "name: devloop-precondition-check\n# ...\n";

let repo: string;
beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "devloop-init-cfg-"));
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

const lines = (s: string) => s.split("\n").map((l) => l.trim());

test("[REQ-CFGBASE-8] init ohne CODEOWNERS: angelegte Datei enthaelt /.devloop/ mit Platzhalter-Owner", () => {
  initRepo(repo, TEMPLATE);
  const co = readFileSync(join(repo, ".github/CODEOWNERS"), "utf8");
  expect(lines(co)).toContain("/.devloop/ @OWNER");
});

test("[REQ-CFGBASE-8] init ohne CODEOWNERS, tier-map unter tools/: /tools/tier-map.json und /.devloop/ eingetragen", () => {
  mkdirSync(join(repo, "tools"), { recursive: true });
  writeFileSync(join(repo, "tools/tier-map.json"), JSON.stringify({ T3: ["services/**"], T1: ["**"] }));
  initRepo(repo, TEMPLATE);
  const co = lines(readFileSync(join(repo, ".github/CODEOWNERS"), "utf8"));
  expect(co).toContain("/.devloop/ @OWNER");
  expect(co).toContain("/tools/tier-map.json @OWNER");
});

test("[REQ-CFGBASE-8] init mit CODEOWNERS ohne /.devloop/: Datei unveraendert, Hinweis in notes nennt .devloop", () => {
  mkdirSync(join(repo, ".github"), { recursive: true });
  writeFileSync(join(repo, ".github/CODEOWNERS"), "/docs/ @writer\n");
  const r = initRepo(repo, TEMPLATE);
  expect(readFileSync(join(repo, ".github/CODEOWNERS"), "utf8")).toBe("/docs/ @writer\n");
  expect(r.notes.some((n) => /CODEOWNERS/.test(n) && /\.devloop\//.test(n) && /not cover|deck|uncovered/i.test(n))).toBe(true);
});

test("[REQ-CFGBASE-8] Gegenprobe: CODEOWNERS deckt /.devloop/ bereits -> kein Hinweis zu .devloop in den CODEOWNERS-notes", () => {
  mkdirSync(join(repo, ".github"), { recursive: true });
  writeFileSync(join(repo, ".github/CODEOWNERS"), "/.devloop/ @writer\n");
  const r = initRepo(repo, TEMPLATE);
  expect(r.notes.some((n) => /CODEOWNERS/.test(n) && /\.devloop\/?(\s|,|\)|$)/.test(n) && !/managed-tests/.test(n))).toBe(false);
});

test("[REQ-CFGBASE-8] init mit CODEOWNERS ohne Deckung der tier-map unter tools/: Hinweis nennt tools/tier-map.json", () => {
  mkdirSync(join(repo, "tools"), { recursive: true });
  writeFileSync(join(repo, "tools/tier-map.json"), JSON.stringify({ T1: ["**"] }));
  mkdirSync(join(repo, ".github"), { recursive: true });
  writeFileSync(join(repo, ".github/CODEOWNERS"), "/.devloop/ @writer\n");
  const r = initRepo(repo, TEMPLATE);
  expect(r.notes.some((n) => /CODEOWNERS/.test(n) && /tools\/tier-map\.json/.test(n))).toBe(true);
});
