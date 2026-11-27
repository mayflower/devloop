// [REQ-COBASE-*] CODEOWNERS-Deckung gegen die Basis (#14). CLI-Tests gegen dist/ in temporaeren
// Git-Repos mit echter Basis (Branch "base", echtes `git show`). Keine Attrappen.
import { test, expect, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const verifyCli = join(root, "dist/cli/verify-review.js");
const checkCli = join(root, "dist/cli/check-codeowners.js");

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function git(repo: string, ...args: string[]): void {
  const r = spawnSync("git", ["-c", "commit.gpgsign=false", ...args], { cwd: repo, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
}

function write(repo: string, rel: string, content: string): void {
  const p = join(repo, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
}

const T2_MAP = JSON.stringify({ T2: ["services/**"], T1: ["**"] });
const DEFAULT_CONFIG: Record<string, string | null> = {
  ".devloop/tier-map.json": T2_MAP,
  ".devloop/bot-logins.json": '["agent-bot"]',
  ".devloop/protected-globs.json": '["**/stryker.conf.*"]',
  // deckt die Config, aber NICHT services/**
  CODEOWNERS: "/.devloop/ @alice\n",
};

// Basis-Commit auf Branch "base". Standard: komplette Config (keine Erstaufnahme). null entfernt Eintraege.
function makeRepo(files: Record<string, string | null> = {}, withDefaults = true): string {
  const repo = mkdtempSync(join(tmpdir(), "codeowners-aus-basis-"));
  dirs.push(repo);
  git(repo, "init", "-q", "-b", "base");
  git(repo, "config", "user.name", "Test");
  git(repo, "config", "user.email", "test@example.invalid");
  write(repo, "README.md", "x\n");
  const all = { ...(withDefaults ? DEFAULT_CONFIG : {}), ...files };
  for (const [p, c] of Object.entries(all)) if (c !== null) write(repo, p, c);
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "base");
  return repo;
}

function branchWith(repo: string, files: Record<string, string | null>): void {
  git(repo, "checkout", "-q", "-b", "feature");
  for (const [p, c] of Object.entries(files)) {
    if (c === null) git(repo, "rm", "-q", p);
    else write(repo, p, c);
  }
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "pr");
}

const baseReq = { prAuthor: "agent-bot", headSha: "abc123", tier: "T2", baseRef: "base", headRef: "feature/y", reviews: [] };

function run(repo: string, req: object) {
  const r = spawnSync("node", [verifyCli], {
    encoding: "utf8",
    input: JSON.stringify({ ...baseReq, repo, ...req }),
    cwd: root,
  });
  let out: any = {};
  try {
    out = JSON.parse(r.stdout);
  } catch {
    /* leer lassen: Assertions auf ok scheitern mit klarem Diff */
  }
  return { status: r.status, out, stdout: r.stdout };
}

const aliceOk = { user: "alice", state: "APPROVED", commit_id: "abc123" };
const svc = ["services/a.ts"];
const SELF_COVER = "/.devloop/ @alice\n/services/ @mallory\n";
const COVER_ALL = "/.devloop/ @alice\n/services/ @alice\n";

// ---------- REQ-COBASE-1 / REQ-COBASE-2 ----------

test("[REQ-COBASE-1][REQ-COBASE-2] Basis deckt services/** nicht, PR traegt Deckung in HEAD-CODEOWNERS ein -> codeowners-unguarded mit Pfad", () => {
  const repo = makeRepo();
  branchWith(repo, { CODEOWNERS: SELF_COVER, "services/a.ts": "x\n" });
  const r = run(repo, { diffPaths: ["CODEOWNERS", ...svc] });
  expect(r.status).toBe(1);
  expect(r.out.ok).toBe(false);
  expect(r.out.reason).toMatch(/^codeowners-unguarded:/);
  expect(r.out.reason).toContain("services/a.ts");
});

test("[REQ-COBASE-2] auch ein uncommitteter Arbeitsbaum mit Deckung zaehlt nicht (nur Basis)", () => {
  const repo = makeRepo();
  branchWith(repo, { "services/a.ts": "x\n" });
  write(repo, "CODEOWNERS", SELF_COVER);
  write(repo, ".github/CODEOWNERS", SELF_COVER);
  const r = run(repo, { diffPaths: svc });
  expect(r.status).toBe(1);
  expect(r.out.reason).toMatch(/^codeowners-unguarded:/);
});

test("[REQ-COBASE-1] Gegenprobe: Basis deckt services/**, keine Reviews -> weiter zu Tier/Approval (pending, nicht codeowners-unguarded)", () => {
  const repo = makeRepo({ CODEOWNERS: COVER_ALL });
  branchWith(repo, { "services/a.ts": "x\n" });
  const r = run(repo, { diffPaths: svc });
  expect(r.status).toBe(0);
  expect(r.out.ok).toBe(true);
  expect(r.out.pending).toBe(true);
  expect(r.stdout).not.toMatch(/codeowners-unguarded/);
});

test("[REQ-COBASE-1] Gegenprobe: Basis deckt services/**, menschliche Approval auf HEAD -> ok:true", () => {
  const repo = makeRepo({ CODEOWNERS: COVER_ALL });
  branchWith(repo, { "services/a.ts": "x\n" });
  const r = run(repo, { diffPaths: svc, reviews: [aliceOk] });
  expect(r.status).toBe(0);
  expect(r.out.ok).toBe(true);
  expect(r.out.pending).toBeFalsy();
});

test("[REQ-COBASE-1] Deckung nur im .github/CODEOWNERS der Basis reicht (Suchreihenfolge der Basis)", () => {
  const repo = makeRepo({ CODEOWNERS: null, ".github/CODEOWNERS": COVER_ALL });
  branchWith(repo, { "services/a.ts": "x\n" });
  const r = run(repo, { diffPaths: svc });
  expect(r.status).toBe(0);
  expect(r.out.pending).toBe(true);
});

test("[REQ-COBASE-1] Grund nennt jeden ungedeckten Pfad", () => {
  const repo = makeRepo();
  branchWith(repo, { "services/a.ts": "x\n", "services/b/c.ts": "x\n" });
  const r = run(repo, { diffPaths: ["services/a.ts", "services/b/c.ts"] });
  expect(r.status).toBe(1);
  expect(r.out.reason).toMatch(/^codeowners-unguarded:/);
  expect(r.out.reason).toContain("services/a.ts");
  expect(r.out.reason).toContain("services/b/c.ts");
});

test("[REQ-COBASE-1] mehrere review-pflichtige Pfade, nur einer ungedeckt -> nur dieser wird genannt", () => {
  const map = JSON.stringify({ T3: ["auth/**"], T2: ["services/**"], T1: ["**"] });
  const repo = makeRepo({ ".devloop/tier-map.json": map, CODEOWNERS: "/.devloop/ @alice\n/auth/ @sec\n" });
  branchWith(repo, { "services/a.ts": "x\n", "auth/login.ts": "x\n", "README.md": "y\n" });
  const r = run(repo, { tier: "T3", diffPaths: ["auth/login.ts", "services/a.ts", "README.md"] });
  expect(r.status).toBe(1);
  expect(r.out.reason).toMatch(/^codeowners-unguarded:/);
  expect(r.out.reason).toContain("services/a.ts");
  expect(r.out.reason).not.toContain("auth/login.ts");
  expect(r.out.reason).not.toContain("README.md"); // ungedeckter T1-Pfad ist nicht review-pflichtig
});

test("[REQ-COBASE-1] T3-Pfad ungedeckt, T2-Pfad gedeckt -> T3-Pfad wird genannt (T3 ist review-pflichtig)", () => {
  const map = JSON.stringify({ T3: ["auth/**"], T2: ["services/**"], T1: ["**"] });
  const repo = makeRepo({ ".devloop/tier-map.json": map, CODEOWNERS: "/.devloop/ @alice\n/services/ @alice\n" });
  branchWith(repo, { "services/a.ts": "x\n", "auth/login.ts": "x\n" });
  const r = run(repo, { tier: "T3", diffPaths: ["auth/login.ts", "services/a.ts"] });
  expect(r.status).toBe(1);
  expect(r.out.reason).toContain("auth/login.ts");
  expect(r.out.reason).not.toContain("services/a.ts");
});

test("[REQ-COBASE-1][REQ-COBASE-2] Basis-tier-map: services/** T2, HEAD-tier-map stuft auf T1 herab, Basis ohne Deckung -> codeowners-unguarded", () => {
  const repo = makeRepo();
  branchWith(repo, { ".devloop/tier-map.json": JSON.stringify({ T1: ["**"] }), CODEOWNERS: SELF_COVER, "services/a.ts": "x\n" });
  const r = run(repo, { tier: "T1", diffPaths: [".devloop/tier-map.json", "CODEOWNERS", ...svc] });
  // Config-Gate (Basis deckt /.devloop/) und Spec-Gate duerfen nicht vorher greifen; CODEOWNERS selbst ist kein Config-Pfad
  expect(r.status).toBe(1);
  expect(r.out.reason).toMatch(/^codeowners-unguarded:/);
  expect(r.out.reason).toContain("services/a.ts");
});

test("[REQ-COBASE-1] ungematchter Pfad, Default der Basis-tier-map T2, Basis ohne Deckung -> codeowners-unguarded", () => {
  const map = JSON.stringify({ rules: [{ tier: "T1", anyOf: ["docs/**"] }], default: "T2" });
  const repo = makeRepo({ ".devloop/tier-map.json": map });
  branchWith(repo, { "lib/x.ts": "x\n" });
  const r = run(repo, { diffPaths: ["lib/x.ts"] });
  expect(r.status).toBe(1);
  expect(r.out.reason).toMatch(/^codeowners-unguarded:/);
  expect(r.out.reason).toContain("lib/x.ts");
});

test("[REQ-COBASE-1] Gegenprobe: gematchter T1-Pfad derselben Default-T2-Map -> kein codeowners-unguarded", () => {
  const map = JSON.stringify({ rules: [{ tier: "T1", anyOf: ["docs/**"] }], default: "T2" });
  const repo = makeRepo({ ".devloop/tier-map.json": map });
  branchWith(repo, { "docs/x.md": "x\n" });
  const r = run(repo, { tier: "T1", diffPaths: ["docs/x.md"] });
  expect(r.status).toBe(0);
  expect(r.out.ok).toBe(true);
});

test("[REQ-COBASE-1] geloeschter T2-Pfad (im Diff, im HEAD weg) zaehlt als review-pflichtig -> codeowners-unguarded", () => {
  const repo = makeRepo({ "services/a.ts": "x\n" });
  branchWith(repo, { "services/a.ts": null });
  const r = run(repo, { diffPaths: svc });
  expect(r.status).toBe(1);
  expect(r.out.reason).toMatch(/^codeowners-unguarded:/);
});

// Schnittstelle: Gate nur mit baseRef
test("[REQ-COBASE-1] ohne baseRef greift das Gate nicht (lokaler Aufruf): T2 ohne Review -> pending", () => {
  const repo = makeRepo();
  const r = run(repo, { baseRef: undefined, diffPaths: svc, protectedGlobs: [], botLogins: ["agent-bot"] });
  expect(r.status).toBe(0);
  expect(r.out.pending).toBe(true);
  expect(r.stdout).not.toMatch(/codeowners-unguarded/);
});

test("[REQ-COBASE-1] Basis deckt /services/, Diff services/a.ts (T2) + README.md (T1, ungedeckt) -> kein codeowners-unguarded (pro Pfad, nicht pro Gesamttier)", () => {
  const repo = makeRepo({ CODEOWNERS: "/.devloop/ @alice\n/services/ @alice\n" });
  branchWith(repo, { "services/a.ts": "x\n", "README.md": "y\n" });
  const r = run(repo, { diffPaths: ["services/a.ts", "README.md"] });
  expect(r.stdout).not.toMatch(/codeowners-unguarded/);
  expect(r.status).toBe(0);
  expect(r.out.pending).toBe(true);
});

// ---------- Basis-tier-map: kein Kandidat / unlesbar ----------

test("[REQ-COBASE-1] Basis ohne tier-map-Kandidat (aber mit .devloop/) -> Gate greift nicht, auch wenn HEAD eine tier-map anlegt", () => {
  const repo = makeRepo({ ".devloop/tier-map.json": null });
  branchWith(repo, { ".devloop/tier-map.json": T2_MAP, "services/a.ts": "x\n" });
  const r = run(repo, { diffPaths: svc });
  expect(r.status).toBe(0);
  expect(r.out.pending).toBe(true);
  expect(r.stdout).not.toMatch(/codeowners-unguarded/);
});

test("[REQ-COBASE-1] Basis-tier-map = `{` -> config-invalid (kein Rueckfall auf HEAD)", () => {
  const repo = makeRepo({ ".devloop/tier-map.json": "{" });
  branchWith(repo, { ".devloop/tier-map.json": T2_MAP, "services/a.ts": "x\n" });
  const r = run(repo, { diffPaths: svc });
  expect(r.status).toBe(1);
  expect(r.out.ok).toBe(false);
  expect(r.out.reason).toMatch(/^config-invalid/);
});

test("[REQ-COBASE-1] Basis-tier-map ist ein Verzeichnis (kein reguelaeres Blob) -> config-invalid", () => {
  const repo = makeRepo({ ".devloop/tier-map.json": null, ".devloop/tier-map.json/x": "a\n" });
  const r = run(repo, { diffPaths: svc });
  expect(r.status).toBe(1);
  expect(r.out.reason).toMatch(/^config-invalid/);
});

test("[REQ-COBASE-1] Basis-tier-map nur unter tools/ -> wird gefunden (gleiche Kandidatensuche wie derive-tier)", () => {
  const repo = makeRepo({ ".devloop/tier-map.json": null, "tools/tier-map.json": T2_MAP });
  branchWith(repo, { "services/a.ts": "x\n" });
  const r = run(repo, { diffPaths: svc });
  expect(r.status).toBe(1);
  expect(r.out.reason).toMatch(/^codeowners-unguarded:/);
});

// ---------- REQ-COBASE-3: Basis-CODEOWNERS fehlt ----------

test("[REQ-COBASE-3] Basis ohne CODEOWNERS, PR berührt T2-Pfad, keine Erstaufnahme -> codeowners-unguarded", () => {
  const repo = makeRepo({ CODEOWNERS: null });
  branchWith(repo, { CODEOWNERS: COVER_ALL, "services/a.ts": "x\n" });
  const r = run(repo, { diffPaths: ["CODEOWNERS", ...svc] });
  expect(r.status).toBe(1);
  expect(r.out.ok).toBe(false);
  expect(r.out.reason).toMatch(/^codeowners-unguarded:/);
  expect(r.out.reason).toContain("services/a.ts");
});

test("[REQ-COBASE-3] Basis-CODEOWNERS ist ein Verzeichnis (unlesbar) -> codeowners-unguarded", () => {
  const repo = makeRepo({ CODEOWNERS: null, "CODEOWNERS/x": "a\n", ".github/CODEOWNERS/y": "a\n" });
  const r = run(repo, { diffPaths: svc });
  expect(r.status).toBe(1);
  expect(r.out.reason).toMatch(/^codeowners-unguarded:/);
});

// ---------- REQ-COBASE-4: Erstaufnahme ----------

test("[REQ-COBASE-4] Erstaufnahme: Basis ohne jeden Config-Pfad und ohne CODEOWNERS, PR legt Config an und berührt services/ -> kein codeowners-unguarded", () => {
  const repo = makeRepo({}, false);
  branchWith(repo, { ".devloop/tier-map.json": T2_MAP, ".devloop/bot-logins.json": '["agent-bot"]', ".devloop/protected-globs.json": "[]", "services/a.ts": "x\n" });
  const r = run(repo, {
    diffPaths: [".devloop/tier-map.json", ".devloop/bot-logins.json", ".devloop/protected-globs.json", ...svc],
  });
  expect(r.stdout).not.toMatch(/codeowners-unguarded/);
  expect(r.status).toBe(0);
  expect(r.out.ok).toBe(true);
});

// ---------- REQ-COBASE-5: nur T0/T1 ----------

test("[REQ-COBASE-5] PR ändert nur T1-Pfade, Basis-CODEOWNERS deckt T2-Pfade nicht -> ok:true wie bisher", () => {
  const repo = makeRepo();
  branchWith(repo, { "docs/a.md": "x\n", "src/b.ts": "x\n" });
  const r = run(repo, { tier: "T1", diffPaths: ["docs/a.md", "src/b.ts"] });
  expect(r.status).toBe(0);
  expect(r.out.ok).toBe(true);
  expect(r.out.pending).toBeFalsy();
  expect(r.stdout).not.toMatch(/codeowners-unguarded/);
});

test("[REQ-COBASE-5] Reparatur-PR: aendert nur .github/CODEOWNERS, Basis hat Luecke -> kein codeowners-unguarded", () => {
  const repo = makeRepo();
  branchWith(repo, { ".github/CODEOWNERS": COVER_ALL });
  const r = run(repo, { tier: "T1", diffPaths: [".github/CODEOWNERS"] });
  expect(r.status).toBe(0);
  expect(r.out.ok).toBe(true);
  expect(r.stdout).not.toMatch(/codeowners-unguarded/);
});

test("[REQ-COBASE-5] Reparatur-PR in Wurzel-CODEOWNERS mit tier T2 von stdin, aber kein T2-Pfad im Diff -> kein codeowners-unguarded", () => {
  const repo = makeRepo();
  branchWith(repo, { CODEOWNERS: COVER_ALL });
  const r = run(repo, { tier: "T2", diffPaths: ["CODEOWNERS"] });
  expect(r.stdout).not.toMatch(/codeowners-unguarded/);
  expect(r.status).toBe(0);
});

test("[REQ-COBASE-5] T0-PR ohne review-pflichtigen Pfad und ohne CODEOWNERS in der Basis -> ok:true", () => {
  const repo = makeRepo({ CODEOWNERS: null });
  const r = run(repo, { tier: "T0", diffPaths: ["docs/a.md"] });
  expect(r.status).toBe(0);
  expect(r.out.ok).toBe(true);
  expect(r.stdout).not.toMatch(/codeowners-unguarded/);
});

// ---------- REQ-COBASE-7: Reihenfolge ----------

test("[REQ-COBASE-7] T2-Pfad ungedeckt, keine Reviews -> ok:false (nicht pending)", () => {
  const repo = makeRepo();
  const r = run(repo, { diffPaths: svc });
  expect(r.status).toBe(1);
  expect(r.out.ok).toBe(false);
  expect(r.out.pending).toBeUndefined();
  expect(r.out.reason).toMatch(/^codeowners-unguarded:/);
});

test("[REQ-COBASE-7] T2-Pfad ungedeckt, auch mit menschlicher Approval auf HEAD -> ok:false (Gate vor Approval)", () => {
  const repo = makeRepo();
  const r = run(repo, { diffPaths: svc, reviews: [aliceOk] });
  expect(r.status).toBe(1);
  expect(r.out.reason).toMatch(/^codeowners-unguarded:/);
});

test("[REQ-COBASE-7] stdin-Tier T0 mit ungedecktem T2-Pfad im Diff -> trotzdem codeowners-unguarded (T0/T1-Abkuerzung erst danach)", () => {
  const repo = makeRepo();
  const r = run(repo, { tier: "T0", diffPaths: svc });
  expect(r.status).toBe(1);
  expect(r.out.reason).toMatch(/^codeowners-unguarded:/);
});

test("[REQ-COBASE-7] Reihenfolge: Gate-Tamper vor CODEOWNERS-Gate", () => {
  const repo = makeRepo();
  const r = run(repo, { diffPaths: ["stryker.conf.json", ...svc] });
  expect(r.status).toBe(1);
  expect(r.out.reason).toMatch(/protected-set-touched/);
});

test("[REQ-COBASE-7] Reihenfolge: Spec-Gate (spec-unguarded) vor CODEOWNERS-Gate", () => {
  const repo = makeRepo();
  const r = run(repo, { headRef: "devloop/spec/x", diffPaths: ["specs/x/spec.md", ...svc] });
  expect(r.status).toBe(1);
  expect(r.out.reason).toMatch(/^spec-unguarded/);
});

test("[REQ-COBASE-7] Reihenfolge: Config-Gate (config-unguarded) vor CODEOWNERS-Gate", () => {
  const repo = makeRepo({ CODEOWNERS: "/src/ @alice\n" });
  const r = run(repo, { diffPaths: [".devloop/protected-globs.json", ...svc] });
  expect(r.status).toBe(1);
  expect(r.out.reason).toMatch(/^config-unguarded/);
});

test("[REQ-COBASE-7] Reihenfolge: Config-Gate-Grund config-invalid (protected-globs kaputt) vor CODEOWNERS-Gate", () => {
  const repo = makeRepo({ ".devloop/protected-globs.json": "{" });
  const r = run(repo, { diffPaths: svc });
  expect(r.status).toBe(1);
  expect(r.out.reason).toMatch(/^config-invalid/);
});

test("[REQ-COBASE-7] Reihenfolge: codeowners-unguarded vor pending (gedeckter T3-Pfad pending, ungedeckter hart)", () => {
  const repo = makeRepo({ CODEOWNERS: COVER_ALL });
  const covered = run(repo, { diffPaths: svc });
  expect(covered.out.pending).toBe(true);
  const repo2 = makeRepo();
  const bad = run(repo2, { diffPaths: svc });
  expect(bad.out.ok).toBe(false);
  expect(bad.out.pending).toBeUndefined();
});

// ---------- REQ-COBASE-6: check-codeowners unveraendert (HEAD) ----------

function checkCodeowners(repo: string) {
  const r = spawnSync("node", [checkCli, repo], { encoding: "utf8" });
  let out: any = {};
  try {
    out = JSON.parse(r.stdout);
  } catch {
    /* leer */
  }
  return { status: r.status, out };
}

test("[REQ-COBASE-6] check-codeowners liest HEAD: Basis ohne Deckung, HEAD-CODEOWNERS deckt services/** -> Exit 0", () => {
  const repo = makeRepo();
  branchWith(repo, { CODEOWNERS: SELF_COVER, "services/a.ts": "x\n" });
  const r = checkCodeowners(repo);
  expect(r.status).toBe(0);
  expect(r.out.ok).toBe(true);
});

test("[REQ-COBASE-6] check-codeowners liest HEAD-tier-map: Basis deckt, HEAD fuegt ungedeckten T2-Glob hinzu -> Exit 1", () => {
  const repo = makeRepo({ CODEOWNERS: COVER_ALL });
  branchWith(repo, { ".devloop/tier-map.json": JSON.stringify({ T2: ["services/**", "billing/**"], T1: ["**"] }) });
  const r = checkCodeowners(repo);
  expect(r.status).toBe(1);
  expect(r.out.uncovered).toContain("billing/**");
});
