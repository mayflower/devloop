import { test, expect, beforeEach, afterEach } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

// Test the SHIPPED artifact (built dist) with plain node — matches how the plugin/CI run it,
// and avoids tsx's IPC socket (blocked under the sandbox). `npm test` builds dist first (pretest).
const cli = resolve(dirname(fileURLToPath(import.meta.url)), "../../dist/cli/cleanup.js");

let repo: string;
const git = (...args: string[]) =>
  execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" },
  });
const commit = (msg: string) => git("-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", msg);

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "devloop-clean-"));
  git("init", "-b", "main");
  commit("root");
  // a merged branch (tip reachable from main)
  git("branch", "devloop/done");
  // an unmerged branch (has its own commit)
  git("checkout", "-b", "devloop/wip");
  commit("wip work");
  git("checkout", "main");
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

function run(...args: string[]) {
  return spawnSync("node", [cli, repo, ...args], { encoding: "utf8" });
}

test("dry-run plans the merged branch for deletion and keeps unmerged + main + current", () => {
  const r = run();
  expect(r.status).toBe(0);
  const out = JSON.parse(r.stdout);
  expect(out.applied).toBe(false);
  expect(out.plan.delete.map((d: { name: string }) => d.name)).toEqual(["devloop/done"]);
  const kept = out.plan.keep.map((k: { name: string }) => k.name).sort();
  expect(kept).toContain("devloop/wip"); // not merged -> kept
  expect(kept).toContain("main"); // protected + current -> kept
});

test("--apply deletes the merged branch but never the unmerged one", () => {
  const r = run("--apply");
  expect(r.status).toBe(0);
  const branches = git("branch", "--format=%(refname:short)").split("\n").filter(Boolean);
  expect(branches).not.toContain("devloop/done"); // pruned
  expect(branches).toContain("devloop/wip"); // unmerged work preserved
  expect(branches).toContain("main");
});
