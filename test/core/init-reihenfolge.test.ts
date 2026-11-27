// Issue #32: init verwendet die wirksame CODEOWNERS (.github/ -> Root -> docs/) fuer skipped und notes.
import { test, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { initRepo } from "../../src/core/init.js";

const TEMPLATE = "name: devloop-precondition-check\n# ...\n";
const COVERS = "/services/ @team\n/.devloop/ @team\n/tools/tier-map.json @team\n";
const GAP = "/docs/ @writer\n";

let repo: string;
beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "devloop-init-order-"));
  mkdirSync(join(repo, "tools"), { recursive: true });
  writeFileSync(join(repo, "tools/tier-map.json"), JSON.stringify({ T2: ["services/**"], T1: ["**"] }));
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

const put = (rel: string, body: string) => {
  mkdirSync(dirname(join(repo, rel)), { recursive: true });
  writeFileSync(join(repo, rel), body);
};

test("[REQ-COORDER-3] Root deckt, .github/ hat Luecke: skipped nennt .github/CODEOWNERS, notes melden die Luecke dieser Datei", () => {
  put("CODEOWNERS", COVERS);
  put(".github/CODEOWNERS", GAP);
  const r = initRepo(repo, TEMPLATE);
  expect(r.skipped).toContain(".github/CODEOWNERS");
  expect(r.skipped).not.toContain("CODEOWNERS");
  expect(r.notes.some((n) => n.includes("(.github/CODEOWNERS)") && /services/.test(n))).toBe(true);
  expect(readFileSync(join(repo, ".github/CODEOWNERS"), "utf8")).toBe(GAP);
  expect(readFileSync(join(repo, "CODEOWNERS"), "utf8")).toBe(COVERS);
});

test("[REQ-COORDER-3] .github/ deckt, Root hat Luecke: keine Luecken-Notes zu services oder .devloop (keine Vereinigung/Root-Lesung)", () => {
  put(".github/CODEOWNERS", COVERS);
  put("CODEOWNERS", GAP);
  const r = initRepo(repo, TEMPLATE);
  expect(r.skipped).toContain(".github/CODEOWNERS");
  expect(r.notes.some((n) => /CODEOWNERS \(/.test(n) && /does not cover/.test(n))).toBe(false);
});

test("[REQ-COORDER-3] Root hat Luecke, docs/ deckt, kein .github/: skipped Root, Luecke gemeldet", () => {
  put("CODEOWNERS", GAP);
  put("docs/CODEOWNERS", COVERS);
  const r = initRepo(repo, TEMPLATE);
  expect(r.skipped).toContain("CODEOWNERS");
  expect(r.skipped).not.toContain("docs/CODEOWNERS");
  expect(r.notes.some((n) => n.includes("(CODEOWNERS)") && /services/.test(n))).toBe(true);
});

test("[REQ-COORDER-4] nur Root-CODEOWNERS: skipped CODEOWNERS, keine neue .github/CODEOWNERS", () => {
  put("CODEOWNERS", GAP);
  const r = initRepo(repo, TEMPLATE);
  expect(r.skipped).toContain("CODEOWNERS");
  expect(r.created).not.toContain(".github/CODEOWNERS");
  expect(existsSync(join(repo, ".github/CODEOWNERS"))).toBe(false);
  expect(readFileSync(join(repo, "CODEOWNERS"), "utf8")).toBe(GAP);
});
