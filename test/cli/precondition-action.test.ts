// [REQ-SPECGATE-9] Fuehrt die echten run:-Skripte der Precondition-Action aus (temp. Repo mit
// bare origin, gh gestubbt). Setzt bash und jq voraus. Kein YAML-Parser: Blocks per Zeilenscan.
import { test, expect, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const actionDir = join(root, ".github/actions/precondition-check");
const actionYml = readFileSync(join(actionDir, "action.yml"), "utf8");

// Liefert den run:-Block des Schritts, dessen "- name:" mit namePrefix beginnt.
function stepRun(namePrefix: string): string {
  const lines = actionYml.split("\n");
  const i = lines.findIndex((l) => l.trim().startsWith("- name: " + namePrefix));
  if (i < 0) throw new Error("step not found: " + namePrefix);
  const r = lines.findIndex((l, k) => k > i && /^\s+run: \|\s*$/.test(l));
  if (r < 0) throw new Error("no block run: for step " + namePrefix);
  const runIndent = lines[r].length - lines[r].trimStart().length;
  const out: string[] = [];
  for (let k = r + 1; k < lines.length; k++) {
    const l = lines[k];
    const ind = l.length - l.trimStart().length;
    if (l.trim() !== "" && ind <= runIndent) break;
    out.push(l.slice(runIndent + 2));
  }
  return out.join("\n");
}

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function sh(cwd: string, cmd: string, args: string[]): void {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")}: ${r.stderr}`);
}
const git = (cwd: string, ...a: string[]) => sh(cwd, "git", ["-c", "commit.gpgsign=false", "-c", "core.quotepath=true", ...a]);

function write(repo: string, rel: string, content: string): void {
  const p = join(repo, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
}

// bare origin + Arbeits-Clone mit Basis "main"; Basisdateien committet und gepusht, dann Branch mit PR-Aenderungen.
function setup(opts: { baseFiles?: Record<string, string>; branch: string; change: (repo: string) => void }) {
  const tmp = mkdtempSync(join(tmpdir(), "precond-action-"));
  dirs.push(tmp);
  const origin = join(tmp, "origin.git");
  const work = join(tmp, "work");
  mkdirSync(work);
  sh(tmp, "git", ["init", "-q", "--bare", "-b", "main", origin]);
  git(work, "init", "-q", "-b", "main");
  git(work, "config", "user.name", "Test");
  git(work, "config", "user.email", "t@example.invalid");
  git(work, "remote", "add", "origin", origin);
  write(work, ".devloop/tier-map.json", JSON.stringify({ T0: ["**"] }));
  write(work, ".devloop/bot-logins.json", '["agent-bot"]');
  write(work, ".devloop/protected-globs.json", "[]");
  write(work, "README.md", "x\n");
  for (const [p, c] of Object.entries(opts.baseFiles ?? {})) write(work, p, c);
  git(work, "add", "-A");
  git(work, "commit", "-q", "-m", "base");
  git(work, "push", "-q", "origin", "main");
  git(work, "checkout", "-q", "-b", opts.branch);
  opts.change(work);
  git(work, "add", "-A");
  git(work, "commit", "-q", "-m", "pr");
  const sha = spawnSync("git", ["rev-parse", "HEAD"], { cwd: work, encoding: "utf8" }).stdout.trim();
  // gh-Stub: gibt die (bereits per --jq geformten) Reviews aus.
  const bin = join(tmp, "bin");
  mkdirSync(bin);
  write(tmp, "reviews.json", "[]");
  writeFileSync(join(bin, "gh"), `#!/bin/sh\ncat "${join(tmp, "reviews.json")}"\n`);
  chmodSync(join(bin, "gh"), 0o755);
  return { work, bin, sha, branch: opts.branch };
}

function runSteps(s: ReturnType<typeof setup>) {
  const env = {
    PATH: `${s.bin}:${process.env.PATH}`,
    HOME: process.env.HOME ?? "/tmp",
    GITHUB_ACTION_PATH: actionDir,
    BASE: "main",
    HEAD_REF: s.branch,
    HEAD_SHA: s.sha,
    AUTHOR: "agent-bot",
    PR: "1",
    REPO: "o/r",
    GH_TOKEN: "stub",
  };
  const run = (script: string) => spawnSync("bash", ["--noprofile", "--norc", "-eo", "pipefail", "-c", script], { cwd: s.work, env, encoding: "utf8" });
  const fetch = run(`git fetch origin "+refs/heads/$BASE:refs/remotes/origin/$BASE"`);
  if (fetch.status !== 0) throw new Error("fetch: " + fetch.stderr);
  const tier = run(stepRun("Compute the AUTHORITATIVE tier"));
  if (tier.status !== 0) throw new Error("tier step: " + tier.stderr);
  return run(stepRun("Verify HUMAN approval"));
}

const COVER = { CODEOWNERS: "/specs/ @alice\n" };

test("[REQ-SPECGATE-9] Rename specs/x/spec.md -> spec.md.old auf devloop/x, ungedeckt -> Schritt rot (alter Pfad sichtbar)", () => {
  const s = setup({
    baseFiles: { "specs/x/spec.md": "s\n", CODEOWNERS: "/src/ @alice\n" },
    branch: "devloop/x",
    change: (w) => git(w, "mv", "specs/x/spec.md", "specs/x/spec.md.old"),
  });
  const r = runSteps(s);
  expect(r.status).toBe(1);
  expect(r.stdout).toMatch(/spec-unguarded/);
});

test("[REQ-SPECGATE-9] feature/groesse mit neuer specs/größe/spec.md (Umlaut), ungedeckt -> Schritt rot (kein Git-Quoting)", () => {
  const s = setup({
    baseFiles: { CODEOWNERS: "/src/ @alice\n" },
    branch: "feature/größe",
    change: (w) => write(w, "specs/größe/spec.md", "s\n"),
  });
  const r = runSteps(s);
  expect(r.status).toBe(1);
  expect(r.stdout).toMatch(/spec-unguarded/);
});

test("[REQ-SPECGATE-9] Spec-Branch, nur Test geaendert -> Schritt rot, spec-unguarded (headRef wird uebergeben)", () => {
  const s = setup({
    baseFiles: COVER,
    branch: "devloop/spec/x",
    change: (w) => write(w, "test/a.test.ts", "t\n"),
  });
  const r = runSteps(s);
  expect(r.status).toBe(1);
  expect(r.stdout).toMatch(/spec-unguarded/);
});

test("[REQ-SPECGATE-9] Spec gedeckt, keine Reviews -> Schritt gruen mit pending (baseRef wird uebergeben)", () => {
  const s = setup({
    baseFiles: COVER,
    branch: "devloop/spec/x",
    change: (w) => write(w, "specs/x/spec.md", "s\n"),
  });
  const r = runSteps(s);
  expect(r.status).toBe(0);
  expect(JSON.parse(r.stdout.trim().split("\n").pop()!).pending).toBe(true);
});

test("[REQ-SPECGATE-9] Gegenprobe: normaler Nicht-Spec-PR bei T0 -> Schritt gruen", () => {
  const s = setup({
    branch: "feature/y",
    change: (w) => write(w, "src/a.ts", "x\n"),
  });
  const r = runSteps(s);
  expect(r.status).toBe(0);
  expect(JSON.parse(r.stdout.trim().split("\n").pop()!).ok).toBe(true);
});
