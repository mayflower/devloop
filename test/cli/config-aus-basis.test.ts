// [REQ-CFGBASE-*] .devloop-Config aus der Basis (#13). CLI-Tests gegen dist/ in temporaeren Git-Repos
// mit echter Basis (Branch "base", echtes `git show`). Keine Attrappen.
import { test, expect, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const verifyCli = join(root, "dist/cli/verify-review.js");
const deriveCli = join(root, "dist/cli/derive-tier.js");

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

const DEFAULT_CONFIG: Record<string, string | null> = {
  ".devloop/tier-map.json": JSON.stringify({ T1: ["**"] }),
  ".devloop/bot-logins.json": '["agent-bot"]',
  ".devloop/protected-globs.json": '["**/stryker.conf.*"]',
};

// Basis-Commit auf Branch "base". Standard: komplette Config (kein Erstaufnahme-Fall).
// files: Pfad -> Inhalt; null entfernt einen Standard-Eintrag.
function makeRepo(files: Record<string, string | null> = {}, withDefaults = true): string {
  const repo = mkdtempSync(join(tmpdir(), "config-aus-basis-"));
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

// Branch "feature" mit PR-Aenderungen (null = loeschen), Commit + Arbeitsbaum.
function branchWith(repo: string, files: Record<string, string | null>): void {
  git(repo, "checkout", "-q", "-b", "feature");
  for (const [p, c] of Object.entries(files)) {
    if (c === null) git(repo, "rm", "-q", p);
    else write(repo, p, c);
  }
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "pr");
}

const baseReq = { prAuthor: "agent-bot", headSha: "abc123", tier: "T1", baseRef: "base", headRef: "feature/y", reviews: [] };

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

function derive(repo: string, req: object) {
  const r = spawnSync("node", [deriveCli], { encoding: "utf8", input: JSON.stringify({ repo, ...req }), cwd: root });
  let out: any = {};
  try {
    out = JSON.parse(r.stdout);
  } catch {
    /* leer */
  }
  return { status: r.status, out, stderr: r.stderr };
}

const COVER_CFG = "/.devloop/ @alice\n";
const aliceOk = { user: "alice", state: "APPROVED", commit_id: "abc123" };
const cfgDiff = [".devloop/protected-globs.json"];

// ---------- REQ-CFGBASE-1: derive-tier liest die tier-map aus der Basis ----------

test("[REQ-CFGBASE-1] Basis-tier-map src/** -> T3, PR stuft in HEAD auf T1 herab -> Tier T3", () => {
  const repo = makeRepo({ ".devloop/tier-map.json": JSON.stringify({ T3: ["src/**"], T1: ["**"] }) });
  branchWith(repo, { ".devloop/tier-map.json": JSON.stringify({ T1: ["**"] }), "src/a.ts": "x\n" });
  const r = derive(repo, { touched: ["src/a.ts", ".devloop/tier-map.json"], baseRef: "base" });
  expect(r.status).toBe(0);
  expect(r.out.tier).toBe("T3");
});

test("[REQ-CFGBASE-1] Basis-tier-map nur unter tools/, HEAD legt .devloop/tier-map.json (T1) an -> Tier aus tools/ der Basis", () => {
  const repo = makeRepo(
    { ".devloop/tier-map.json": null, "tools/tier-map.json": JSON.stringify({ T3: ["src/**"], T1: ["**"] }) },
  );
  branchWith(repo, { ".devloop/tier-map.json": JSON.stringify({ T1: ["**"] }), "src/a.ts": "x\n" });
  const r = derive(repo, { touched: ["src/a.ts", ".devloop/tier-map.json"], baseRef: "base" });
  expect(r.status).toBe(0);
  expect(r.out.tier).toBe("T3");
});

test("[REQ-CFGBASE-1] Suchreihenfolge in der Basis: .devloop/ vor tools/ vor Root", () => {
  const repo = makeRepo({
    ".devloop/tier-map.json": null,
    "tools/tier-map.json": JSON.stringify({ T2: ["src/**"], T1: ["**"] }),
    "tier-map.json": JSON.stringify({ T3: ["src/**"], T1: ["**"] }),
  });
  branchWith(repo, { "src/a.ts": "x\n" });
  const r = derive(repo, { touched: ["src/a.ts"], baseRef: "base" });
  expect(r.status).toBe(0);
  expect(r.out.tier).toBe("T2");
});

test("[REQ-CFGBASE-1][REQ-CFGBASE-4] Gegenprobe: Basis ohne tier-map-Kandidat -> Arbeitsbaum gilt (wie heute)", () => {
  const repo = makeRepo({ ".devloop/tier-map.json": null });
  branchWith(repo, { ".devloop/tier-map.json": JSON.stringify({ T2: ["src/**"], T1: ["**"] }), "src/a.ts": "x\n" });
  const r = derive(repo, { touched: ["src/a.ts"], baseRef: "base" });
  expect(r.status).toBe(0);
  expect(r.out.tier).toBe("T2");
});

test("[REQ-CFGBASE-1] Gegenprobe: ohne baseRef wie bisher aus dem Arbeitsbaum", () => {
  const repo = makeRepo({ ".devloop/tier-map.json": JSON.stringify({ T3: ["src/**"], T1: ["**"] }) });
  branchWith(repo, { ".devloop/tier-map.json": JSON.stringify({ T2: ["src/**"], T1: ["**"] }) });
  const r = derive(repo, { touched: ["src/a.ts"] });
  expect(r.status).toBe(0);
  expect(r.out.tier).toBe("T2");
});

// ---------- REQ-CFGBASE-3: unlesbare Basis-Datei, fail-closed ----------

test("[REQ-CFGBASE-3] Basis-tier-map = `{`, Arbeitsbaum gueltig -> derive-tier Exit != 0 (kein Rueckfall auf HEAD)", () => {
  const repo = makeRepo({ ".devloop/tier-map.json": "{" });
  branchWith(repo, { ".devloop/tier-map.json": JSON.stringify({ T1: ["**"] }) });
  const r = derive(repo, { touched: ["src/a.ts"], baseRef: "base" });
  expect(r.status).not.toBe(0);
  expect(r.status).not.toBeNull();
});

test("[REQ-CFGBASE-3] Basis-tier-map ist ein Verzeichnis (kein reguelaeres Blob) -> derive-tier Exit != 0", () => {
  const repo = makeRepo({ ".devloop/tier-map.json": null, ".devloop/tier-map.json/x": "a\n" });
  branchWith(repo, { "src/a.ts": "x\n" });
  const r = derive(repo, { touched: ["src/a.ts"], baseRef: "base" });
  expect(r.status).not.toBe(0);
});

test("[REQ-CFGBASE-3] Basis-protected-globs = `{` -> config-invalid (kein Rueckfall auf stdin/HEAD/leer)", () => {
  const repo = makeRepo({ ".devloop/protected-globs.json": "{" });
  branchWith(repo, { ".devloop/protected-globs.json": "[]", "src/a.ts": "x\n" });
  const r = run(repo, { diffPaths: ["src/a.ts"], protectedGlobs: [] });
  expect(r.status).toBe(1);
  expect(r.out.ok).toBe(false);
  expect(r.out.reason).toMatch(/^config-invalid/);
});

test("[REQ-CFGBASE-3] Basis-protected-globs falsche Form ({}, [1], [\"a\",null], Objekt) -> config-invalid", () => {
  for (const content of ["{}", "[1]", '["a", null]', '{"globs":["a"]}', "null", ""]) {
    const repo = makeRepo({ ".devloop/protected-globs.json": content });
    const r = run(repo, { diffPaths: ["src/a.ts"], protectedGlobs: [] });
    expect(r.out.reason, JSON.stringify(content)).toMatch(/^config-invalid/);
    expect(r.status, JSON.stringify(content)).toBe(1);
  }
});

test("[REQ-CFGBASE-3] Basis-protected-globs ist ein Verzeichnis (kein reguelaeres Blob) -> config-invalid", () => {
  const repo = makeRepo({ ".devloop/protected-globs.json": null, ".devloop/protected-globs.json/x": "a\n" });
  const r = run(repo, { diffPaths: ["src/a.ts"], protectedGlobs: [] });
  expect(r.status).toBe(1);
  expect(r.out.reason).toMatch(/^config-invalid/);
});

test("[REQ-CFGBASE-3] Basis-bot-logins = `{` -> config-invalid, auch wenn stdin und Arbeitsbaum gueltig sind", () => {
  const repo = makeRepo({ ".devloop/bot-logins.json": "{" });
  branchWith(repo, { ".devloop/bot-logins.json": '["agent-bot"]' });
  const r = run(repo, { diffPaths: ["src/a.ts"], botLogins: ["agent-bot"] });
  expect(r.status).toBe(1);
  expect(r.out.ok).toBe(false);
  expect(r.out.reason).toMatch(/^config-invalid/);
});

test("[REQ-CFGBASE-3] Basis-bot-logins falsche Form ({}, [1], \"x\") und Verzeichnis -> config-invalid", () => {
  for (const content of ["{}", "[1]", '"x"']) {
    const repo = makeRepo({ ".devloop/bot-logins.json": content });
    const r = run(repo, { diffPaths: ["src/a.ts"], botLogins: ["agent-bot"] });
    expect(r.out.reason, content).toMatch(/^config-invalid/);
  }
  const repo = makeRepo({ ".devloop/bot-logins.json": null, ".devloop/bot-logins.json/x": "a\n" });
  const r = run(repo, { diffPaths: ["src/a.ts"], botLogins: ["agent-bot"] });
  expect(r.out.reason).toMatch(/^config-invalid/);
});

// ---------- REQ-CFGBASE-2: verify-review nimmt Protected-Globs und Bot-Logins aus der Basis ----------

test("[REQ-CFGBASE-2] Basis-protected-globs mit stryker-Glob, PR leert die Liste und aendert stryker.conf.json -> protected-set-touched", () => {
  const repo = makeRepo();
  branchWith(repo, { ".devloop/protected-globs.json": "[]", "stryker.conf.json": "{}" });
  // stdin traegt die (geleerte) HEAD-Liste wie die alte Action
  const r = run(repo, { diffPaths: ["stryker.conf.json", ".devloop/protected-globs.json"], protectedGlobs: [] });
  expect(r.status).toBe(1);
  expect(r.out.ok).toBe(false);
  expect(r.out.reason).toMatch(/protected-set-touched/);
});

test("[REQ-CFGBASE-2] Basis-bot-logins [\"bot\"], PR leert die Liste, Approval von bot auf HEAD, T2 -> ok:false", () => {
  const repo = makeRepo({ ".devloop/bot-logins.json": '["bot"]' }, true);
  git(repo, "checkout", "-q", "-b", "feature");
  write(repo, ".devloop/bot-logins.json", "[]");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "pr");
  const r = run(repo, {
    tier: "T2",
    prAuthor: "someone",
    diffPaths: ["src/a.ts"],
    botLogins: [],
    reviews: [{ user: "bot", state: "APPROVED", commit_id: "abc123" }],
  });
  expect(r.status).toBe(1);
  expect(r.out.ok).toBe(false);
  expect(r.out.reason).toMatch(/human-approval/);
});

