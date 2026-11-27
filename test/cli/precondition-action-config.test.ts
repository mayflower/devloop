// [REQ-CFGBASE-*] Fuehrt die echten run:-Skripte der Precondition-Action aus (gh gestubbt), Setup bash + jq.
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

// Basis auf origin/main; PR-Commit in einem Autoren-Clone, als refs/pull/1/head nach origin geschoben;
// CI-Clone: frisch, detached auf der HEAD-SHA, kein lokaler Branch.
function setup(opts: {
  baseFiles: Record<string, string | null>; // null = Standard-Eintrag aus CONFIG weglassen
  withDefaults?: boolean;
  change: (repo: string) => void;
  author?: string;
  baseHook?: (repo: string) => void; // z. B. Symlinks, vor dem Basis-Commit
}) {
  const tmp = mkdtempSync(join(tmpdir(), "precond-action-cfg-"));
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
  const fetch = run(`git fetch origin "+refs/heads/$BASE:refs/remotes/origin/$BASE"`);
  if (fetch.status !== 0) throw new Error("fetch: " + fetch.stderr);
  const tier = run(stepRun("Compute the AUTHORITATIVE tier"));
  let tierJson: any = {};
  try {
    tierJson = JSON.parse(readFileSync(join(s.work, "tier.json"), "utf8"));
  } catch {
    /* Schritt fehlgeschlagen */
  }
  const verify = tier.status === 0 ? run(stepRun("Verify HUMAN approval")) : undefined;
  return { tier, tierJson, verify };
}

const lastJson = (out: string) => JSON.parse(out.trim().split("\n").pop()!);

test("[REQ-CFGBASE-1] Clone wie actions/checkout: Basis-tier-map src/** -> T3, PR stuft in HEAD auf T1 herab und aendert src/a.ts -> Tier T3", () => {
  const s = setup({
    baseFiles: { ".devloop/tier-map.json": JSON.stringify({ T3: ["src/**"], T1: ["**"] }), CODEOWNERS: COVER },
    change: (w) => {
      write(w, ".devloop/tier-map.json", T1_MAP);
      write(w, "src/a.ts", "x\n");
    },
  });
  const r = runSteps(s);
  expect(r.tier.status).toBe(0);
  expect(r.tierJson.tier).toBe("T3");
});

test("[REQ-CFGBASE-1] Basis-tier-map nur unter tools/, HEAD legt .devloop/tier-map.json (T1) an -> Tier aus tools/ der Basis", () => {
  const s = setup({
    baseFiles: {
      ".devloop/tier-map.json": null,
      "tools/tier-map.json": JSON.stringify({ T3: ["src/**"], T1: ["**"] }),
      CODEOWNERS: COVER,
    },
    change: (w) => {
      write(w, ".devloop/tier-map.json", T1_MAP);
      write(w, "src/a.ts", "x\n");
    },
  });
  const r = runSteps(s);
  expect(r.tier.status).toBe(0);
  expect(r.tierJson.tier).toBe("T3");
});

test("[REQ-CFGBASE-3] Basis-tier-map = `{`, HEAD repariert sie -> Tier-Schritt rot (kein Rueckfall auf HEAD)", () => {
  const s = setup({
    baseFiles: { ".devloop/tier-map.json": "{", CODEOWNERS: COVER },
    change: (w) => write(w, ".devloop/tier-map.json", T1_MAP),
  });
  const r = runSteps(s);
  expect(r.tier.status).not.toBe(0);
});

test("[REQ-CFGBASE-2] Basis-protected-globs mit stryker-Glob, PR leert die Liste und aendert stryker.conf.json -> Schritt rot, protected-set-touched", () => {
  const s = setup({
    baseFiles: { ".devloop/protected-globs.json": '["**/stryker.conf.*"]', CODEOWNERS: COVER },
    change: (w) => {
      write(w, ".devloop/protected-globs.json", "[]");
      write(w, "stryker.conf.json", "{}");
    },
  });
  const r = runSteps(s);
  expect(r.tier.status).toBe(0);
  expect(r.verify!.status).toBe(1);
  expect(r.verify!.stdout).toMatch(/protected-set-touched/);
});

