import { test, expect, beforeEach, afterEach } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

const run = (headBranch?: string) =>
  spawnSync("node", [cli, repo, "main", ...(headBranch ? [headBranch] : [])], { encoding: "utf8" });

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

test("on a devloop/spec/* branch verify-unskip is a no-op pass — even when a test is edited (spec-to-tests authors tests)", () => {
  git("checkout", "-q", "-b", "devloop/spec/account");
  // spec-to-tests legitimately changes an assertion and re-skips it on the spec PR
  writeFileSync(join(repo, "a.test.ts"), SKIPPED.replace("toBe(42)", "toBe(7)"));
  git("add", "-A");
  commit("spec PR: amend a changed REQ's test");
  const r = run("devloop/spec/account");
  expect(r.status).toBe(0);
  expect(JSON.parse(r.stdout).skipped).toMatch(/spec/i);
});

test("spec PR: a NEW all-skipped test file is allowed (exit 0)", () => {
  git("checkout", "-q", "-b", "spec");
  writeFileSync(join(repo, "b.test.ts"), `import { test, expect } from "vitest";\ntest.skip("REQ-B-1 new", () => { expect(g()).toBe(1); });\n`);
  git("add", "-A");
  commit("spec PR: author new skipped test");
  const r = run();
  expect(r.status).toBe(0);
});

test("spec PR: a NEW file with an active test is blocked (exit 1)", () => {
  git("checkout", "-q", "-b", "spec");
  writeFileSync(join(repo, "b.test.ts"), `import { test, expect } from "vitest";\ntest("REQ-B-1 active", () => { expect(1).toBe(1); });\n`);
  git("add", "-A");
  commit("spec PR: active test smuggled in");
  const r = run();
  expect(r.status).toBe(1);
  expect(JSON.parse(r.stdout).violations[0].file).toBe("b.test.ts");
});

// --- scope: only DEVLOOP-MANAGED test paths are bound by the seam (.devloop/managed-tests.json) ---
// The seam protects the tests spec-to-tests derived from a reviewed spec — not every test file
// in the repo. Without the config file the old, all-encompassing behaviour stands (fail-closed).

const MANAGED = ".devloop/managed-tests.json";
const writeManaged = (globs: unknown) => {
  mkdirSync(join(repo, ".devloop"), { recursive: true });
  writeFileSync(join(repo, MANAGED), JSON.stringify(globs, null, 2) + "\n");
};
const ACTIVE = (name: string) =>
  `import { test, expect } from "vitest";\ntest("${name} works", () => { expect(1).toBe(1); });\n`;

test("an ORDINARY new test file (outside the managed globs) with ACTIVE tests passes — the fehlalarm", () => {
  // the scope lands on main first (that is where the authoritative list is read from)
  writeManaged(["services/**/*.test.ts"]);
  git("add", "-A");
  commit("scope the devloop seam to the caged services");

  git("checkout", "-q", "-b", "chore/tools-dead-members");
  mkdirSync(join(repo, "tools/dead-members"), { recursive: true });
  writeFileSync(join(repo, "tools/dead-members/scan.test.ts"), ACTIVE("scan"));
  git("add", "-A");
  commit("chore: a plain dev tool with its own active tests");

  const r = run();
  expect(r.status).toBe(0);
  const out = JSON.parse(r.stdout);
  expect(out.ok).toBe(true);
  expect(out.violations).toEqual([]);
  expect(out.unmanaged).toContain("tools/dead-members/scan.test.ts");
  expect(out.managedSource).toBe("base");
});

test("a NEW file UNDER a managed glob with an active test still fails (the seam stays sharp)", () => {
  writeManaged(["services/**/*.test.ts"]);
  git("add", "-A");
  commit("scope the devloop seam to the caged services");

  git("checkout", "-q", "-b", "devloop/smuggle");
  mkdirSync(join(repo, "services/forum-service"), { recursive: true });
  writeFileSync(join(repo, "services/forum-service/b.test.ts"), ACTIVE("REQ-B-1"));
  git("add", "-A");
  commit("implement: smuggle an active test into the managed area");

  const r = run();
  expect(r.status).toBe(1);
  const out = JSON.parse(r.stdout);
  expect(out.violations.map((v: { file: string }) => v.file)).toEqual(["services/forum-service/b.test.ts"]);
});