test("[REQ-CFGBASE-2] Gegenprobe: dieselbe Lage mit menschlicher Approval -> ok:true", () => {
  const repo = makeRepo({ ".devloop/bot-logins.json": '["bot"]' });
  const r = run(repo, { tier: "T2", prAuthor: "someone", diffPaths: ["src/a.ts"], reviews: [aliceOk] });
  expect(r.status).toBe(0);
  expect(r.out.ok).toBe(true);
});

// ---------- REQ-CFGBASE-4: Rangfolge Basis -> Arbeitsbaum -> stdin -> config-missing ----------

const stryker = { diffPaths: ["stryker.conf.json"] };

test("[REQ-CFGBASE-4] Rangfolge: Basis (stryker-Glob) schlaegt Arbeitsbaum ([]) und stdin ([])", () => {
  const repo = makeRepo();
  write(repo, ".devloop/protected-globs.json", "[]"); // nur Arbeitsbaum, nicht committet
  const r = run(repo, { ...stryker, protectedGlobs: [] });
  expect(r.status).toBe(1);
  expect(r.out.reason).toMatch(/protected-set-touched/);
});

test("[REQ-CFGBASE-4] Rangfolge: Basis ohne protected-globs, Arbeitsbaum mit stryker-Glob schlaegt stdin ([])", () => {
  const repo = makeRepo({ ".devloop/protected-globs.json": null });
  branchWith(repo, { ".devloop/protected-globs.json": '["**/stryker.conf.*"]' });
  const r = run(repo, { ...stryker, protectedGlobs: [] });
  expect(r.status).toBe(1);
  expect(r.out.reason).toMatch(/protected-set-touched/);
});

