import { test, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");
const has = (rel: string) => existsSync(resolve(root, rel));

const STATIONS = ["specify", "spec-to-tests", "implement", "critic"] as const;

function frontmatter(md: string): string {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  return m ? m[1] : "";
}

test("plugin.json + marketplace.json are valid and name the plugin 'devloop'", () => {
  const plugin = JSON.parse(read(".claude-plugin/plugin.json"));
  expect(plugin.name).toBe("devloop");
  expect(typeof plugin.version).toBe("string");
  const mkt = JSON.parse(read(".claude-plugin/marketplace.json"));
  expect(mkt.plugins.some((p: { name: string }) => p.name === "devloop")).toBe(true);
});

test("every station has both a subagent def and a skill wrapper", () => {
  for (const s of STATIONS) {
    expect(has(`agents/devloop-${s}.md`)).toBe(true);
    expect(has(`skills/${s}/SKILL.md`)).toBe(true);
  }
});

test("station subagent defs declare a tools allowlist", () => {
  for (const s of STATIONS) {
    expect(frontmatter(read(`agents/devloop-${s}.md`))).toMatch(/^tools:/m);
  }
});

test("the critic subagent is read-only (no Write/Edit -> cannot mutate or merge)", () => {
  const fm = frontmatter(read("agents/devloop-critic.md"));
  expect(fm).not.toMatch(/\bWrite\b/);
  expect(fm).not.toMatch(/\bEdit\b/);
});

test("hooks.json wires a PreToolUse hook via ${CLAUDE_PLUGIN_ROOT}/dist", () => {
  const h = JSON.parse(read("hooks/hooks.json"));
  expect(h.hooks.PreToolUse).toBeTruthy();
  const serialized = JSON.stringify(h);
  expect(serialized).toContain("${CLAUDE_PLUGIN_ROOT}");
  expect(serialized).toContain("/dist/hooks/pretooluse.js");
});

test("the loop (driver) skill obeys next-action + checks guardians + spawns, never inlines artifacts", () => {
  const md = read("skills/loop/SKILL.md");
  expect(md).toMatch(/next-action/);
  expect(md).toMatch(/check-guardians/);
  expect(md).toMatch(/SPAWN_STATION|spawn/i);
  expect(md.toLowerCase()).toMatch(/nie(mals)? (inline|selbst)/);
});

test("the specify skill derives the tier via the CLI (not agent-chosen)", () => {
  expect(read("skills/specify/SKILL.md")).toMatch(/derive-tier/);
});

test("the loop skill spawns mutating stations with worktree isolation (parallel-safe)", () => {
  const md = read("skills/loop/SKILL.md");
  expect(md).toMatch(/worktree/i);
  expect(md).toMatch(/isolation/i);
});

test("a /devloop:cleanup skill exists for pruning merged branches/worktrees", () => {
  expect(has("skills/cleanup/SKILL.md")).toBe(true);
  expect(read("skills/cleanup/SKILL.md")).toMatch(/cleanup\.js/);
});

test("spec-to-tests emits complete SKIPPED tests (not empty skeletons)", () => {
  const md = read("agents/devloop-spec-to-tests.md");
  expect(md).toMatch(/\.skip/);
  expect(md.toLowerCase()).toMatch(/vollständig/); // complete tests, real assertions
  expect(md).toMatch(/verify-unskip/); // points at the machine-audited seam
});

test("implement is restricted to removing .skip in test files (the test<->code seam)", () => {
  const md = read("agents/devloop-implement.md");
  expect(md).toMatch(/\.skip/);
  expect(md).toMatch(/verify-unskip/);
});

test("the loop skill drives the spec-PR-first flow (OPEN_SPEC_PR + MERGE_SPEC_PR)", () => {
  const md = read("skills/loop/SKILL.md");
  expect(md).toMatch(/OPEN_SPEC_PR/);
  expect(md).toMatch(/MERGE_SPEC_PR/);
  expect(md).toMatch(/devloop\/spec\//); // spec-PR branch convention drives verify-unskip's PR-type gate
});

test("a /devloop:resume skill exists and reconstructs from GitHub via pr-state", () => {
  expect(has("skills/resume/SKILL.md")).toBe(true);
  const md = read("skills/resume/SKILL.md");
  expect(md).toMatch(/pr-state/);
  expect(md).toMatch(/next-action/);
  expect(md.toLowerCase()).toMatch(/changes requested|rückkante/);
});

test("spec-to-tests is amend-aware for spec changes (req-delta + re-skip changed tests)", () => {
  const md = read("agents/devloop-spec-to-tests.md");
  expect(md).toMatch(/req-delta/);
  expect(md.toLowerCase()).toMatch(/re-skip|wieder .?skip/);
});

test("the ci template carries the guardian marker string", () => {
  expect(read("templates/ci-precondition-check.yml")).toContain("devloop-precondition-check");
});

test("ships a reusable composite action that runs from its OWN dist (no target-repo npm dep)", () => {
  const a = read(".github/actions/precondition-check/action.yml");
  expect(a).toMatch(/using:\s*composite/);
  expect(a).toMatch(/\$GITHUB_ACTION_PATH\/dist\/cli\/(derive-tier|verify-review|verify-unskip|check-codeowners)\.js/);
});

test("ships a reusable auto-merge workflow (workflow_call) with both jobs", () => {
  const wf = read(".github/workflows/auto-merge.yml");
  expect(wf).toMatch(/workflow_call/);
  expect(wf).toMatch(/enable-auto-merge/);
  expect(wf).toMatch(/update-behind/);
  expect(wf).toMatch(/update-branch/); // re-syncs BEHIND armed PRs
  expect(wf).toMatch(/autoMergeRequest/); // login-agnostic filter
});

test("the auto-merge caller template calls the reusable workflow, pinned + bot-login injected", () => {
  const t = read("templates/auto-merge.yml");
  expect(t).toMatch(/uses:\s*mayflower\/devloop\/\.github\/workflows\/auto-merge\.yml@/);
  expect(t).toContain("${DEVLOOP_REF}");
  expect(t).toContain("${BOT_LOGIN}");
});

test("the ci template installs nothing — it just calls the public action, pinned and token-free", () => {
  const t = read("templates/ci-precondition-check.yml");
  expect(t).toMatch(/uses:\s*mayflower\/devloop\/\.github\/actions\/precondition-check@/);
  expect(t).toContain("${DEVLOOP_REF}"); // init pins this to the current version
  expect(t).not.toMatch(/node_modules\/devloop/); // no cross-org npm dependency
});

test("ships a reference escape-hatch rule reconciled with the spec-PR model (REQ-tagged .skip carve-out)", () => {
  const rule = read("templates/semgrep-escape-hatches.yml");
  expect(rule).toMatch(/\.skip/);
  expect(rule).toMatch(/REQ-/); // the carve-out: .skip allowed only on REQ-tagged tests
  expect(rule).toMatch(/pattern-not-regex/); // implemented as an exclusion, not just prose
});

test("spec-to-tests documents the sanctioned skip idiom (per-test .skip + REQ tag, not describe.skip)", () => {
  const md = read("agents/devloop-spec-to-tests.md");
  expect(md).toMatch(/REQ-Tag|REQ-getaggt/);
  expect(md.toLowerCase()).toMatch(/describe\.skip/); // explicitly warns against it
});
