import { test, expect, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const cli = resolve(dirname(fileURLToPath(import.meta.url)), "../../dist/cli/verify-review.js");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

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

// Echtes Git-Repo, Commit auf Branch "base". files: Pfad -> Inhalt (CODEOWNERS, spec-globs.json, ...).
function makeRepo(files: Record<string, string> = {}): string {
  const repo = mkdtempSync(join(tmpdir(), "verify-review-spec-"));
  dirs.push(repo);
  git(repo, "init", "-q", "-b", "base");
  git(repo, "config", "user.name", "Test");
  git(repo, "config", "user.email", "test@example.invalid");
  write(repo, "README.md", "x\n");
  for (const [p, c] of Object.entries(files)) write(repo, p, c);
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "base");
  return repo;
}

const COVER_SPECS = "/specs/ @alice\n";

const baseReq = { prAuthor: "agent-bot", headSha: "abc123", botLogins: ["agent-bot"], tier: "T0", baseRef: "base" };

function run(repo: string, req: object) {
  const r = spawnSync("node", [cli], {
    encoding: "utf8",
    input: JSON.stringify({ ...baseReq, repo, ...req }),
    cwd: root,
  });
  let out: any = {};
  try {
    out = JSON.parse(r.stdout);
  } catch {
    /* leave empty: assertions on ok will fail with a clear diff */
  }
  return { status: r.status, out, stdout: r.stdout };
}

const specBranch = { headRef: "devloop/spec/x", diffPaths: ["specs/x/spec.md"], reviews: [] };
const human = { user: "alice", state: "APPROVED", commit_id: "abc123" };

test("[REQ-SPECGATE-1][REQ-SPECGATE-2] T0, Spec-Branch, Spec-Pfad, Basis ohne CODEOWNERS -> spec-unguarded mit Pfad", () => {
  const repo = makeRepo();
  const r = run(repo, specBranch);
  expect(r.status).toBe(1);
  expect(r.out.ok).toBe(false);
  expect(r.out.reason).toMatch(/^spec-unguarded/);
  expect(r.stdout).toContain("specs/x/spec.md");
});

test("[REQ-SPECGATE-1] T1 mit Bot-Approval auf HEAD: Spec-Aenderung umgeht die T0/T1-Freigabe nicht", () => {
  const repo = makeRepo({ CODEOWNERS: COVER_SPECS });
  const r = run(repo, { ...specBranch, tier: "T1", reviews: [{ user: "agent-bot", state: "APPROVED", commit_id: "abc123" }] });
  expect(r.status).toBe(1);
  expect(r.out.ok).toBe(false);
});

test("[REQ-SPECGATE-2] Impl-Branch mit Spec-Pfad im Diff, Basis-CODEOWNERS ohne specs/ -> ok:false, spec-unguarded", () => {
  const repo = makeRepo({ CODEOWNERS: "/src/ @alice\n" });
  const r = run(repo, { headRef: "devloop/x", diffPaths: ["specs/x/spec.md", "src/a.ts"], reviews: [] });
  expect(r.status).toBe(1);
  expect(r.out.ok).toBe(false);
  expect(r.out.reason).toMatch(/^spec-unguarded/);
  expect(r.stdout).toContain("specs/x/spec.md");
  expect(r.stdout).not.toContain("src/a.ts");
});

test("[REQ-SPECGATE-2] mehrere Spec-Pfade: nur der ungedeckte wird genannt", () => {
  const repo = makeRepo({ CODEOWNERS: "/specs/a/ @alice\n" });
  const r = run(repo, { headRef: "devloop/x", diffPaths: ["specs/a/spec.md", "specs/b/spec.md"], reviews: [] });
  expect(r.out.ok).toBe(false);
  expect(r.out.reason).toMatch(/^spec-unguarded/);
  expect(r.stdout).toContain("specs/b/spec.md");
  expect(r.stdout).not.toContain("specs/a/spec.md");
});

test("[REQ-SPECGATE-2] Basis-CODEOWNERS in .github/ deckt specs/ -> Gate besteht (pending)", () => {
  const repo = makeRepo({ ".github/CODEOWNERS": COVER_SPECS });
  const r = run(repo, specBranch);
  expect(r.status).toBe(0);
  expect(r.out.ok).toBe(true);
  expect(r.out.pending).toBe(true);
});