test("[REQ-CFGBASE-4] Rangfolge: weder Basis noch Arbeitsbaum -> stdin-Wert gilt (stryker-Glob greift)", () => {
  const repo = makeRepo({ ".devloop/protected-globs.json": null });
  const r = run(repo, { ...stryker, protectedGlobs: ["**/stryker.conf.*"] });
  expect(r.status).toBe(1);
  expect(r.out.reason).toMatch(/protected-set-touched/);
});

test("[REQ-CFGBASE-4] protected-globs fehlt ueberall (Basis, Arbeitsbaum, stdin) -> config-missing", () => {
  const repo = makeRepo({ ".devloop/protected-globs.json": null });
  const r = run(repo, { diffPaths: ["src/a.ts"] });
  expect(r.status).toBe(1);
  expect(r.out.ok).toBe(false);
  expect(r.out.reason).toMatch(/^config-missing/);
});

test("[REQ-CFGBASE-4] bot-logins fehlt ueberall -> config-missing", () => {
  const repo = makeRepo({ ".devloop/bot-logins.json": null });
  const r = run(repo, { diffPaths: ["src/a.ts"] });
  expect(r.status).toBe(1);
  expect(r.out.ok).toBe(false);
  expect(r.out.reason).toMatch(/^config-missing/);
});

