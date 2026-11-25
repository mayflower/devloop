import { test, expect, beforeEach, afterEach } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

// Additions of the implementation station (the given tests stay untouched): they pin two
// things the given suite lets slip through (found by mutation).

const cli = resolve(dirname(fileURLToPath(import.meta.url)), "../../dist/cli/verify-unskip.js");
let repo: string;
const git = (...a: string[]) =>
  execFileSync("git", ["-C", repo, ...a], {
    encoding: "utf8",
    env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" },
  });
const commit = (m: string) => git("-c", "commit.gpgsign=false", "commit", "-q", "-m", m);
const put = (rel: string, c: string) => {
  mkdirSync(dirname(join(repo, rel)), { recursive: true });
  writeFileSync(join(repo, rel), c);
};
const run = () => spawnSync("node", [cli, repo, "main"], { encoding: "utf8" });

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "devloop-unskipcontent-x-"));
  git("init", "-q", "-b", "main");
  git("config", "user.name", "t");
  git("config", "user.email", "t@t");
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

test("[REQ-UNSKIPCONTENT-5] base managed-tests.json as a symlink: exit 1 with NO result JSON (not a default-scope verdict)", () => {
  put("a.test.ts", "// x\n");
  mkdirSync(join(repo, ".devloop"), { recursive: true });
  symlinkSync("[]", join(repo, ".devloop/managed-tests.json"));
  git("add", "-A");
  commit("base");
  git("checkout", "-q", "-b", "devloop/impl");
  put("tools/x.test.ts", 'import { test } from "vitest";\ntest("evil", () => {});\n');
  git("add", "-A");
  commit("impl");
  const r = run();
  expect(r.status).toBe(1);
  expect(r.stdout).toBe("");
  expect(r.stderr).toContain("managed-tests.json");
  expect(r.stderr).toMatch(/symlink/);
});

test("[REQ-UNSKIPCONTENT-4] a managed test file replaced by a directory: violation naming the type", () => {
  put("d.test.ts", 'import { test } from "vitest";\ntest.skip("REQ-X-1 a", () => {});\n');
  git("add", "-A");
  commit("base");
  git("checkout", "-q", "-b", "devloop/impl");
  unlinkSync(join(repo, "d.test.ts"));
  put("d.test.ts/inner.ts", "export {};\n");
  git("add", "-A");
  commit("impl");
  const r = run();
  expect(r.status).toBe(1);
  const v = JSON.parse(r.stdout).violations as { file: string; reason: string }[];
  const d = v.find((x) => x.file === "d.test.ts");
  expect(d?.reason).toMatch(/tree/);
});