test("[REQ-SPECGATE-2] Basis-CODEOWNERS in docs/ deckt specs/ -> Gate besteht (pending)", () => {
  const repo = makeRepo({ "docs/CODEOWNERS": COVER_SPECS });
  const r = run(repo, specBranch);
  expect(r.status).toBe(0);
  expect(r.out.pending).toBe(true);
});

test("[REQ-SPECGATE-2] erste existierende Datei gewinnt: CODEOWNERS ohne specs/ schlaegt .github/CODEOWNERS mit specs/", () => {
  const repo = makeRepo({ CODEOWNERS: "/src/ @alice\n", ".github/CODEOWNERS": COVER_SPECS });
  const r = run(repo, specBranch);
  expect(r.out.ok).toBe(false);
  expect(r.out.reason).toMatch(/^spec-unguarded/);
});

test("[REQ-SPECGATE-2] ungedeckter Spec-Pfad: auch eine menschliche Approval auf HEAD rettet nicht", () => {
  // Deckungspruefung kommt vor der Approval-Bewertung.
  const repo = makeRepo();
  const r = run(repo, { ...specBranch, reviews: [human] });
  expect(r.status).toBe(1);
  expect(r.out.reason).toMatch(/^spec-unguarded/);
});

test("[REQ-SPECGATE-3] Spec-Branch ohne Spec-Pfad (nur Test) -> spec-unguarded mit Hinweis auf spec-globs.json", () => {
  const repo = makeRepo({ CODEOWNERS: COVER_SPECS });
  const r = run(repo, { headRef: "devloop/spec/x", diffPaths: ["test/a.test.ts"], reviews: [] });
  expect(r.status).toBe(1);
  expect(r.out.ok).toBe(false);
  expect(r.out.reason).toMatch(/^spec-unguarded/);
  expect(r.stdout).toContain("spec-globs.json");
});

test("[REQ-SPECGATE-4] T0, Spec-Branch, gedeckt, keine Reviews -> ok:true, pending:true (kein harter Fail)", () => {
  const repo = makeRepo({ CODEOWNERS: COVER_SPECS });
  const r = run(repo, specBranch);
  expect(r.status).toBe(0);
  expect(r.out.ok).toBe(true);
  expect(r.out.pending).toBe(true);
});

test("[REQ-SPECGATE-4] T0, Spec-Branch, gedeckt, nur Kommentar-Review -> pending (wie ab T2)", () => {
  const repo = makeRepo({ CODEOWNERS: COVER_SPECS });
  const r = run(repo, { ...specBranch, reviews: [{ user: "alice", state: "COMMENTED", commit_id: "abc123" }] });
  expect(r.status).toBe(0);
  expect(r.out.pending).toBe(true);
});

test("[REQ-SPECGATE-4] T0, Spec-Branch, gedeckt, Approval auf altem SHA -> ok:false", () => {
  const repo = makeRepo({ CODEOWNERS: COVER_SPECS });
  const r = run(repo, { ...specBranch, reviews: [{ user: "alice", state: "APPROVED", commit_id: "old" }] });
  expect(r.status).toBe(1);
  expect(r.out.ok).toBe(false);
});

test("[REQ-SPECGATE-4] T0, Spec-Branch, gedeckt, Bot-Approval auf HEAD -> ok:false", () => {
  const repo = makeRepo({ CODEOWNERS: COVER_SPECS });
  const r = run(repo, { ...specBranch, reviews: [{ user: "agent-bot", state: "APPROVED", commit_id: "abc123" }] });
  expect(r.status).toBe(1);
  expect(r.out.ok).toBe(false);
});

test("[REQ-SPECGATE-4] T0, Spec-Branch, gedeckt, Autor-Approval auf HEAD -> ok:false", () => {
  const repo = makeRepo({ CODEOWNERS: COVER_SPECS });
  const r = run(repo, { ...specBranch, prAuthor: "carol", reviews: [{ user: "carol", state: "APPROVED", commit_id: "abc123" }] });
  expect(r.status).toBe(1);
  expect(r.out.ok).toBe(false);
});

