import { test, expect, beforeEach, afterEach } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";

// Issue #23: what verify-unskip treats as a test file must equal what vitest collects by default
// (**/*.{test,spec}.?(c|m)[jt]s?(x)). Real git repos, default scope (no managed-tests.json).

const here = dirname(fileURLToPath(import.meta.url));
const cli = resolve(here, "../../dist/cli/verify-unskip.js");
const vitestBin = resolve(here, "../../node_modules/vitest/vitest.mjs");

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
const run = () => spawnSync("node", [cli, repo, "main"], { encoding: "utf8" });
const files = (list: { file: string }[]) => list.map((v) => v.file);

const ACTIVE = `import { test } from "vitest";\ntest("evil", () => {});\n`;
const SKIPPED = `import { test } from "vitest";\ntest.skip("REQ-X-1 later", () => {});\n`;
const UNSKIPPED = SKIPPED.replace("test.skip(", "test(");

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "devloop-testext-"));
  git("init", "-q", "-b", "main");
  git("config", "user.name", "t");
  git("config", "user.email", "t@t");
  git("config", "core.quotePath", "true");
  put("README.md", "base\n");
  git("add", "-A");
  commit("base");
  git("checkout", "-q", "-b", "devloop/impl");
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

const addCommit = (rel: string, content: string) => {
  put(rel, content);
  git("add", "-A");
  commit(`implement: add ${rel}`);
};

// ---- REQ-TESTEXT-1: the extra extensions are test files (each file in its own run) ----

for (const f of ["t/a.test.mts", "t/b.test.cts", "t/c.spec.mjs", "t/d.test.cjs", "t/e.test.mtsx"]) {
  test(`[REQ-TESTEXT-1] new active ${f} is a violation (exit 1)`, () => {
    addCommit(f, ACTIVE);
    const r = run();
    expect(r.status).toBe(1);
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(false);
    expect(files(out.violations)).toEqual([f]);
    expect(out.checked).toEqual([f]);
  });
}

test("[REQ-TESTEXT-1] counter-probe: existing skipped t/f.test.mts with only .skip removed passes and is checked", () => {
  git("checkout", "-q", "main");
  put("t/f.test.mts", SKIPPED);
  git("add", "-A");
  commit("base: skipped .mts test");
  git("checkout", "-q", "-b", "devloop/impl2");
  addCommit("t/f.test.mts", UNSKIPPED);
  const r = run();
  expect(r.status).toBe(0);
  const out = JSON.parse(r.stdout);
  expect(out.violations).toEqual([]);
  expect(out.checked).toEqual(["t/f.test.mts"]);
});

// ---- REQ-TESTEXT-2: not-too-wide (counter-probes; green against the old regex by construction) ----

for (const f of ["t/g.mts", "t/h.test.xts", "t/i.test.json", "t/j.test.d.ts", "t/k.test-d.ts"]) {
  test(`[REQ-TESTEXT-2] new active ${f} is NOT a test file (exit 0, not checked)`, () => {
    addCommit(f, ACTIVE);
    const r = run();
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(true);
    expect(out.checked).toEqual([]);
    expect(out.unmanaged).toEqual([]);
    expect(out.violations).toEqual([]);
  });
}

// ---- Effect: seam set == the set vitest collects by default ----

test("[REQ-TESTEXT-1] the seam's checked set equals the set vitest collects (vitest list) for the table's files", () => {
  const all = [
    "t/a.test.mts", "t/b.test.cts", "t/c.spec.mjs", "t/d.test.cjs", "t/e.test.mtsx", "t/f.test.mts",
    "t/g.mts", "t/h.test.xts", "t/i.test.json", "t/j.test.d.ts", "t/k.test-d.ts",
    "t/l.test.ts", "t/m.spec.jsx", "t/n.test.js",
  ];
  put("package.json", '{"type":"module"}\n');
  git("add", "-A");
  commit("implement: package.json");
  for (const f of all) {
    // f is skipped (like an existing spec-authored test), everything else active
    put(f, f === "t/f.test.mts" ? SKIPPED : ACTIVE);
  }
  git("add", "-A");
  commit("implement: all files of the table");

  const t0 = Date.now();
  const v = spawnSync("node", [vitestBin, "list", "--json", "--filesOnly", "--root", repo], {
    cwd: repo,
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  const elapsed = Date.now() - t0;
  expect(v.status, v.stderr).toBe(0);
  const listed = JSON.parse(v.stdout) as { file: string }[];
  const vitestSet = [...new Set(listed.map((e) => relative(repo, e.file).split("\\").join("/")))].sort();
  // Sanity: vitest really collected the repo (otherwise an empty == empty comparison proves nothing).
  expect(vitestSet).toContain("t/l.test.ts");
  expect(vitestSet).toContain("t/e.test.mtsx");
  expect(vitestSet).not.toContain("t/g.mts");

  const r = run();
  const out = JSON.parse(r.stdout);
  expect([...out.checked].sort()).toEqual(vitestSet);
  expect(elapsed).toBeLessThan(20_000);
});