test("[REQ-CFGBASE-2] Basis-bot-logins [\"bot\"], PR leert die Liste, Approval von bot auf HEAD, T2 -> Schritt rot", () => {
  const s = setup({
    baseFiles: {
      ".devloop/bot-logins.json": '["bot"]',
      ".devloop/tier-map.json": JSON.stringify({ T2: ["src/**"], T1: ["**"] }),
      CODEOWNERS: COVER + "/src/ @alice\n",
    },
    author: "someone",
    change: (w) => {
      write(w, ".devloop/bot-logins.json", "[]");
      write(w, "src/a.ts", "x\n");
    },
  });
  writeFileSync(s.reviewsFile, JSON.stringify([{ user: "bot", state: "APPROVED", commit_id: s.sha }]));
  const r = runSteps(s);
  expect(r.tierJson.tier).toBe("T2");
  expect(r.verify!.status).toBe(1);
  expect(r.verify!.stdout).toMatch(/human-approval/);
});

test("[REQ-CFGBASE-3] Basis-protected-globs = `{`, HEAD repariert sie -> Schritt rot, config-invalid (kein Rueckfall auf HEAD)", () => {
  const s = setup({
    baseFiles: { ".devloop/protected-globs.json": "{", CODEOWNERS: COVER },
    change: (w) => write(w, ".devloop/protected-globs.json", "[]"),
  });
  const r = runSteps(s);
  expect(r.tier.status).toBe(0);
  expect(r.verify!.status).toBe(1);
  expect(r.verify!.stdout).toMatch(/config-invalid/);
});

test("[REQ-CFGBASE-3] Basis-bot-logins = `{`, HEAD repariert sie -> Schritt rot, config-invalid", () => {
  const s = setup({
    baseFiles: { ".devloop/bot-logins.json": "{", CODEOWNERS: COVER },
    change: (w) => write(w, ".devloop/bot-logins.json", '["agent-bot"]'),
  });
  const r = runSteps(s);
  expect(r.verify!.status).toBe(1);
  expect(r.verify!.stdout).toMatch(/config-invalid/);
});

test("[REQ-CFGBASE-4] protected-globs fehlt in Basis und HEAD -> Schritt rot, config-missing (kein cat mehr, kein stiller Default)", () => {
  const s = setup({
    baseFiles: { ".devloop/protected-globs.json": null, CODEOWNERS: COVER },
    change: (w) => write(w, "src/a.ts", "x\n"),
  });
  const r = runSteps(s);
  expect(r.tier.status).toBe(0);
  expect(r.verify!.status).toBe(1);
  expect(r.verify!.stdout).toMatch(/config-missing/);
});

test("[REQ-CFGBASE-4] Basis hat .devloop/, aber keine bot-logins.json; PR fuegt [\"bot\"] hinzu -> Liste aus HEAD (Bot-Approval zaehlt nicht), kein config-missing", () => {
  const s = setup({
    baseFiles: {
      ".devloop/bot-logins.json": null,
      ".devloop/tier-map.json": JSON.stringify({ T2: ["src/**"], T1: ["**"] }),
      CODEOWNERS: COVER + "/src/ @alice\n",
    },
    author: "someone",
    change: (w) => {
      write(w, ".devloop/bot-logins.json", '["bot"]');
      write(w, "src/a.ts", "x\n");
    },
  });
  writeFileSync(s.reviewsFile, JSON.stringify([{ user: "bot", state: "APPROVED", commit_id: s.sha }]));
  const r = runSteps(s);
  expect(r.verify!.status).toBe(1);
  expect(r.verify!.stdout).toMatch(/human-approval/);
  expect(r.verify!.stdout).not.toMatch(/config-missing/);
});

test("[REQ-CFGBASE-5][REQ-CFGBASE-6] T1, PR aendert nur .devloop/protected-globs.json, Basis-CODEOWNERS ohne /.devloop/ -> Schritt rot, config-unguarded", () => {
  const s = setup({
    baseFiles: { CODEOWNERS: "/src/ @alice\n" },
    change: (w) => write(w, ".devloop/protected-globs.json", '["**/x"]'),
  });
  const r = runSteps(s);
  expect(r.tierJson.tier).toBe("T1");
  expect(r.verify!.status).toBe(1);
  expect(r.verify!.stdout).toMatch(/config-unguarded/);
});

test("[REQ-CFGBASE-5] dto. mit Deckung in der Basis, keine Reviews -> Schritt gruen, pending:true", () => {
  const s = setup({
    baseFiles: { CODEOWNERS: COVER },
    change: (w) => write(w, ".devloop/protected-globs.json", '["**/x"]'),
  });
  const r = runSteps(s);
  expect(r.verify!.status).toBe(0);
  expect(lastJson(r.verify!.stdout).pending).toBe(true);
});