test("an EXISTING managed test file changed beyond removing .skip still fails", () => {
  mkdirSync(join(repo, "services/forum-service"), { recursive: true });
  writeFileSync(join(repo, "services/forum-service/a.test.ts"), SKIPPED);
  writeManaged(["services/**/*.test.ts"]);
  git("add", "-A");
  commit("spec PR: managed skipped test + scope");

  git("checkout", "-q", "-b", "devloop/impl");
  writeFileSync(
    join(repo, "services/forum-service/a.test.ts"),
    SKIPPED.replace("test.skip(", "test(").replace("toBe(42)", "toBe(0)"),
  );
  git("add", "-A");
  commit("implement: tamper with a managed test");

  const r = run();
  expect(r.status).toBe(1);
  expect(JSON.parse(r.stdout).violations[0].file).toBe("services/forum-service/a.test.ts");
});

test("WITHOUT the config file everything behaves exactly as before (fail-closed default)", () => {
  git("checkout", "-q", "-b", "chore/tools-dead-members");
  mkdirSync(join(repo, "tools/dead-members"), { recursive: true });
  writeFileSync(join(repo, "tools/dead-members/scan.test.ts"), ACTIVE("scan"));
  git("add", "-A");
  commit("chore: a plain dev tool with its own active tests");

  const r = run();
  expect(r.status).toBe(1); // the pre-existing (over-broad) behaviour, unchanged
  const out = JSON.parse(r.stdout);
  expect(out.violations[0].file).toBe("tools/dead-members/scan.test.ts");
  expect(out.managedSource).toBe("default");
  expect(out.managed).toMatch(/all-test-files/);
});

test("the BASE list decides: a PR cannot widen its own exemption list", () => {
  // base has a list; the PR tries to replace it with an all-exempting one -> base wins.
  writeManaged(["**/*.test.ts"]);
  git("add", "-A");
  commit("scope: manage every test file");

  git("checkout", "-q", "-b", "devloop/widen");
  writeManaged(["nothing/matches/**"]);
  writeFileSync(join(repo, "b.test.ts"), ACTIVE("REQ-B-1"));
  git("add", "-A");
  commit("implement: widen the exemption AND smuggle an active test");

  const r = run();
  expect(r.status).toBe(1); // the base list decided, not the PR's own
  const out = JSON.parse(r.stdout);
  expect(out.managedSource).toBe("base");
  expect(out.violations[0].file).toBe("b.test.ts");
});

test("a malformed managed-tests.json falls back to managing everything (fail-closed)", () => {
  mkdirSync(join(repo, ".devloop"), { recursive: true });
  writeFileSync(join(repo, MANAGED), '["services/**"\n'); // truncated JSON
  git("add", "-A");
  commit("scope: broken config");

  git("checkout", "-q", "-b", "chore/tools");
  mkdirSync(join(repo, "tools"), { recursive: true });
  writeFileSync(join(repo, "tools/scan.test.ts"), ACTIVE("scan"));
  git("add", "-A");
  commit("chore: active test");

  const r = run();
  expect(r.status).toBe(1);
  expect(JSON.parse(r.stdout).managed).toMatch(/all-test-files/);
});

test("when base has no list, the PR checkout is the fallback source (adoption PR)", () => {
  git("checkout", "-q", "-b", "chore/adopt-managed-tests");
  writeManaged(["services/**/*.test.ts"]); // introduced by THIS PR (touches the protected set)
  mkdirSync(join(repo, "tools/dead-members"), { recursive: true });
  writeFileSync(join(repo, "tools/dead-members/scan.test.ts"), ACTIVE("scan"));
  git("add", "-A");
  commit("chore: adopt the managed-test scope");

  const r = run();
  expect(r.status).toBe(0);
  expect(JSON.parse(r.stdout).managedSource).toBe("worktree");
});
