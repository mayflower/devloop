// [REQ-GLOBNL-*] Globs passen auch auf Pfade mit Zeilenende (#15). Glob-Unit plus CLI-Tests gegen dist/
// in temporaeren Git-Repos mit echter Basis. Die Pfade mit Zeilenende werden echt angelegt, committed
// und wie in der Action per `git diff --no-renames -z --name-only` gelesen.
import { test, expect, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { globToRegExp, matchesAnyGlob } from "../../src/core/glob.js";
import { deriveTier } from "../../src/core/tier.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const verifyCli = join(root, "dist/cli/verify-review.js");
const deriveCli = join(root, "dist/cli/derive-tier.js");

const EOLS: Array<[string, string]> = [
  ["LF", "\n"],
  ["CR", "\r"],
  ["U+2028", " "],
  ["U+2029", " "],
];

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function git(repo: string, ...args: string[]): string {
  const r = spawnSync("git", ["-c", "commit.gpgsign=false", ...args], { cwd: repo, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout;
}

function write(repo: string, rel: string, content: string): void {
  const p = join(repo, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
}

// Basis-Commit auf Branch "base", dann Branch "head" mit den angegebenen Pfaden. Gibt diffPaths so
// zurueck, wie die Action sie liefert: NUL-getrennt, ungequotet.
function repoWithChange(
  baseFiles: Record<string, string>,
  changed: string[],
  content = "neu\n",
): { repo: string; diffPaths: string[] } {
  const repo = mkdtempSync(join(tmpdir(), "glob-zeilenende-"));
  dirs.push(repo);
  git(repo, "init", "-q", "-b", "base");
  git(repo, "config", "user.name", "Test");
  git(repo, "config", "user.email", "test@example.invalid");
  write(repo, "README.md", "x\n");
  for (const [p, c] of Object.entries(baseFiles)) write(repo, p, c);
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "base");
  git(repo, "checkout", "-q", "-b", "head");
  for (const p of changed) write(repo, p, content);
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "head");
  const raw = git(repo, "diff", "--no-renames", "-z", "--name-only", "base", "HEAD");
  const diffPaths = raw.split("\0").filter((s) => s !== "");
  return { repo, diffPaths };
}

function runVerify(repo: string, req: object) {
  const r = spawnSync("node", [verifyCli], {
    encoding: "utf8",
    cwd: root,
    input: JSON.stringify({
      prAuthor: "agent-bot",
      headSha: "abc123",
      botLogins: ["agent-bot"],
      protectedGlobs: [],
      tier: "T0",
      baseRef: "base",
      reviews: [],
      repo,
      ...req,
    }),
  });
  let out: any = {};
  try {
    out = JSON.parse(r.stdout);
  } catch {
    /* Assertions auf out schlagen mit klarem Diff fehl */
  }
  return { status: r.status, out, stdout: r.stdout };
}

function runDerive(req: object) {
  const r = spawnSync("node", [deriveCli], { encoding: "utf8", cwd: root, input: JSON.stringify(req) });
  return { status: r.status, out: JSON.parse(r.stdout) };
}

// --- Glob-Unit (REQ-GLOBNL-1) ---

for (const [name, x] of EOLS) {
  test(`[REQ-GLOBNL-1] **/spec.md passt auf specs/a<${name}>b/spec.md`, () => {
    expect(globToRegExp("**/spec.md").test(`specs/a${x}b/spec.md`)).toBe(true);
    expect(matchesAnyGlob(`specs/a${x}b/spec.md`, ["**/spec.md"])).toBe(true);
  });

  test(`[REQ-GLOBNL-1] **/ passt auf ein Verzeichnis, das mit <${name}> endet`, () => {
    expect(globToRegExp("**/spec.md").test(`a${x}/spec.md`)).toBe(true);
  });

  test(`[REQ-GLOBNL-1] services/** passt auf services/a<${name}>b/x.ts`, () => {
    expect(globToRegExp("services/**").test(`services/a${x}b/x.ts`)).toBe(true);
  });

  test(`[REQ-GLOBNL-1] specs/*/spec.md passt auf specs/a<${name}>b/spec.md (* innerhalb des Segments)`, () => {
    expect(globToRegExp("specs/*/spec.md").test(`specs/a${x}b/spec.md`)).toBe(true);
    expect(globToRegExp("specs/?/spec.md").test(`specs/${x}/spec.md`)).toBe(true);
  });

  test(`[REQ-GLOBNL-1] specs/*/spec.md passt NICHT auf specs/a/b<${name}>/spec.md (* ueberschreitet kein /)`, () => {
    expect(globToRegExp("specs/*/spec.md").test(`specs/a/b${x}/spec.md`)).toBe(false);
    expect(globToRegExp("specs/?/spec.md").test(`specs/a${x}/spec.md`)).toBe(false);
  });

  test(`[REQ-GLOBNL-1] *.md passt auf a.md<${name}> nicht (Endanker), a<${name}>.md passt`, () => {
    expect(globToRegExp("*.md").test(`a.md${x}`)).toBe(false);
    expect(globToRegExp("*.md").test(`a.md${x}x`)).toBe(false);
    expect(globToRegExp("*.md").test(`a${x}.md`)).toBe(true);
  });

  test(`[REQ-GLOBNL-1] Anker am Anfang: x<${name}>specs/a/spec.md passt nicht auf specs/**`, () => {
    expect(globToRegExp("specs/**").test(`x${x}specs/a/spec.md`)).toBe(false);
  });
}

test("[REQ-GLOBNL-1] *.md: a.md passt, a.md<LF> passt nicht, a.md<LF>x passt nicht (Zeilenanker)", () => {
  expect(globToRegExp("*.md").test("a.md")).toBe(true);
  expect(globToRegExp("*.md").test("a.md\n")).toBe(false);
  expect(globToRegExp("*.md").test("a.md\nx")).toBe(false);
  expect(globToRegExp("*.md").test("x\na.md")).toBe(true); // * darf das Zeilenende im Segment schlucken
});

// --- verify-review: Spec-Gate (REQ-GLOBNL-2) ---

for (const [name, x] of EOLS) {
  test(`[REQ-GLOBNL-2] Spec-Pfad mit <${name}>, Basis ohne CODEOWNERS -> spec-unguarded (nicht pending)`, () => {
    const p = `specs/a${x}b/spec.md`;
    const { repo, diffPaths } = repoWithChange({}, [p]);
    expect(diffPaths).toEqual([p]); // der Pfad kam unveraendert und ungequotet an
    const r = runVerify(repo, { headRef: "devloop/x", diffPaths });
    expect(r.status).toBe(1);
    expect(r.out.ok).toBe(false);
    expect(r.out.reason).toMatch(/^spec-unguarded/);
    expect(r.out.pending).toBeUndefined();
  });
}

test("[REQ-GLOBNL-2] Spec-Pfad mit <LF>, Basis-CODEOWNERS deckt specs/ -> Gate besteht (pending)", () => {
  const { repo, diffPaths } = repoWithChange({ CODEOWNERS: "/specs/ @alice\n" }, ["specs/a\nb/spec.md"]);
  const r = runVerify(repo, { headRef: "devloop/x", diffPaths });
  expect(r.status).toBe(0);
  expect(r.out.ok).toBe(true);
  expect(r.out.pending).toBe(true);
});

// --- verify-review: Tamper (REQ-GLOBNL-3) ---

for (const [name, x] of EOLS) {
  test(`[REQ-GLOBNL-3] Pfad .github/workflows/a<${name}>b.yml im Protected-Set der Basis -> Tamper-Alarm`, () => {
    const p = `.github/workflows/a${x}b.yml`;
    const { repo, diffPaths } = repoWithChange(
      {
        ".devloop/protected-globs.json": JSON.stringify([".github/**"]),
        ".devloop/bot-logins.json": JSON.stringify(["agent-bot"]),
        CODEOWNERS: "/specs/ @alice\n",
      },
      [p],
    );
    expect(diffPaths).toEqual([p]);
    // protectedGlobs nicht auf stdin: sie kommen aus der Basis
    const r = runVerify(repo, { headRef: "devloop/x", diffPaths, protectedGlobs: undefined, botLogins: undefined });
    expect(r.status).toBe(1);
    expect(r.out.ok).toBe(false);
    expect(r.out.reason).toMatch(/^protected-set-touched/);
  });
}

test("[REQ-GLOBNL-3] Gegenprobe: Pfad mit <LF> ausserhalb des Protected-Sets loest keinen Tamper-Alarm aus", () => {
  const { repo, diffPaths } = repoWithChange(
    {
      ".devloop/protected-globs.json": JSON.stringify([".github/**"]),
      ".devloop/bot-logins.json": JSON.stringify(["agent-bot"]),
    },
    ["src/a\nb.ts"],
  );
  const r = runVerify(repo, { headRef: "devloop/x", diffPaths, protectedGlobs: undefined, botLogins: undefined });
  expect(String(r.out.reason ?? "")).not.toMatch(/protected-set-touched/);
});

// --- derive-tier (REQ-GLOBNL-4) ---

const tierMap = { T2: ["services/**"], default: "T1" as const };

for (const [name, x] of EOLS) {
  test(`[REQ-GLOBNL-4] deriveTier: services/a<${name}>b/x.ts -> T2, nicht Default T1`, () => {
    expect(deriveTier([`services/a${x}b/x.ts`], tierMap)).toBe("T2");
  });

  test(`[REQ-GLOBNL-4] derive-tier-CLI mit echtem -z-Diff: Pfad mit <${name}> -> T2`, () => {
    const p = `services/a${x}b/x.ts`;
    const { repo, diffPaths } = repoWithChange({}, [p]);
    expect(diffPaths).toEqual([p]);
    const r = runDerive({ touched: diffPaths, repo, tierMap });
    expect(r.status).toBe(0);
    expect(r.out.tier).toBe("T2");
  });
}

// --- Regression ohne Zeilenende (REQ-GLOBNL-5) ---

test("[REQ-GLOBNL-5] Glob-Ergebnisse fuer Pfade ohne Zeilenende unveraendert", () => {
  const cases: Array<[string, string, boolean]> = [
    ["**/spec.md", "specs/a/spec.md", true],
    ["**/spec.md", "spec.md", true],
    ["**/spec.md", "specs/a/spec.md.bak", false],
    ["**/spec.md", "xspec.md", false],
    ["services/**", "services/a/b/x.ts", true],
    ["services/**", "service/a.ts", false],
    ["specs/*/spec.md", "specs/a/spec.md", true],
    ["specs/*/spec.md", "specs/a/b/spec.md", false],
    ["*.md", "a.md", true],
    ["*.md", "dir/a.md", false],
    ["a?c", "abc", true],
    ["a?c", "a/c", false],
    ["a?c", "ac", false],
    ["a.b", "axb", false],
    ["a+b(c)", "a+b(c)", true],
  ];
  for (const [g, p, want] of cases) expect([g, p, globToRegExp(g).test(p)]).toEqual([g, p, want]);
});

test("[REQ-GLOBNL-5] derive-tier und verify-review ohne Zeilenende wie bisher", () => {
  expect(deriveTier(["services/a/x.ts"], tierMap)).toBe("T2");
  expect(deriveTier(["other/x.ts"], tierMap)).toBe("T1");
  const { repo, diffPaths } = repoWithChange({}, ["specs/x/spec.md"]);
  const r = runVerify(repo, { headRef: "devloop/x", diffPaths });
  expect(r.out.reason).toMatch(/^spec-unguarded/);
});

// --- weitere Nutzer von globToRegExp (REQ-GLOBNL-1, -4): jeder Nutzer wird einzeln ueber die CLI geprueft ---

const unskipCli = join(root, "dist/cli/verify-unskip.js");
const ACTIVE_TEST = 'import { test } from "vitest";\ntest("evil", () => {});\n';

for (const [name, x] of EOLS) {
  // Config-Gate (config-change.ts): Pfad mit Zeilenende unter .devloop/ ist ein Config-Pfad.
  test(`[REQ-GLOBNL-1] Config-Gate: .devloop/a<${name}>b.json, Basis-CODEOWNERS deckt .devloop nicht -> config-unguarded`, () => {
    const p = `.devloop/a${x}b.json`;
    const { repo, diffPaths } = repoWithChange(
      { ".devloop/bot-logins.json": '["agent-bot"]', CODEOWNERS: "/specs/ @alice\n" },
      [p],
    );
    expect(diffPaths).toEqual([p]);
    const r = runVerify(repo, { headRef: "devloop/x", diffPaths });
    expect(r.status).toBe(1);
    expect(r.out.ok).toBe(false);
    expect(r.out.reason).toMatch(/^config-unguarded/);
  });

  // verify-unskip (managed-tests.ts): Testdatei in Verzeichnis mit Zeilenende liegt im verwalteten Scope.
  test(`[REQ-GLOBNL-1] verify-unskip: aktive Testdatei test/a<${name}>b/x.test.ts bei managed-tests ["test/**"] -> Verstoss, Exit 1`, () => {
    const p = `test/a${x}b/x.test.ts`;
    const { repo, diffPaths } = repoWithChange({ ".devloop/managed-tests.json": '["test/**"]' }, [p], ACTIVE_TEST);
    expect(diffPaths).toEqual([p]);
    const r = spawnSync("node", [unskipCli, repo, "base"], { encoding: "utf8" });
    expect(r.status).toBe(1);
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(false);
    expect(out.unmanaged).toEqual([]);
    expect(out.checked).toEqual([p]);
    expect(out.violations.map((v: { file: string }) => v.file)).toEqual([p]);
  });

  // CODEOWNERS-Gate (codeowners.ts): Pfad mit Zeilenende, Tier T3 per Basis-tier-map.
  test(`[REQ-GLOBNL-4] CODEOWNERS-Gate: services/a<${name}>b/x.ts (T3), Basis-CODEOWNERS ohne services -> codeowners-unguarded`, () => {
    const p = `services/a${x}b/x.ts`;
    const { repo, diffPaths } = repoWithChange(
      { ".devloop/tier-map.json": JSON.stringify({ T3: ["services/**"], default: "T1" }), CODEOWNERS: "/src/ @alice\n" },
      [p],
    );
    expect(diffPaths).toEqual([p]);
    const r = runVerify(repo, { headRef: "devloop/x", diffPaths });
    expect(r.status).toBe(1);
    expect(r.out.ok).toBe(false);
    expect(r.out.reason).toMatch(/^codeowners-unguarded/);
  });

  test(`[REQ-GLOBNL-4] CODEOWNERS-Gate: gleicher Pfad mit <${name}>, Basis-CODEOWNERS deckt /services/ -> kein codeowners-unguarded`, () => {
    const p = `services/a${x}b/x.ts`;
    const { repo, diffPaths } = repoWithChange(
      { ".devloop/tier-map.json": JSON.stringify({ T3: ["services/**"], default: "T1" }), CODEOWNERS: "/services/ @alice\n" },
      [p],
    );
    const r = runVerify(repo, { headRef: "devloop/x", diffPaths });
    expect(String(r.out.reason ?? "")).not.toMatch(/codeowners-unguarded/);
  });
}