test("[REQ-CFGBASE-4] Rangfolge bot-logins: Basis ohne Datei, Arbeitsbaum [\"bot\"] schlaegt stdin ([]) -> Bot-Approval zaehlt nicht", () => {
  const repo = makeRepo({ ".devloop/bot-logins.json": null });
  branchWith(repo, { ".devloop/bot-logins.json": '["bot"]' });
  const r = run(repo, {
    tier: "T2",
    prAuthor: "someone",
    diffPaths: ["src/a.ts"],
    botLogins: [],
    reviews: [{ user: "bot", state: "APPROVED", commit_id: "abc123" }],
  });
  expect(r.status).toBe(1);
  expect(r.out.ok).toBe(false);
});

test("[REQ-CFGBASE-4] Rangfolge bot-logins: weder Basis noch Arbeitsbaum -> stdin gilt (Bot-Approval zaehlt nicht)", () => {
  const repo = makeRepo({ ".devloop/bot-logins.json": null });
  const r = run(repo, {
    tier: "T2",
    prAuthor: "someone",
    diffPaths: ["src/a.ts"],
    botLogins: ["bot"],
    reviews: [{ user: "bot", state: "APPROVED", commit_id: "abc123" }],
  });
  expect(r.status).toBe(1);
  expect(r.out.ok).toBe(false);
});

