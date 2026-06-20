import { test, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const cli = resolve(dirname(fileURLToPath(import.meta.url)), "../../dist/cli/verify-review.js");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function run(req: object) {
  return spawnSync("node", [cli], { encoding: "utf8", input: JSON.stringify(req), cwd: root });
}

const base = {
  prAuthor: "agent-bot",
  headSha: "abc123",
  botLogins: ["agent-bot"],
};

test("exit 0 when a human approved HEAD and the diff is clean", () => {
  const r = run({ ...base, reviews: [{ user: "alice", state: "APPROVED", commit_id: "abc123" }] });
  expect(r.status).toBe(0);
  expect(JSON.parse(r.stdout).ok).toBe(true);
});

test("exit 0 (pending) when NOBODY has approved yet — no stale FAILURE on a fresh PR", () => {
  // The authoritative 'must be approved' block is branch protection's CODEOWNER requirement,
  // not this check. A fresh PR with zero approvals must NOT leave a failing run that lingers
  // and blocks the merge after a later approve (the cross-event stale-FAILURE bug).
  const r = run({ ...base, reviews: [] });
  expect(r.status).toBe(0);
  expect(JSON.parse(r.stdout).pending).toBe(true);
  const onlyComment = run({ ...base, reviews: [{ user: "alice", state: "COMMENTED", commit_id: "abc123" }] });
  expect(onlyComment.status).toBe(0);
});

test("exit 1 when an approval is PRESENT but invalid — only the agent bot 'approved' (self-approve attempt)", () => {
  const r = run({ ...base, reviews: [{ user: "agent-bot", state: "APPROVED", commit_id: "abc123" }] });
  expect(r.status).toBe(1);
  expect(JSON.parse(r.stdout).reason).toMatch(/missing/);
});

test("exit 1 when the approval is stale (older commit)", () => {
  const r = run({ ...base, reviews: [{ user: "alice", state: "APPROVED", commit_id: "old" }] });
  expect(r.status).toBe(1);
  expect(JSON.parse(r.stdout).reason).toMatch(/stale/);
});

test("exit 1 when an approved diff touches the protected set", () => {
  const r = run({
    ...base,
    reviews: [{ user: "alice", state: "APPROVED", commit_id: "abc123" }],
    diffPaths: ["src/a.ts", "stryker.conf.json"],
    protectedGlobs: ["**/stryker.conf.*"],
  });
  expect(r.status).toBe(1);
  expect(JSON.parse(r.stdout).reason).toMatch(/protected/);
});
