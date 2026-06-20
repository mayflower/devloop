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

test("the ci template carries the guardian marker string", () => {
  expect(read("templates/ci-precondition-check.yml")).toContain("devloop-precondition-check");
});