test("[REQ-CFGBASE-4][REQ-CFGBASE-7] Gegenprobe: ohne baseRef gilt nur stdin wie bisher (kein config-missing)", () => {
  const repo = makeRepo({}, false);
  const ok = run(repo, { baseRef: undefined, diffPaths: ["src/a.ts"] });
  expect(ok.status).toBe(0);
  expect(ok.out.ok).toBe(true);
  const tamper = run(repo, { baseRef: undefined, diffPaths: ["stryker.conf.json"], protectedGlobs: ["**/stryker.conf.*"] });
  expect(tamper.status).toBe(1);
  expect(tamper.out.reason).toMatch(/protected-set-touched/);
});

// ---------- REQ-CFGBASE-5/6: Config-Aenderung ----------

test("[REQ-CFGBASE-6] T1, PR aendert nur .devloop/protected-globs.json, Basis-CODEOWNERS ohne /.devloop/ -> config-unguarded mit Pfad", () => {
  const repo = makeRepo({ CODEOWNERS: "/src/ @alice\n" });
  branchWith(repo, { ".devloop/protected-globs.json": "[]" });
  const r = run(repo, { diffPaths: cfgDiff });
  expect(r.status).toBe(1);
  expect(r.out.ok).toBe(false);
  expect(r.out.reason).toMatch(/^config-unguarded/);
  expect(r.stdout).toContain(".devloop/protected-globs.json");
});

test("[REQ-CFGBASE-6] Basis ganz ohne CODEOWNERS (Basis hat Config) -> config-unguarded", () => {
  const repo = makeRepo();
  branchWith(repo, { ".devloop/protected-globs.json": '["**/x"]' });
  const r = run(repo, { diffPaths: cfgDiff });
  expect(r.status).toBe(1);
  expect(r.out.reason).toMatch(/^config-unguarded/);
});

test("[REQ-CFGBASE-6] ungedeckter Config-Pfad: auch menschliche Approval auf HEAD rettet nicht (Deckung vor Approval)", () => {
  const repo = makeRepo({ CODEOWNERS: "/src/ @alice\n" });
  branchWith(repo, { ".devloop/protected-globs.json": '["**/x"]' });
  const r = run(repo, { diffPaths: cfgDiff, reviews: [aliceOk] });
  expect(r.status).toBe(1);
  expect(r.out.reason).toMatch(/^config-unguarded/);
});

test("[REQ-CFGBASE-6] mehrere Config-Pfade: nur der ungedeckte wird genannt", () => {
  const repo = makeRepo({ CODEOWNERS: "/.devloop/protected-globs.json @alice\n" });
  branchWith(repo, { ".devloop/protected-globs.json": '["**/x"]', ".devloop/bot-logins.json": '["agent-bot","y"]' });
  const r = run(repo, { diffPaths: [".devloop/protected-globs.json", ".devloop/bot-logins.json"] });
  expect(r.out.reason).toMatch(/^config-unguarded/);
  expect(r.stdout).toContain(".devloop/bot-logins.json");
  expect(r.stdout).not.toContain(".devloop/protected-globs.json");
});

test("[REQ-CFGBASE-5] Config-Aenderung mit Deckung, keine Reviews -> ok:true, pending:true (kein harter Fail)", () => {
  const repo = makeRepo({ CODEOWNERS: COVER_CFG });
  branchWith(repo, { ".devloop/protected-globs.json": '["**/x"]' });
  const r = run(repo, { diffPaths: cfgDiff });
  expect(r.status).toBe(0);
  expect(r.out.ok).toBe(true);
  expect(r.out.pending).toBe(true);
});

test("[REQ-CFGBASE-5] Config-Aenderung mit Deckung, T0 -> ebenfalls pending (keine T0/T1-Abkuerzung)", () => {
  const repo = makeRepo({ CODEOWNERS: COVER_CFG });
  branchWith(repo, { ".devloop/protected-globs.json": '["**/x"]' });
  const r = run(repo, { tier: "T0", diffPaths: cfgDiff });
  expect(r.status).toBe(0);
  expect(r.out.pending).toBe(true);
});

