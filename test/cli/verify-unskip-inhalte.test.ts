import { test, expect, beforeEach, afterEach } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

// Issues #19/#20: verify-unskip must read contents completely (any size), tell "path absent"
// from a read error, and treat non-regular entries (symlink, gitlink) as violations.
// Real git repos, no git stub.

const cli = resolve(dirname(fileURLToPath(import.meta.url)), "../../dist/cli/verify-unskip.js");
const MIB = 1_048_576;

let repo: string;
const git = (...args: string[]) =>
  execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" },
  });
const gitOk = (...args: string[]): boolean => {
  try {
    execFileSync("git", ["-C", repo, ...args], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};
const commit = (m: string) => git("-c", "commit.gpgsign=false", "commit", "-q", "-m", m);
const put = (rel: string, content: string) => {
  mkdirSync(dirname(join(repo, rel)), { recursive: true });
  writeFileSync(join(repo, rel), content);
};
const run = (headBranch?: string) =>
  spawnSync("node", [cli, repo, "main", ...(headBranch ? [headBranch] : [])], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const files = (list: { file: string }[]) => list.map((v) => v.file);
const startPr = () => git("checkout", "-q", "-b", "devloop/impl");

const SKIPPED = `import { test, expect } from "vitest";
test.skip("REQ-X-1 first behaviour", () => { expect(first()).toBe(1); });
test.skip("REQ-X-2 second behaviour", () => { expect(second()).toBe(2); });
`;
const ACTIVE = `import { test, expect } from "vitest";
test("evil", () => { expect(1).toBe(1); });
`;
// ~1.2 MB of comment lines: above the 1 MiB default maxBuffer of execFileSync
const PADDING = ("// " + "x".repeat(77) + "\n").repeat(15_000);
const blobSize = (spec: string) => Number(git("cat-file", "-s", spec).trim());
const modeOf = (rel: string, ref = "HEAD") => git("ls-tree", ref, "--", rel).split(" ")[0];
const looseObject = (spec: string) => {
  const sha = git("rev-parse", spec).trim();
  return join(repo, ".git/objects", sha.slice(0, 2), sha.slice(2));
};

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "devloop-unskipcontent-"));
  git("init", "-q", "-b", "main");
  git("config", "user.name", "t");
  git("config", "user.email", "t@t");
  git("config", "core.quotePath", "true");
  put("a.test.ts", SKIPPED);
  git("add", "-A");
  commit("base: skipped test on main");
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

// ---------- REQ-1: size ----------

test("[REQ-UNSKIPCONTENT-1] new 1.2 MB test file with an ACTIVE test is a violation", () => {
  startPr();
  put("big.test.ts", ACTIVE + PADDING);
  git("add", "-A");
  commit("implement: evil test hidden in a big file");
  expect(blobSize("HEAD:big.test.ts")).toBeGreaterThan(MIB);
  const r = run();
  expect(r.status).toBe(1);
  const out = JSON.parse(r.stdout);
  expect(out.ok).toBe(false);
  expect(files(out.violations)).toEqual(["big.test.ts"]);
});

test("[REQ-UNSKIPCONTENT-1] counter-probe: new 1.2 MB file with all tests skipped passes and is checked (already green: today an empty read is 'allowed' by accident)", () => {
  startPr();
  put("big.test.ts", SKIPPED + PADDING);
  git("add", "-A");
  commit("spec-like: big skipped file");
  expect(blobSize("HEAD:big.test.ts")).toBeGreaterThan(MIB);
  const r = run();
  expect(r.status).toBe(0);
  const out = JSON.parse(r.stdout);
  expect(out.violations).toEqual([]);
  expect(out.checked).toEqual(["big.test.ts"]);
});

test("[REQ-UNSKIPCONTENT-1] base test of 1.2 MB, skipped: changing an assertion is a violation", () => {
  put("big.test.ts", SKIPPED + PADDING);
  git("add", "-A");
  commit("base: big managed test");
  startPr();
  put("big.test.ts", (SKIPPED + PADDING).replace("toBe(1)", "toBe(99)").replaceAll("test.skip(", "test("));
  git("add", "-A");
  commit("implement: tamper with the big test");
  expect(blobSize("main:big.test.ts")).toBeGreaterThan(MIB);
  expect(blobSize("HEAD:big.test.ts")).toBeGreaterThan(MIB);
  const r = run();
  expect(r.status).toBe(1);
  expect(files(JSON.parse(r.stdout).violations)).toEqual(["big.test.ts"]);
});

test("[REQ-UNSKIPCONTENT-1] counter-probe: base test of 1.2 MB, only .skip removed passes (already green: both reads fail identically today)", () => {
  put("big.test.ts", SKIPPED + PADDING);
  git("add", "-A");
  commit("base: big managed test");
  startPr();
  put("big.test.ts", (SKIPPED + PADDING).replaceAll("test.skip(", "test("));
  git("add", "-A");
  commit("implement: activate the big test");
  expect(blobSize("main:big.test.ts")).toBeGreaterThan(MIB);
  const r = run();
  expect(r.status).toBe(0);
  const out = JSON.parse(r.stdout);
  expect(out.violations).toEqual([]);
  expect(out.checked).toEqual(["big.test.ts"]);
});

// ---------- REQ-4: symlink / gitlink ----------

test("[REQ-UNSKIPCONTENT-4] new test/c.test.ts as a symlink to a helper with an ACTIVE test: violation naming the symlink", () => {
  startPr();
  put("test/helper.ts", ACTIVE);
  symlinkSync("helper.ts", join(repo, "test/c.test.ts"));
  git("add", "-A");
  commit("implement: symlink smuggles an active test");
  expect(modeOf("test/c.test.ts")).toBe("120000");
  const r = run();
  expect(r.status).toBe(1);
  const v = JSON.parse(r.stdout).violations;
  expect(files(v)).toEqual(["test/c.test.ts"]);
  expect(v[0].reason).toMatch(/symlink/i);
});

test("[REQ-UNSKIPCONTENT-4] new test symlink to a helper WITHOUT an active test is a violation too (the type alone decides)", () => {
  startPr();
  put("test/helper.ts", SKIPPED);
  symlinkSync("helper.ts", join(repo, "test/c.test.ts"));
  git("add", "-A");
  commit("implement: harmless-looking symlink");
  expect(modeOf("test/c.test.ts")).toBe("120000");
  const r = run();
  expect(r.status).toBe(1);
  const v = JSON.parse(r.stdout).violations;
  expect(files(v)).toEqual(["test/c.test.ts"]);
  expect(v[0].reason).toMatch(/symlink/i);
});

test("[REQ-UNSKIPCONTENT-4] an existing test file replaced by a symlink is a violation (already red-free today: the text differs)", () => {
  startPr();
  put("helper.ts", ACTIVE);
  unlinkSync(join(repo, "a.test.ts"));
  symlinkSync("helper.ts", join(repo, "a.test.ts"));
  git("add", "-A");
  commit("implement: replace a managed test by a symlink");
  expect(modeOf("a.test.ts")).toBe("120000");
  const r = run();
  expect(r.status).toBe(1);
  expect(files(JSON.parse(r.stdout).violations)).toContain("a.test.ts");
});

test("[REQ-UNSKIPCONTENT-4] managed test path as a submodule (gitlink) in HEAD is a violation", () => {
  startPr();
  git("update-index", "--add", "--cacheinfo", "160000,1234567890123456789012345678901234567890,test/x.test.ts");
  commit("implement: gitlink at a managed test path");
  expect(modeOf("test/x.test.ts")).toBe("160000");
  const r = run();
  expect(r.status).toBe(1);
  const v = JSON.parse(r.stdout).violations;
  expect(files(v)).toEqual(["test/x.test.ts"]);
  expect(v[0].reason).toMatch(/submodule|gitlink/i);
});

// The link target text equals the new file content, so a content-only comparison sees "no change".
test("[REQ-UNSKIPCONTENT-4] a symlink in the BASE replaced by a regular file whose content equals the link target text is a violation", () => {
  symlinkSync("x", join(repo, "s.test.ts"));
  git("add", "-A");
  commit("base: symlinked test");
  expect(modeOf("s.test.ts", "main")).toBe("120000");
  startPr();
  unlinkSync(join(repo, "s.test.ts"));
  put("s.test.ts", "x");
  git("add", "-A");
  commit("implement: replace the symlink by a regular file");
  expect(modeOf("s.test.ts")).toBe("100644");
  expect(git("show", "main:s.test.ts")).toBe(git("show", "HEAD:s.test.ts"));
  const r = run();
  expect(r.status).toBe(1);
  expect(files(JSON.parse(r.stdout).violations)).toEqual(["s.test.ts"]);
});

test("[REQ-UNSKIPCONTENT-4] a regular test replaced by a symlink whose target text equals its old content is a violation", () => {
  put("e.test.ts", "x");
  git("add", "-A");
  commit("base: regular file");
  startPr();
  unlinkSync(join(repo, "e.test.ts"));
  symlinkSync("x", join(repo, "e.test.ts"));
  git("add", "-A");
  commit("implement: swap in a symlink");
  expect(modeOf("e.test.ts")).toBe("120000");
  expect(git("show", "main:e.test.ts")).toBe(git("show", "HEAD:e.test.ts"));
  const r = run();
  expect(r.status).toBe(1);
  expect(files(JSON.parse(r.stdout).violations)).toEqual(["e.test.ts"]);
});

test("[REQ-UNSKIPCONTENT-6] unmanaged symlink test (outside managed-tests.json) is not read and not judged: exit 0, in unmanaged", () => {
  put(".devloop/managed-tests.json", JSON.stringify(["services/**/*.test.ts"]) + "\n");
  git("add", "-A");
  commit("scope the seam to services");
  startPr();
  put("tools/helper.ts", ACTIVE);
  symlinkSync("helper.ts", join(repo, "tools/c.test.ts"));
  git("add", "-A");
  commit("chore: unmanaged symlink test");
  expect(modeOf("tools/c.test.ts")).toBe("120000");
  const r = run();
  expect(r.status).toBe(0);
  const out = JSON.parse(r.stdout);
  expect(out.unmanaged).toEqual(["tools/c.test.ts"]);
  expect(out.checked).toEqual([]);
  expect(out.violations).toEqual([]);
});

// ---------- REQ-2/3: read errors ----------

test("[REQ-UNSKIPCONTENT-3] HEAD blob of a new test file is missing from the object store: exit 1 naming path and ref", () => {
  startPr();
  put("new.test.ts", ACTIVE + "// unique head content 7f3a\n");
  git("add", "-A");
  commit("implement: new test");
  const obj = looseObject("HEAD:new.test.ts");
  rmSync(obj);
  // Preconditions: the blob is unreadable, the path diff still works (it needs trees only).
  expect(gitOk("cat-file", "-e", "HEAD:new.test.ts")).toBe(false);
  expect(git("diff", "--no-renames", "-z", "--name-only", "main...HEAD")).toContain("new.test.ts");
  const r = run();
  expect(r.status).toBe(1);
  const all = r.stdout + r.stderr;
  expect(all).toContain("new.test.ts");
  expect(all).toContain("HEAD");
  expect(r.stdout).not.toMatch(/"ok":\s*true/);
});

test("[REQ-UNSKIPCONTENT-3] BASE blob of an existing test file is missing: exit 1 naming the path (HEAD stays skipped, so an empty base read would be 'allowed')", () => {
  const BASE = SKIPPED + "// unique base content 91bc\n";
  put("m.test.ts", BASE);
  git("add", "-A");
  commit("base: managed test");
  startPr();
  put("m.test.ts", BASE.replace("toBe(1)", "toBe(99)")); // edited assertion, still skipped
  git("add", "-A");
  commit("implement: edit while staying skipped");
  rmSync(looseObject("main:m.test.ts"));
  expect(gitOk("cat-file", "-e", "main:m.test.ts")).toBe(false);
  expect(git("diff", "--no-renames", "-z", "--name-only", "main...HEAD")).toContain("m.test.ts");
  const r = run();
  expect(r.status).toBe(1);
  expect(r.stdout + r.stderr).toContain("m.test.ts");
  expect(r.stdout).not.toMatch(/"ok":\s*true/);
});

test("[REQ-UNSKIPCONTENT-2] a plainly absent path (new file: absent in base) is NOT a read error: exit 0 for a new skipped file", () => {
  startPr();
  put("n.test.ts", SKIPPED);
  git("add", "-A");
  commit("spec-like: new skipped test");
  const r = run();
  expect(r.status).toBe(0);
  expect(JSON.parse(r.stdout).checked).toEqual(["n.test.ts"]);
});

test("[REQ-UNSKIPCONTENT-2] a deleted file (absent in HEAD) is judged as a deletion, not reported as a read error", () => {
  startPr();
  git("rm", "-q", "a.test.ts");
  commit("implement: delete");
  const r = run();
  expect(r.status).toBe(1);
  const v = JSON.parse(r.stdout).violations;
  expect(files(v)).toEqual(["a.test.ts"]);
  expect(v[0].reason).toMatch(/delet|emptied|remov/i);
});

// ---------- REQ-5: managed-tests.json in base ----------

const MANAGED = ".devloop/managed-tests.json";

test("[REQ-UNSKIPCONTENT-5] base managed-tests.json is a symlink: exit 1 instead of trusting its target text or the worktree", () => {
  // The link target is literally "[]" -> git show would yield the valid JSON text "[]" (manage nothing).
  mkdirSync(join(repo, ".devloop"), { recursive: true });
  symlinkSync("[]", join(repo, MANAGED));
  git("add", "-A");
  commit("base: managed-tests.json as a symlink");
  expect(modeOf(MANAGED, "main")).toBe("120000");
  startPr();
  unlinkSync(join(repo, MANAGED));
  put(MANAGED, JSON.stringify(["nothing/**"]) + "\n"); // the PR's own narrow scope in the worktree
  put("tools/x.test.ts", ACTIVE);
  git("add", "-A");
  commit("implement: narrow own scope, add an active test");
  const r = run();
  expect(r.status).toBe(1);
  expect(r.stdout + r.stderr).toContain("managed-tests.json");
  expect(r.stdout).not.toMatch(/"ok":\s*true/);
});

test("[REQ-UNSKIPCONTENT-5] base managed-tests.json blob unreadable: exit 1, no fallback to the PR's own worktree scope", () => {
  put(MANAGED, JSON.stringify(["**/*.test.ts"]) + "\n");
  git("add", "-A");
  commit("base: manage every test");
  startPr();
  put(MANAGED, JSON.stringify(["nothing/**"]) + "\n");
  put("b.test.ts", ACTIVE);
  git("add", "-A");
  commit("implement: widen own exemption, add an active test");
  rmSync(looseObject(`main:${MANAGED}`));
  expect(gitOk("cat-file", "-e", `main:${MANAGED}`)).toBe(false);
  expect(git("diff", "--no-renames", "-z", "--name-only", "main...HEAD")).toContain("b.test.ts");
  const r = run();
  expect(r.status).toBe(1);
  expect(r.stdout + r.stderr).toContain("managed-tests.json");
  expect(r.stdout).not.toMatch(/"ok":\s*true/);
});

test("[REQ-UNSKIPCONTENT-5] counter-probe: base WITHOUT managed-tests.json still falls back to the worktree scope (source worktree)", () => {
  startPr();
  put(MANAGED, JSON.stringify(["services/**/*.test.ts"]) + "\n");
  put("tools/x.test.ts", ACTIVE);
  git("add", "-A");
  commit("chore: adopt the scope");
  const r = run();
  expect(r.status).toBe(0);
  const out = JSON.parse(r.stdout);
  expect(out.managedSource).toBe("worktree");
  expect(out.unmanaged).toEqual(["tools/x.test.ts"]);
});

// ---------- REQ-4/6: spec branch ----------

test("[REQ-UNSKIPCONTENT-6] spec branch with big active file, symlink and gitlink is a no-op pass (exit 0)", () => {
  git("checkout", "-q", "-b", "devloop/spec/x");
  put("big.test.ts", ACTIVE + PADDING);
  put("test/helper.ts", ACTIVE);
  symlinkSync("helper.ts", join(repo, "test/c.test.ts"));
  git("add", "-A");
  git("update-index", "--add", "--cacheinfo", "160000,1234567890123456789012345678901234567890,test/x.test.ts");
  commit("spec PR: all constructions");
  const r = run("devloop/spec/x");
  expect(r.status).toBe(0);
  const out = JSON.parse(r.stdout);
  expect(out.ok).toBe(true);
  expect(out.skipped).toMatch(/spec/i);
});
