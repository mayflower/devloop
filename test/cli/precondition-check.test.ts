import { test, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { writeApproval } from "../../src/core/tokens.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const cli = resolve(root, "src/cli/precondition-check.ts");

let repo: string;
let spec: string;

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "devloop-pc-"));
  spec = join(repo, "spec.md");
  writeFileSync(spec, "# Spec\nREQ-X-1: ...\n");
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

function run(req: object) {
  return spawnSync("npx", ["tsx", cli], { encoding: "utf8", input: JSON.stringify(req), cwd: root });
}

test("exits 1 (fail-closed) when the phase token is missing", () => {
  const r = run({ repo, stop: "spec-review", artifactPath: spec });
  expect(r.status).toBe(1);
  expect(JSON.parse(r.stdout).ok).toBe(false);
});

test("exits 0 when the token is valid and no protected diff", () => {
  writeApproval("spec-review", spec, repo);
  const r = run({ repo, stop: "spec-review", artifactPath: spec });
  expect(r.status).toBe(0);
  expect(JSON.parse(r.stdout).ok).toBe(true);
});

test("exits 1 when the diff touches the protected set (gate-tamper)", () => {
  writeApproval("spec-review", spec, repo);
  const r = run({
    repo,
    stop: "spec-review",
    artifactPath: spec,
    diffPaths: ["src/a.ts", "stryker.conf.json"],
    protectedGlobs: ["**/stryker.conf.*"],
  });
  expect(r.status).toBe(1);
  expect(JSON.parse(r.stdout).reason).toMatch(/protected/);
});

test("exits 1 (stale) when the artifact changed after approval", () => {
  writeApproval("spec-review", spec, repo);
  writeFileSync(spec, "# Spec\nREQ-X-1: ... tampered\n");
  const r = run({ repo, stop: "spec-review", artifactPath: spec });
  expect(r.status).toBe(1);
});