test("[REQ-CFGBASE-5] Config-Aenderung mit Deckung, Approval auf altem SHA -> ok:false", () => {
  const repo = makeRepo({ CODEOWNERS: COVER_CFG });
  branchWith(repo, { ".devloop/protected-globs.json": '["**/x"]' });
  const r = run(repo, { diffPaths: cfgDiff, reviews: [{ user: "alice", state: "APPROVED", commit_id: "old" }] });
  expect(r.status).toBe(1);
  expect(r.out.ok).toBe(false);
});

test("[REQ-CFGBASE-5] Config-Aenderung mit Deckung, Bot-Approval auf HEAD -> ok:false", () => {
  const repo = makeRepo({ CODEOWNERS: COVER_CFG });
  branchWith(repo, { ".devloop/protected-globs.json": '["**/x"]' });
  const r = run(repo, { diffPaths: cfgDiff, reviews: [{ user: "agent-bot", state: "APPROVED", commit_id: "abc123" }] });
  expect(r.status).toBe(1);
  expect(r.out.ok).toBe(false);
});

test("[REQ-CFGBASE-5] Gegenprobe: Config-Aenderung mit Deckung, menschliche Approval auf HEAD -> ok:true, nicht pending", () => {
  const repo = makeRepo({ CODEOWNERS: COVER_CFG });
  branchWith(repo, { ".devloop/protected-globs.json": '["**/x"]' });
  const r = run(repo, { diffPaths: cfgDiff, reviews: [aliceOk] });
  expect(r.status).toBe(0);
  expect(r.out.ok).toBe(true);
  expect(r.out.pending).toBeFalsy();
});

test("[REQ-CFGBASE-5] Config-Pfad geloescht (Datei im Diff, im HEAD weg) zaehlt als Config-Aenderung -> config-unguarded", () => {
  const repo = makeRepo({ CODEOWNERS: "/src/ @alice\n" });
  branchWith(repo, { ".devloop/bot-logins.json": null });
  const r = run(repo, { diffPaths: [".devloop/bot-logins.json"] });
  expect(r.status).toBe(1);
  expect(r.out.reason).toMatch(/^config-unguarded/);
});

test("[REQ-CFGBASE-5] T1, PR legt tools/tier-map.json an, Basis hat .devloop/tier-map.json -> Config-Aenderung (config-unguarded)", () => {
  const repo = makeRepo({ CODEOWNERS: COVER_CFG });
  branchWith(repo, { "tools/tier-map.json": JSON.stringify({ T1: ["**"] }) });
  const r = run(repo, { diffPaths: ["tools/tier-map.json"] });
  expect(r.status).toBe(1);
  expect(r.out.reason).toMatch(/^config-unguarded/);
  expect(r.stdout).toContain("tools/tier-map.json");
});

test("[REQ-CFGBASE-5] T1, PR legt tier-map.json im Root an -> Config-Aenderung (config-unguarded)", () => {
  const repo = makeRepo({ CODEOWNERS: COVER_CFG });
  branchWith(repo, { "tier-map.json": JSON.stringify({ T1: ["**"] }) });
  const r = run(repo, { diffPaths: ["tier-map.json"] });
  expect(r.status).toBe(1);
  expect(r.out.reason).toMatch(/^config-unguarded/);
  expect(r.stdout).toContain("tier-map.json");
});

test("[REQ-CFGBASE-5] T1, PR legt .devloop/spec-globs.json NEU an, Basis hat andere .devloop-Dateien -> config-unguarded ohne Deckung", () => {
  const repo = makeRepo({ CODEOWNERS: "/src/ @alice\n" });
  branchWith(repo, { ".devloop/spec-globs.json": '["specs/**"]' });
  const r = run(repo, { diffPaths: [".devloop/spec-globs.json"] });
  expect(r.status).toBe(1);
  expect(r.out.reason).toMatch(/^config-unguarded/);
  expect(r.stdout).toContain(".devloop/spec-globs.json");
});

