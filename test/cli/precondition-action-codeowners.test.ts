// [REQ-COBASE-*] (#14) Fuehrt die echten run:-Skripte der Precondition-Action aus (gh gestubbt), Setup bash + jq.
// Der Clone wird wie `actions/checkout` gebaut: detached auf der HEAD-SHA, KEIN lokaler `main`,
// nur `origin/main` (per "Fetch base"). Ein baseRef ohne `origin/` laeuft hier ins Leere (vgl. #17).
import { test, expect, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const actionDir = join(root, ".github/actions/precondition-check");
const actionYml = readFileSync(join(actionDir, "action.yml"), "utf8");

function stepRun(namePrefix: string): string {
  const lines = actionYml.split("\n");
  const hits = lines.map((l, k) => (l.trim().startsWith("- name: " + namePrefix) ? k : -1)).filter((k) => k >= 0);
  if (hits.length !== 1) throw new Error(`step "${namePrefix}": ${hits.length} Treffer in action.yml (erwartet genau 1)`);
  const i = hits[0];
  const stepIndent = lines[i].length - lines[i].trimStart().length;
  // nur innerhalb dieses Schritts suchen, nie den Nachbarschritt greifen
  let end = lines.length;
  for (let k = i + 1; k < lines.length; k++) {
    const l = lines[k];
    if (l.trim() !== "" && l.length - l.trimStart().length <= stepIndent && !l.trim().startsWith("#")) {
      end = k;
      break;
    }
  }
  const r = lines.findIndex((l, k) => k > i && k < end && /^\s+run:/.test(l));
  if (r < 0) throw new Error("kein run: im Schritt " + namePrefix);
  const m = lines[r].match(/^(\s+)run:\s*(.*)$/)!;
  if (m[2].trim() !== "|") return m[2];
  const runIndent = m[1].length;
  const out: string[] = [];
  for (let k = r + 1; k < end; k++) {
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

function sh(cwd: string, cmd: string, args: string[]): string {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}
const git = (cwd: string, ...a: string[]) =>
  sh(cwd, "git", ["-c", "commit.gpgsign=false", "-c", "core.quotepath=true", ...a]);

function write(repo: string, rel: string, content: string): void {
  const p = join(repo, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
}

const T1_MAP = JSON.stringify({ T1: ["**"] });
const CONFIG = {
  ".devloop/tier-map.json": T1_MAP,
  ".devloop/bot-logins.json": '["agent-bot"]',
  ".devloop/protected-globs.json": "[]",
};
const COVER = "/.devloop/ @alice\n";
const T2_MAP = JSON.stringify({ T2: ["services/**"], T1: ["**"] });

// Basis auf origin/main; PR-Commit in einem Autoren-Clone, als refs/pull/1/head nach origin geschoben;
// CI-Clone: frisch, detached auf der HEAD-SHA, kein lokaler Branch.
function setup(opts: {
  baseFiles: Record<string, string | null>; // null = Standard-Eintrag aus CONFIG weglassen
  withDefaults?: boolean;
  change: (repo: string) => void;
  author?: string;
  baseHook?: (repo: string) => void; // z. B. Symlinks, vor dem Basis-Commit
}) {
  const tmp = mkdtempSync(join(tmpdir(), "precond-action-cobase-"));
  dirs.push(tmp);
  const origin = join(tmp, "origin.git");
  const author = join(tmp, "author");
  const ci = join(tmp, "ci");
  mkdirSync(author);
  mkdirSync(ci);
  sh(tmp, "git", ["init", "-q", "--bare", "-b", "main", origin]);
  git(author, "init", "-q", "-b", "main");
  git(author, "config", "user.name", "Test");
  git(author, "config", "user.email", "t@example.invalid");
  git(author, "remote", "add", "origin", origin);
  write(author, "README.md", "x\n");
  const files = { ...(opts.withDefaults === false ? {} : CONFIG), ...opts.baseFiles };
  for (const [p, c] of Object.entries(files)) if (c !== null) write(author, p, c);
  opts.baseHook?.(author);
  git(author, "add", "-A");
  git(author, "commit", "-q", "-m", "base");
  git(author, "push", "-q", "origin", "main");
  git(author, "checkout", "-q", "-b", "feature/y");
  opts.change(author);
  git(author, "add", "-A");
  git(author, "commit", "-q", "-m", "pr");
  const sha = git(author, "rev-parse", "HEAD").trim();
  git(author, "push", "-q", "origin", "HEAD:refs/pull/1/head");

  // CI-Clone wie actions/checkout: fetch der PR-Ref, detached checkout, kein lokaler Branch.
  git(ci, "init", "-q");
  git(ci, "config", "user.name", "Test");
  git(ci, "config", "user.email", "t@example.invalid");
  git(ci, "remote", "add", "origin", origin);
  git(ci, "fetch", "-q", "--no-tags", "origin", "+refs/pull/1/head:refs/remotes/pull/1/head");
  git(ci, "checkout", "-q", "--detach", sha);
  if (git(ci, "for-each-ref", "refs/heads").trim() !== "") throw new Error("setup: CI-Clone hat lokale Branches");
  if (git(ci, "rev-parse", "--abbrev-ref", "HEAD").trim() !== "HEAD") throw new Error("setup: HEAD nicht detached");

  const bin = join(tmp, "bin");
  mkdirSync(bin);
  const reviewsFile = join(tmp, "reviews.json");
  writeFileSync(reviewsFile, "[]");
  writeFileSync(join(bin, "gh"), `#!/bin/sh\ncat "${reviewsFile}"\n`);
  chmodSync(join(bin, "gh"), 0o755);
  return { work: ci, bin, sha, reviewsFile, author: opts.author ?? "agent-bot" };
}

type Setup = ReturnType<typeof setup>;

function runSteps(s: Setup, shellFlags: string[] = ["-eo", "pipefail"]) {
  const env = {
    PATH: `${s.bin}:${process.env.PATH}`,
    HOME: process.env.HOME ?? "/tmp",
    GITHUB_ACTION_PATH: actionDir,
    BASE: "main",
    HEAD_REF: "feature/y",
    HEAD_SHA: s.sha,
    AUTHOR: s.author,
    PR: "1",
    REPO: "o/r",
    GH_TOKEN: "stub",
  };
  const run = (script: string) => spawnSync("bash", ["--noprofile", "--norc", ...shellFlags, "-c", script], { cwd: s.work, env, encoding: "utf8" });
  const fetch = run(stepRun("Fetch base"));
  if (fetch.status !== 0) throw new Error("fetch: " + fetch.stderr);
  const tier = run(stepRun("Compute the AUTHORITATIVE tier"));
  let tierJson: any = {};
  try {
    tierJson = JSON.parse(readFileSync(join(s.work, "tier.json"), "utf8"));
  } catch {
    /* Schritt fehlgeschlagen */
  }
  const drift = tier.status === 0 ? run(stepRun("Drift guard")) : undefined;
  const verify = tier.status === 0 ? run(stepRun("Verify HUMAN approval")) : undefined;
  return { tier, tierJson, drift, verify };
}


const last = (out: string) => JSON.parse(out.trim().split("\n").pop()!);

test("[REQ-COBASE-1][REQ-COBASE-2] Clone wie actions/checkout: Basis deckt services/** nicht, PR traegt Deckung in HEAD ein -> Drift-Schritt gruen, Verify-Schritt rot mit codeowners-unguarded (baseRef wird uebergeben)", () => {
  const s = setup({
    baseFiles: { ".devloop/tier-map.json": T2_MAP, CODEOWNERS: COVER },
    change: (w) => {
      write(w, "CODEOWNERS", "/.devloop/ @alice\n/services/ @mallory\n");
      write(w, "services/a.ts", "x\n");
    },
  });
  const r = runSteps(s);
  expect(r.tier.status).toBe(0);
  expect(r.tierJson.tier).toBe("T2");
  expect(r.drift!.status).toBe(0); // HEAD-Drift-Waechter bleibt gruen (REQ-COBASE-6)
  expect(r.verify!.status).toBe(1);
  expect(r.verify!.stdout).toMatch(/codeowners-unguarded/);
  expect(r.verify!.stdout).toContain("services/a.ts");
});

test("[REQ-COBASE-1] Gegenprobe im checkout-Clone: Basis deckt services/**, keine Reviews -> Verify-Schritt gruen mit pending", () => {
  const s = setup({
    baseFiles: { ".devloop/tier-map.json": T2_MAP, CODEOWNERS: COVER + "/services/ @alice\n" },
    change: (w) => write(w, "services/a.ts", "x\n"),
  });
  const r = runSteps(s);
  expect(r.verify!.status).toBe(0);
  expect(last(r.verify!.stdout).pending).toBe(true);
});

test("[REQ-COBASE-2] checkout-Clone: Basis-tier-map T2 fuer services/**, HEAD stuft auf T1 herab, Basis ohne Deckung -> Verify-Schritt rot", () => {
  const s = setup({
    baseFiles: { ".devloop/tier-map.json": T2_MAP, CODEOWNERS: COVER },
    change: (w) => {
      write(w, ".devloop/tier-map.json", T1_MAP);
      write(w, "CODEOWNERS", COVER + "/services/ @mallory\n");
      write(w, "services/a.ts", "x\n");
    },
  });
  const r = runSteps(s);
  expect(r.tier.status).toBe(0);
  expect(r.verify!.status).toBe(1);
  expect(r.verify!.stdout).toMatch(/codeowners-unguarded/);
});

test("[REQ-COBASE-5] checkout-Clone: Reparatur-PR (nur CODEOWNERS) bei Luecke in der Basis -> Verify-Schritt gruen", () => {
  const s = setup({
    baseFiles: { ".devloop/tier-map.json": T2_MAP, CODEOWNERS: COVER },
    change: (w) => write(w, "CODEOWNERS", COVER + "/services/ @alice\n"),
  });
  const r = runSteps(s);
  expect(r.verify!.status).toBe(0);
  expect(r.verify!.stdout).not.toMatch(/codeowners-unguarded/);
});

test("[REQ-COBASE-3] checkout-Clone: Basis ohne CODEOWNERS (mit Config), PR legt sie an und berührt T2-Pfad -> Verify-Schritt rot", () => {
  const s = setup({
    baseFiles: { ".devloop/tier-map.json": T2_MAP, CODEOWNERS: null },
    change: (w) => {
      write(w, "CODEOWNERS", "/services/ @alice\n/.devloop/ @alice\n");
      write(w, "services/a.ts", "x\n");
    },
  });
  const r = runSteps(s);
  expect(r.verify!.status).toBe(1);
  expect(r.verify!.stdout).toMatch(/codeowners-unguarded/);
});

test("[REQ-COBASE-6] checkout-Clone: HEAD-tier-map mit ungedecktem T2-Glob -> Drift-Schritt rot (aus action.yml ausgefuehrt)", () => {
  const s = setup({
    baseFiles: { ".devloop/tier-map.json": T2_MAP, CODEOWNERS: COVER + "/services/ @alice\n" },
    change: (w) => write(w, ".devloop/tier-map.json", JSON.stringify({ T2: ["services/**", "billing/**"], T1: ["**"] })),
  });
  const r = runSteps(s);
  expect(r.tier.status).toBe(0);
  expect(r.drift!.status).toBe(1);
  expect(r.drift!.stdout).toContain("billing/**");
});
