import { test, expect, beforeEach, afterEach } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

// Issue #12: verify-unskip must see EVERY changed test path (no rename detection, no quoting)
// and must fail closed when the diff cannot be computed. Real git repos, no git stub.

const cli = resolve(dirname(fileURLToPath(import.meta.url)), "../../dist/cli/verify-unskip.js");

let repo: string;
const git = (...args: string[]) =>
  execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" },
  });
const commit = (m: string) => git("-c", "commit.gpgsign=false", "commit", "-q", "-m", m);
const put = (rel: string, content: string) => {
  mkdirSync(dirname(join(repo, rel)), { recursive: true });
  writeFileSync(join(repo, rel), content);
};
const run = (baseRef = "main", headBranch?: string) =>
  spawnSync("node", [cli, repo, baseRef, ...(headBranch ? [headBranch] : [])], { encoding: "utf8" });
const files = (list: { file: string }[]) => list.map((v) => v.file);

// Several tests per file, so a one-assertion edit keeps the similarity far above git's 50%
// rename threshold: git WOULD pair the rename, which is exactly what must not hide the old path.
const SKIPPED = `import { test, expect } from "vitest";
test.skip("REQ-X-1 first behaviour of the thing", () => { expect(first()).toBe(1); });
test.skip("REQ-X-2 second behaviour of the thing", () => { expect(second()).toBe(2); });
test.skip("REQ-X-3 third behaviour of the thing", () => { expect(third()).toBe(3); });
test.skip("REQ-X-4 fourth behaviour of the thing", () => { expect(fourth()).toBe(4); });
`;
const UNSKIPPED = SKIPPED.replaceAll("test.skip(", "test(");
const TAMPERED = SKIPPED.replace("toBe(1)", "toBe(99)");
const UMLAUT = "größe.test.ts";

const startPr = () => git("checkout", "-q", "-b", "devloop/impl");

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "devloop-unskipdiff-"));
  git("init", "-q", "-b", "main");
  git("config", "user.name", "t");
  git("config", "user.email", "t@t");
  git("config", "core.quotePath", "true");
  git("config", "diff.renames", "true");
  put("a.test.ts", SKIPPED);
  put("b.test.ts", SKIPPED);
  put(UMLAUT, SKIPPED);
  git("add", "-A");
  commit("base: skipped tests on main");
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

test("[REQ-UNSKIPDIFF-2] umlaut test file with a changed assertion is a violation (exit 1, plain path)", () => {
  startPr();
  put(UMLAUT, TAMPERED.replaceAll("test.skip(", "test("));
  git("add", "-A");
  commit("implement: tamper with the umlaut test");
  const r = run();
  expect(r.status).toBe(1);
  const out = JSON.parse(r.stdout);
  expect(out.ok).toBe(false);
  expect(files(out.violations)).toEqual([UMLAUT]);
  expect(out.checked).toEqual([UMLAUT]);
});

test("[REQ-UNSKIPDIFF-2] counter-probe: umlaut test file with only .skip removed passes and is checked", () => {
  startPr();
  put(UMLAUT, UNSKIPPED);
  git("add", "-A");
  commit("implement: activate the umlaut test");
  const r = run();
  expect(r.stderr).toBe("");
  expect(r.status).toBe(0);
  const out = JSON.parse(r.stdout);
  expect(out.ok).toBe(true);
  expect(out.violations).toEqual([]);
  expect(out.checked).toEqual([UMLAUT]);
});

test("[REQ-UNSKIPDIFF-2] umlaut path with a space and a quote character is checked like any other", () => {
  const odd = 'größe "x" y.test.ts';
  put(odd, SKIPPED);
  git("add", "-A");
  commit("base: odd name");
  startPr();
  put(odd, TAMPERED.replaceAll("test.skip(", "test("));
  git("add", "-A");
  commit("implement: tamper");
  const r = run();
  expect(r.status).toBe(1);
  expect(files(JSON.parse(r.stdout).violations)).toEqual([odd]);
});

test("[REQ-UNSKIPDIFF-1] git mv b.test.ts b.ts.bak: the deleted old path is a violation", () => {
  startPr();
  git("mv", "b.test.ts", "b.ts.bak");
  git("add", "-A");
  commit("implement: hide a managed test behind a non-test name");
  const r = run();
  expect(r.status).toBe(1);
  const out = JSON.parse(r.stdout);
  expect(out.ok).toBe(false);
  expect(files(out.violations)).toContain("b.test.ts");
});

test("[REQ-UNSKIPDIFF-1] rename a.test.ts to c.test.ts with a changed, still skipped assertion: exit 1 on the old path", () => {
  startPr();
  git("mv", "a.test.ts", "c.test.ts");
  put("c.test.ts", TAMPERED);
  git("add", "-A");
  commit("implement: rename and rewrite a skipped test");
  // Precondition of the scenario: with rename detection git pairs the two paths.
  expect(git("diff", "--name-status", "main...HEAD")).toMatch(/^R\d+\s+a\.test\.ts\s+c\.test\.ts/m);
  const r = run();
  expect(r.status).toBe(1);
  const out = JSON.parse(r.stdout);
  expect(files(out.violations)).toContain("a.test.ts");
  expect(out.checked).toContain("a.test.ts");
  expect(out.checked).toContain("c.test.ts");
});

test("[REQ-UNSKIPDIFF-4] a deleted test file (no rename) is a violation", () => {
  startPr();
  git("rm", "-q", "a.test.ts");
  commit("implement: delete a managed test");
  const r = run();
  expect(r.status).toBe(1);
  expect(files(JSON.parse(r.stdout).violations)).toEqual(["a.test.ts"]);
});

test("[REQ-UNSKIPDIFF-3] unresolvable base ref fails with exit 1 and names the base", () => {
  startPr();
  put("a.test.ts", UNSKIPPED);
  git("add", "-A");
  commit("implement: activate");
  const r = run("origin/gibtsnicht");
  expect(r.status).toBe(1);
  expect(r.stdout + r.stderr).toContain("origin/gibtsnicht");
  // must not claim a green result
  expect(r.stdout).not.toMatch(/"ok":\s*true/);
});

test("[REQ-UNSKIPDIFF-4] on a devloop/spec/* branch all of these changes are a no-op pass (exit 0)", () => {
  git("checkout", "-q", "-b", "devloop/spec/x");
  put(UMLAUT, TAMPERED.replaceAll("test.skip(", "test("));
  git("mv", "b.test.ts", "b.ts.bak");
  git("rm", "-q", "a.test.ts");
  git("add", "-A");
  commit("spec PR: amend, rename, delete");
  const r = run("main", "devloop/spec/x");
  expect(r.status).toBe(0);
  const out = JSON.parse(r.stdout);
  expect(out.ok).toBe(true);
  expect(out.skipped).toMatch(/spec/i);
});

test("[REQ-UNSKIPDIFF-4] umlaut test outside managed-tests.json is reported as unmanaged, not checked (exit 0)", () => {
  put(".devloop/managed-tests.json", JSON.stringify(["services/**/*.test.ts"]) + "\n");
  git("add", "-A");
  commit("scope the seam to services");
  startPr();
  put(UMLAUT, TAMPERED.replaceAll("test.skip(", "test("));
  git("add", "-A");
  commit("chore: edit an unmanaged umlaut test");
  const r = run();
  expect(r.status).toBe(0);
  const out = JSON.parse(r.stdout);
  expect(out.ok).toBe(true);
  expect(out.unmanaged).toEqual([UMLAUT]);
  expect(out.checked).toEqual([]);
  expect(out.violations).toEqual([]);
  expect(out.managedSource).toBe("base");
});