test("[REQ-CFGBASE-5] T1, PR legt .devloop/spec-globs.json NEU an, mit Deckung -> pending", () => {
  const repo = makeRepo({ CODEOWNERS: COVER_CFG });
  branchWith(repo, { ".devloop/spec-globs.json": '["specs/**"]' });
  const r = run(repo, { diffPaths: [".devloop/spec-globs.json"] });
  expect(r.status).toBe(0);
  expect(r.out.pending).toBe(true);
});

test("[REQ-CFGBASE-6] Basis-CODEOWNERS ohne /.devloop/, HEAD-CODEOWNERS mit -> config-unguarded (CODEOWNERS aus der Basis)", () => {
  const repo = makeRepo({ CODEOWNERS: "/src/ @alice\n" });
  branchWith(repo, { CODEOWNERS: "/src/ @alice\n/.devloop/ @mallory\n", ".devloop/protected-globs.json": "[]" });
  const r = run(repo, { diffPaths: ["CODEOWNERS", ".devloop/protected-globs.json"] });
  expect(r.status).toBe(1);
  expect(r.out.reason).toMatch(/^config-unguarded/);
});

test("[REQ-CFGBASE-6] Gegenprobe: Basis deckt /.devloop/, HEAD streicht die Deckung -> pending (Basis zaehlt)", () => {
  const repo = makeRepo({ CODEOWNERS: COVER_CFG });
  branchWith(repo, { CODEOWNERS: "/src/ @alice\n", ".devloop/protected-globs.json": '["**/x"]' });
  const r = run(repo, { diffPaths: ["CODEOWNERS", ".devloop/protected-globs.json"] });
  expect(r.status).toBe(0);
  expect(r.out.ok).toBe(true);
  expect(r.out.pending).toBe(true);
});

// ---------- REQ-CFGBASE-4/5/6: Erstaufnahme und Hinzufuegen einzelner Dateien ----------

test("[REQ-CFGBASE-5][REQ-CFGBASE-6] Erstaufnahme: Basis ohne jeden Config-Pfad, PR legt Skeletons an -> kein config-unguarded, T1 ok", () => {
  const repo = makeRepo({}, false);
  branchWith(repo, {
    ".devloop/tier-map.json": JSON.stringify({ T1: ["**"] }),
    ".devloop/bot-logins.json": '["agent-bot"]',
    ".devloop/protected-globs.json": "[]",
    "src/a.ts": "x\n",
  });
  const r = run(repo, {
    diffPaths: [".devloop/tier-map.json", ".devloop/bot-logins.json", ".devloop/protected-globs.json", "src/a.ts"],
  });
  expect(r.status).toBe(0);
  expect(r.out.ok).toBe(true);
  expect(r.stdout).not.toMatch(/config-unguarded/);
});

test("[REQ-CFGBASE-4] Erstaufnahme: Listen kommen aus dem HEAD-Arbeitsbaum (stryker-Glob im HEAD greift)", () => {
  const repo = makeRepo({}, false);
  branchWith(repo, {
    ".devloop/bot-logins.json": '["agent-bot"]',
    ".devloop/protected-globs.json": '["**/stryker.conf.*"]',
    "stryker.conf.json": "{}",
  });
  const r = run(repo, { diffPaths: [".devloop/protected-globs.json", ".devloop/bot-logins.json", "stryker.conf.json"] });
  expect(r.status).toBe(1);
  expect(r.out.reason).toMatch(/protected-set-touched/);
});