test("[REQ-CFGBASE-5][REQ-CFGBASE-6] Erstaufnahme: Basis ohne jeden Config-Pfad, PR legt Skeletons an -> Tier aus HEAD-tier-map, Schritt gruen, kein config-unguarded", () => {
  const s = setup({
    baseFiles: {},
    withDefaults: false,
    change: (w) => {
      for (const [p, c] of Object.entries(CONFIG)) write(w, p, c);
      write(w, "src/a.ts", "x\n");
    },
  });
  const r = runSteps(s);
  expect(r.tier.status).toBe(0);
  expect(r.tierJson.tier).toBe("T1");
  expect(r.verify!.status).toBe(0);
  expect(r.verify!.stdout).not.toMatch(/config-unguarded/);
  expect(lastJson(r.verify!.stdout).ok).toBe(true);
});

test("[REQ-CFGBASE-7] Gegenprobe: normaler PR (nur src/a.ts, T1, Basis mit Config) -> Schritt gruen, ok:true", () => {
  const s = setup({
    baseFiles: { CODEOWNERS: "/src/ @alice\n" },
    change: (w) => write(w, "src/a.ts", "x\n"),
  });
  const r = runSteps(s);
  expect(r.tier.status).toBe(0);
  expect(r.tierJson.tier).toBe("T1");
  expect(r.verify!.status).toBe(0);
  expect(lastJson(r.verify!.stdout).ok).toBe(true);
});

// Symlink in der Basis: ls-tree-Modus 120000 ist kein reguelaeres Blob. Der PR repariert/leert das Ziel im HEAD.
function linkInBase(link: string, target: string) {
  return (repo: string) => {
    mkdirSync(dirname(join(repo, link)), { recursive: true });
    symlinkSync(target, join(repo, link));
  };
}

test("[REQ-CFGBASE-3] Basis-protected-globs ist ein Symlink auf cfg/pg.json, PR leert cfg/pg.json und aendert stryker.conf.json -> Schritt rot, config-invalid", () => {
  const s = setup({
    baseFiles: { ".devloop/protected-globs.json": null, "cfg/pg.json": '["**/stryker.conf.*"]', CODEOWNERS: COVER },
    baseHook: linkInBase(".devloop/protected-globs.json", "../cfg/pg.json"),
    change: (w) => {
      write(w, "cfg/pg.json", "[]");
      write(w, "stryker.conf.json", "{}");
    },
  });
  const r = runSteps(s);
  expect(r.tier.status).toBe(0);
  expect(r.verify!.status).toBe(1);
  expect(r.verify!.stdout).toMatch(/config-invalid/);
});

test("[REQ-CFGBASE-3] Basis-bot-logins ist ein Symlink, PR leert das Ziel, Bot-Approval auf HEAD -> Schritt rot, config-invalid", () => {
  const s = setup({
    baseFiles: {
      ".devloop/bot-logins.json": null,
      "cfg/bl.json": '["bot"]',
      ".devloop/tier-map.json": JSON.stringify({ T2: ["src/**"], T1: ["**"] }),
      CODEOWNERS: COVER,
    },
    baseHook: linkInBase(".devloop/bot-logins.json", "../cfg/bl.json"),
    author: "someone",
    change: (w) => {
      write(w, "cfg/bl.json", "[]");
      write(w, "src/a.ts", "x\n");
    },
  });
  writeFileSync(s.reviewsFile, JSON.stringify([{ user: "bot", state: "APPROVED", commit_id: s.sha }]));
  const r = runSteps(s);
  expect(r.verify!.status).toBe(1);
  expect(r.verify!.stdout).toMatch(/config-invalid/);
});

test("[REQ-CFGBASE-3] Basis-tier-map ist ein Symlink, HEAD hat gueltige Datei am Ziel -> Tier-Schritt rot", () => {
  const s = setup({
    baseFiles: { ".devloop/tier-map.json": null, "cfg/tm.json": "{", CODEOWNERS: COVER },
    baseHook: linkInBase(".devloop/tier-map.json", "../cfg/tm.json"),
    change: (w) => write(w, "cfg/tm.json", T1_MAP),
  });
  const r = runSteps(s);
  expect(r.tier.status).not.toBe(0);
});

test("[REQ-CFGBASE-3] Tier-Schritt ohne -e (nur -o pipefail) mit kaputter Basis-tier-map -> rc != 0 (|| exit 1 im Block)", () => {
  const s = setup({
    baseFiles: { ".devloop/tier-map.json": "{", CODEOWNERS: COVER },
    change: (w) => write(w, ".devloop/tier-map.json", T1_MAP),
  });
  const r = runSteps(s, ["-o", "pipefail"]);
  expect(r.tier.status).not.toBe(0);
});
