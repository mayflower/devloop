// Local PreToolUse hook — the CONVENIENCE (bypassable) layer of the binding anchor
// (design §0.2). The AUTHORITATIVE guarantee is the CI required-check (precondition-check);
// this hook just fails fast locally: it blocks a merge action when the t3-merge approval
// token is absent in the project dir. Coarse on purpose (content-binding is CI's job).

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { workflowReferences } from "../core/guardians.js";

export interface HookInput {
  tool_name: string;
  tool_input?: { command?: string };
}

export interface HookResult {
  block: boolean;
  reason?: string;
}

const MERGE_PATTERN = /\b(git\s+merge|gh\s+pr\s+merge)\b/;

// Which approval anchor does this repo use? Explicit .devloop/config.json wins; otherwise
// infer anchor (b) from the wired authoritative CI check (devloop-precondition-check).
function usesAnchorB(repo: string): boolean {
  try {
    const cfg = JSON.parse(readFileSync(join(repo, ".devloop", "config.json"), "utf8"));
    if (cfg.anchor === "a") return false;
    if (cfg.anchor === "b") return true;
  } catch {
    // no/invalid config -> fall through to inference
  }
  return workflowReferences(repo, "devloop-precondition-check");
}

export function evaluateHook(input: HookInput, repo: string): HookResult {
  if (input.tool_name !== "Bash") return { block: false };
  const command = input.tool_input?.command ?? "";
  if (!MERGE_PATTERN.test(command)) return { block: false };

  // Scope: this is a GLOBAL plugin hook. Only act in devloop-managed repos (those that
  // ran /devloop:init -> have a .devloop/ dir). Elsewhere it must be a no-op.
  if (!existsSync(join(repo, ".devloop"))) return { block: false };

  // Anchor (b) — the standard: CI is authoritative and tier-aware (it has the diff). The
  // local anchor-(a) token is irrelevant and is never written here, so this hook must NOT
  // block — that would be tier-blind and would kill the §9 T0/T1 auto-merge. Defer to CI.
  if (usesAnchorB(repo)) return { block: false };

  // Anchor (a), opt-in: the local content-bound token is the advisory fast-fail gate.
  if (existsSync(join(repo, ".devloop", "t3-merge.approved"))) return { block: false };
  return {
    block: true,
    reason:
      "devloop (anchor a): merge blocked — no local t3-merge approval token in .devloop/. " +
      "This is the opt-in local convenience gate; anchor-b repos defer to the CI precondition-check.",
  };
}

// --- Runner: only when executed directly (not when imported by tests) ---
function isMain(): boolean {
  return !!process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMain()) {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8") || "{}";
  const input = JSON.parse(raw) as HookInput;
  const repo = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  const result = evaluateHook(input, repo);
  if (result.block) {
    process.stderr.write((result.reason ?? "devloop: blocked") + "\n");
    process.exit(2); // exit 2 = blocking error for PreToolUse hooks
  }
  process.exit(0);
}