test("[REQ-CFGBASE-4] Basis hat .devloop/, aber keine bot-logins.json; PR fuegt sie hinzu -> Liste aus HEAD, Config-Aenderung", () => {
  const repo = makeRepo({ ".devloop/bot-logins.json": null, CODEOWNERS: "/src/ @alice\n" });
  branchWith(repo, { ".devloop/bot-logins.json": '["bot"]' });
  // ohne Deckung: Config-Aenderung
  const unguarded = run(repo, { diffPaths: [".devloop/bot-logins.json"] });
  expect(unguarded.status).toBe(1);
  expect(unguarded.out.reason).toMatch(/^config-unguarded/);
  // mit Deckung (neuer Basis-Stand): HEAD-Liste ["bot"] gilt, Bot-Approval zaehlt nicht
  const repo2 = makeRepo({ ".devloop/bot-logins.json": null, CODEOWNERS: COVER_CFG });
  branchWith(repo2, { ".devloop/bot-logins.json": '["bot"]' });
  const r = run(repo2, {
    prAuthor: "someone",
    diffPaths: [".devloop/bot-logins.json"],
    reviews: [{ user: "bot", state: "APPROVED", commit_id: "abc123" }],
  });
  expect(r.status).toBe(1);
  expect(r.out.ok).toBe(false);
  expect(r.out.reason).not.toMatch(/config-/);
});

// ---------- REQ-CFGBASE-7: ohne Config-Aenderung wie bisher ----------

test("[REQ-CFGBASE-7] T1, nur src/a.ts, keine Config-Pfade -> ok:true wie bisher (Bot-Approval egal)", () => {
  const repo = makeRepo({ CODEOWNERS: "/src/ @alice\n" });
  const r = run(repo, { diffPaths: ["src/a.ts"], reviews: [{ user: "agent-bot", state: "APPROVED", commit_id: "abc123" }] });
  expect(r.status).toBe(0);
  expect(r.out.ok).toBe(true);
  expect(r.out.pending).toBeFalsy();
});

test("[REQ-CFGBASE-7] T0, nur src/a.ts, ohne CODEOWNERS und ohne Reviews -> ok:true (kein config-unguarded)", () => {
  const repo = makeRepo();
  const r = run(repo, { tier: "T0", diffPaths: ["src/a.ts"] });
  expect(r.status).toBe(0);
  expect(r.out.ok).toBe(true);
});

test("[REQ-CFGBASE-7] aehnliche, aber keine Config-Pfade (src/tier-map.json, docs/.devloop-notes.md, tools/tier-map.json.bak) -> ok:true", () => {
  const repo = makeRepo();
  const r = run(repo, { diffPaths: ["src/tier-map.json", "docs/.devloop-notes.md", "tools/tier-map.json.bak", "x.devloop/a"] });
  expect(r.status).toBe(0);
  expect(r.out.ok).toBe(true);
  expect(r.stdout).not.toMatch(/config-unguarded/);
});

test("[REQ-CFGBASE-7] T2 ohne Review bleibt pending, Gate-Tamper bleibt hart (mit Basis-Globs)", () => {
  const repo = makeRepo();
  const pend = run(repo, { tier: "T2", diffPaths: ["src/a.ts"] });
  expect(pend.status).toBe(0);
  expect(pend.out.pending).toBe(true);
  const tamper = run(repo, { diffPaths: ["stryker.conf.json"] });
  expect(tamper.status).toBe(1);
  expect(tamper.out.reason).toMatch(/protected-set-touched/);
});

test("[REQ-CFGBASE-7] Reihenfolge: Gate-Tamper vor Config-Gate", () => {
  const repo = makeRepo();
  const r = run(repo, { diffPaths: ["stryker.conf.json", ".devloop/protected-globs.json"] });
  expect(r.status).toBe(1);
  expect(r.out.reason).toMatch(/protected-set-touched/);
});

test("[REQ-CFGBASE-7] Reihenfolge: Spec-Gate (spec-unguarded) vor Config-Gate", () => {
  const repo = makeRepo();
  const r = run(repo, { headRef: "devloop/spec/x", diffPaths: ["specs/x/spec.md", ".devloop/protected-globs.json"] });
  expect(r.status).toBe(1);
  expect(r.out.reason).toMatch(/^spec-unguarded/);
});