test("[REQ-SPECGATE-4] Gegenprobe: T0, Spec-Branch, gedeckt, menschliche Approval auf HEAD -> ok:true, nicht pending (kein pauschaler Block, kein ewiges pending)", () => {
  const repo = makeRepo({ CODEOWNERS: COVER_SPECS });
  const r = run(repo, { ...specBranch, reviews: [human] });
  expect(r.status).toBe(0);
  expect(r.out.ok).toBe(true);
  expect(r.out.pending).toBeFalsy();
});

test("[REQ-SPECGATE-5] spec-globs.json = {} -> ok:false (kein stiller Default)", () => {
  // Nicht-Spec-Pfad und Feature-Branch: ohne Config-Pruefung wuerde das durchgehen.
  const repo = makeRepo({ CODEOWNERS: COVER_SPECS, ".devloop/spec-globs.json": "{}" });
  const r = run(repo, { headRef: "feature/y", diffPaths: ["src/a.ts"], reviews: [] });
  expect(r.status).toBe(1);
  expect(r.out.ok).toBe(false);
});

test("[REQ-SPECGATE-5] spec-globs.json kaputt (kein JSON) -> ok:false", () => {
  const repo = makeRepo({ CODEOWNERS: COVER_SPECS, ".devloop/spec-globs.json": "[not json" });
  const r = run(repo, { headRef: "feature/y", diffPaths: ["src/a.ts"], reviews: [] });
  expect(r.status).toBe(1);
  expect(r.out.ok).toBe(false);
});

test("[REQ-SPECGATE-5] spec-globs.json mit leerem String bzw. Nicht-String bzw. leerem Array -> ok:false", () => {
  for (const content of ['[""]', "[1]", '["a", null]', "[]"]) {
    const repo = makeRepo({ CODEOWNERS: COVER_SPECS, ".devloop/spec-globs.json": content });
    const r = run(repo, { headRef: "feature/y", diffPaths: ["src/a.ts"], reviews: [] });
    expect(r.out.ok, content).toBe(false);
    expect(r.status, content).toBe(1);
  }
});

test("[REQ-SPECGATE-5] spec-globs.json = [\"docs/specs/*.md\"], Diff docs/specs/a.md ungedeckt -> ok:false, Pfad genannt", () => {
  const repo = makeRepo({ CODEOWNERS: COVER_SPECS, ".devloop/spec-globs.json": '["docs/specs/*.md"]' });
  const r = run(repo, { headRef: "feature/y", diffPaths: ["docs/specs/a.md"], reviews: [] });
  expect(r.status).toBe(1);
  expect(r.out.ok).toBe(false);
  expect(r.out.reason).toMatch(/^spec-unguarded/);
  expect(r.stdout).toContain("docs/specs/a.md");
});

test("[REQ-SPECGATE-5] spec-globs.json gueltig und Pfad gedeckt -> Gate besteht (Config wird nicht nur als Fehlerquelle behandelt)", () => {
  const repo = makeRepo({ CODEOWNERS: "/docs/specs/ @alice\n", ".devloop/spec-globs.json": '["docs/specs/*.md"]' });
  const r = run(repo, { headRef: "feature/y", diffPaths: ["docs/specs/a.md"], reviews: [] });
  expect(r.status).toBe(0);
  expect(r.out.ok).toBe(true);
  expect(r.out.pending).toBe(true);
});

test("[REQ-SPECGATE-5] eigene Globs ersetzen den Default: specs/x/spec.md ist dann keine Spec-Aenderung", () => {
  // Auslegung: Config ueberschreibt den Default (Spec: "ueberschreibbar").
  const repo = makeRepo({ ".devloop/spec-globs.json": '["docs/specs/*.md"]' });
  const r = run(repo, { headRef: "feature/y", diffPaths: ["specs/x/spec.md"], reviews: [] });
  expect(r.status).toBe(0);
  expect(r.out.ok).toBe(true);
});

