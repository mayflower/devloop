import { test, expect, beforeEach, afterEach } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const cli = resolve(dirname(fileURLToPath(import.meta.url)), "../../dist/cli/verify-unskip.js");

let repo: string;
const git = (...args: string[]) =>
  execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" },
  });
const commit = (m: string) => git("-c", "commit.gpgsign=false", "commit", "-q", "-m", m);

const SKIPPED = `import { test, expect } from "vitest";
test.skip("REQ-A-1 works", () => { expect(thing()).toBe(42); });
`;

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "devloop-unskip-"));
  git("init", "-q", "-b", "main");
  writeFileSync(join(repo, "a.test.ts"), SKIPPED);
  git("add", "-A");
  commit("spec PR: skipped test on main");
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

const run = () => spawnSync("node", [cli, repo, "main"], { encoding: "utf8" });

test("exit 0 when implement only removed .skip", () => {
  git("checkout", "-q", "-b", "impl");
  writeFileSync(join(repo, "a.test.ts"), SKIPPED.replace("test.skip(", "test("));
  git("add", "-A");
  commit("implement: activate test");
  const r = run();
  expect(r.status).toBe(0);
  expect(JSON.parse(r.stdout).ok).toBe(true);
});

test("exit 1 when implement also edited an assertion", () => {
  git("checkout", "-q", "-b", "impl");
  writeFileSync(join(repo, "a.test.ts"), SKIPPED.replace("test.skip(", "test(").replace("toBe(42)", "toBe(0)"));
  git("add", "-A");
  commit("implement: tamper with the test");
  const r = run();
  expect(r.status).toBe(1);
  expect(JSON.parse(r.stdout).violations[0].file).toBe("a.test.ts");
});
