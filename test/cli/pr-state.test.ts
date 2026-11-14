import { test, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const script = resolve(root, "dist/cli/pr-state.js");

// `gh`-Stub vorne im PATH: gibt festes JSON aus (Pfad per Umgebung), ignoriert alle Argumente.
function runWithGh(ghJson: unknown) {
  const dir = mkdtempSync(join(tmpdir(), "devloop-ghstub-"));
  try {
    writeFileSync(join(dir, "gh.json"), JSON.stringify(ghJson));
    writeFileSync(join(dir, "gh"), '#!/bin/sh\ncat "$GH_STUB_JSON"\n');
    chmodSync(join(dir, "gh"), 0o755);
    const r = spawnSync("node", [script, dir, "7"], {
      encoding: "utf8",
      cwd: root,
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, GH_STUB_JSON: join(dir, "gh.json") },
    });
    let out: any;
    try {
      out = JSON.parse(r.stdout);
    } catch {
      out = undefined;
    }
    return { status: r.status, out, stderr: r.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const green = [
  { status: "COMPLETED", conclusion: "SUCCESS" },
  { status: "COMPLETED", conclusion: "SUCCESS" },
];
const pr = (over: Record<string, unknown> = {}) => ({
  headRefName: "devloop/x",
  state: "OPEN",
  reviewDecision: null,
  statusCheckRollup: green,
  isDraft: true,
  ...over,
});

test("[REQ-BIND-4] pr-state: Draft-PR, alle Checks grün -> facts.draft true, phase gated (Critic steht aus)", () => {
  const { status, out } = runWithGh(pr({ isDraft: true }));
  expect(status).toBe(0);
  expect(out.facts.draft).toBe(true);
  expect(out.facts.checks).toBe("green");
  expect(out.reconstructed.phase).toBe("gated");
  expect(out.reconstructed.gateVerdict).toBe("green");
  expect(out.reconstructed.ready).not.toBe(true);
});

test("[REQ-BIND-4] pr-state: nicht Draft, grün -> facts.draft false, merge-pending, ready true", () => {
  const { status, out } = runWithGh(pr({ isDraft: false }));
  expect(status).toBe(0);
  expect(out.facts.draft).toBe(false);
  expect(out.reconstructed.phase).toBe("merge-pending");
  expect(out.reconstructed.ready).toBe(true);
});

test("[REQ-BIND-4] pr-state: isDraft fehlt -> Exit != 0 (fail-closed, kein Raten)", () => {
  const body: Record<string, unknown> = pr();
  delete body.isDraft;
  const { status, out } = runWithGh(body);
  expect(status).not.toBe(0);
  expect(out).toBeUndefined();
});

test("[REQ-BIND-4] pr-state: isDraft als String 'false' -> Exit != 0 (kein Truthy-Cast)", () => {
  for (const bad of ["false", "true", null, 0]) {
    const { status, out } = runWithGh(pr({ isDraft: bad }));
    expect(status, String(bad)).not.toBe(0);
    expect(out).toBeUndefined();
  }
});