test("[REQ-SPECGATE-2] Spec-Pfad im Diff, aber baseRef fehlt -> fail-closed", () => {
  const repo = makeRepo({ CODEOWNERS: COVER_SPECS });
  const r = run(repo, { ...specBranch, baseRef: undefined });
  expect(r.status).toBe(1);
  expect(r.out.ok).toBe(false);
});

test("[REQ-SPECGATE-6] T0, feature/y, nur src/a.ts, keine Reviews -> ok:true wie bisher", () => {
  const repo = makeRepo();
  const r = run(repo, { headRef: "feature/y", diffPaths: ["src/a.ts"], reviews: [] });
  expect(r.status).toBe(0);
  expect(r.out.ok).toBe(true);
});

test("[REQ-SPECGATE-6] Nicht-Spec-PR: T1 mit Bot-Approval bleibt ok (Tier-Logik unveraendert)", () => {
  const repo = makeRepo();
  const r = run(repo, {
    headRef: "feature/y",
    diffPaths: ["src/a.ts"],
    tier: "T1",
    reviews: [{ user: "agent-bot", state: "APPROVED", commit_id: "abc123" }],
  });
  expect(r.status).toBe(0);
  expect(r.out.ok).toBe(true);
});

test("[REQ-SPECGATE-6] Nicht-Spec-PR: T2 ohne Review bleibt pending, Gate-Tamper bleibt hart", () => {
  const repo = makeRepo();
  const pend = run(repo, { headRef: "feature/y", diffPaths: ["src/a.ts"], tier: "T2", reviews: [] });
  expect(pend.status).toBe(0);
  expect(pend.out.pending).toBe(true);
  const tamper = run(repo, {
    headRef: "feature/y",
    diffPaths: ["stryker.conf.json"],
    protectedGlobs: ["**/stryker.conf.*"],
    reviews: [],
  });
  expect(tamper.status).toBe(1);
  expect(tamper.out.reason).toMatch(/protected/);
});

test("[REQ-SPECGATE-6] Gate-Tamper schlaegt auch bei gedeckter Spec-Aenderung zuerst zu", () => {
  const repo = makeRepo({ CODEOWNERS: COVER_SPECS });
  const r = run(repo, {
    ...specBranch,
    diffPaths: ["specs/x/spec.md", "stryker.conf.json"],
    protectedGlobs: ["**/stryker.conf.*"],
  });
  expect(r.status).toBe(1);
  expect(r.out.reason).toMatch(/protected/);
});

test("[REQ-SPECGATE-7] Basis ohne specs/-Deckung, HEAD (Arbeitsbaum + Commit) mit specs/ -> ok:false", () => {
  const repo = makeRepo({ CODEOWNERS: "/src/ @alice\n" });
  git(repo, "checkout", "-q", "-b", "feature");
  write(repo, "CODEOWNERS", "/src/ @alice\n/specs/ @mallory\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "self-cover");
  const r = run(repo, specBranch);
  expect(r.status).toBe(1);
  expect(r.out.ok).toBe(false);
  expect(r.out.reason).toMatch(/^spec-unguarded/);
  expect(r.stdout).toContain("specs/x/spec.md");
});

test("[REQ-SPECGATE-7] Basis ganz ohne CODEOWNERS, PR fuegt CODEOWNERS mit specs/ hinzu -> ok:false", () => {
  const repo = makeRepo();
  git(repo, "checkout", "-q", "-b", "feature");
  write(repo, "CODEOWNERS", COVER_SPECS);
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "add codeowners");
  const r = run(repo, { ...specBranch, reviews: [human] });
  expect(r.status).toBe(1);
  expect(r.out.ok).toBe(false);
  expect(r.out.reason).toMatch(/^spec-unguarded/);
});

test("[REQ-SPECGATE-7] Gegenprobe: Basis deckt specs/, HEAD streicht die Deckung -> Gate besteht (Basis zaehlt)", () => {
  const repo = makeRepo({ CODEOWNERS: COVER_SPECS });
  git(repo, "checkout", "-q", "-b", "feature");
  write(repo, "CODEOWNERS", "/src/ @alice\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "drop cover");
  const r = run(repo, specBranch);
  expect(r.status).toBe(0);
  expect(r.out.ok).toBe(true);
  expect(r.out.pending).toBe(true);
});
