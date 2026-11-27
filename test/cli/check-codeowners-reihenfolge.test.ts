// Issue #32: Suchreihenfolge .github/CODEOWNERS -> CODEOWNERS -> docs/CODEOWNERS (wie GitHub).
// Nur die erste existierende Datei zaehlt, keine Vereinigung.
import { test, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const cli = resolve(dirname(fileURLToPath(import.meta.url)), "../../dist/cli/check-codeowners.js");

const FULL = `**/migrations/ @db\n**/auth/ @sec\n/services/ @team\n`; // deckt alle T2/T3-Globs
const GAP = `**/migrations/ @db\n**/auth/ @sec\n`; // deckt services/** (T2) nicht
const NOTHING = `/docs/ @writer\n`;

let repo: string;
beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "devloop-coorder-"));
  mkdirSync(join(repo, "tools"), { recursive: true });
  writeFileSync(
    join(repo, "tools/tier-map.json"),
    JSON.stringify({ T3: ["**/migrations/**", "**/auth/**"], T2: ["services/**"], T1: ["**"] }),
  );
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

const put = (rel: string, body: string) => {
  mkdirSync(dirname(join(repo, rel)), { recursive: true });
  writeFileSync(join(repo, rel), body);
};
const run = () => {
  const r = spawnSync("node", [cli, repo], { encoding: "utf8" });
  return { status: r.status, out: JSON.parse(r.stdout || "{}") as { ok?: boolean; codeownersPath?: string; uncovered?: string[] } };
};

test("[REQ-COORDER-2] [REQ-COORDER-1] Root deckt, .github/ hat Luecke: Exit 1, codeownersPath .github/, uncovered nennt services/**", () => {
  put("CODEOWNERS", FULL);
  put(".github/CODEOWNERS", GAP);
  const { status, out } = run();
  expect(status).toBe(1);
  expect(out.codeownersPath).toBe(join(repo, ".github/CODEOWNERS"));
  expect(out.uncovered).toContain("services/**");
});

test("[REQ-COORDER-1] .github/ deckt, Root ohne Deckung: Exit 0, codeownersPath .github/", () => {
  put(".github/CODEOWNERS", FULL);
  put("CODEOWNERS", NOTHING);
  const { status, out } = run();
  expect(status).toBe(0);
  expect(out.ok).toBe(true);
  expect(out.codeownersPath).toBe(join(repo, ".github/CODEOWNERS"));
});

test("[REQ-COORDER-2] .github/ hat Luecke, docs/ deckt: Exit 1 (keine Vereinigung)", () => {
  put(".github/CODEOWNERS", GAP);
  put("docs/CODEOWNERS", FULL);
  const { status, out } = run();
  expect(status).toBe(1);
  expect(out.uncovered).toContain("services/**");
});

test("[REQ-COORDER-2] .github/ hat Luecke, Root und docs/ decken: Exit 1", () => {
  put(".github/CODEOWNERS", GAP);
  put("CODEOWNERS", FULL);
  put("docs/CODEOWNERS", FULL);
  expect(run().status).toBe(1);
});

test("[REQ-COORDER-1] Root deckt, docs/ ohne Deckung, kein .github/: Exit 0, codeownersPath Root", () => {
  put("CODEOWNERS", FULL);
  put("docs/CODEOWNERS", NOTHING);
  const { status, out } = run();
  expect(status).toBe(0);
  expect(out.codeownersPath).toBe(join(repo, "CODEOWNERS"));
});

test("[REQ-COORDER-1] Root hat Luecke, docs/ deckt, kein .github/: Exit 1, codeownersPath Root", () => {
  put("CODEOWNERS", GAP);
  put("docs/CODEOWNERS", FULL);
  const { status, out } = run();
  expect(status).toBe(1);
  expect(out.codeownersPath).toBe(join(repo, "CODEOWNERS"));
});

test("[REQ-COORDER-4] nur Root-CODEOWNERS, deckt: Exit 0", () => {
  put("CODEOWNERS", FULL);
  const { status, out } = run();
  expect(status).toBe(0);
  expect(out.codeownersPath).toBe(join(repo, "CODEOWNERS"));
});

test("[REQ-COORDER-4] nur Root-CODEOWNERS, deckt nicht: Exit 1, uncovered nennt services/**", () => {
  put("CODEOWNERS", GAP);
  const { status, out } = run();
  expect(status).toBe(1);
  expect(out.uncovered).toContain("services/**");
});
