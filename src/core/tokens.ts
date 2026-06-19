// Content-bound approval tokens — the LOCAL, ADVISORY mirror of an approval (anchor a /
// fast local pre-check). NOTE: under the chosen anchor (b), the AUTHORITATIVE approval is a
// human GitHub PR review verified server-side (see review.ts / verify-review.ts) — a channel
// the agent cannot forge. This local token must NOT be treated as the authority (the agent
// could write it); it exists only for fast local feedback in the inner loop.
// A token is "ok" only if bound to the sha256 of the EXACT reviewed artifact; editing the
// artifact after approval -> "stale"; missing -> "missing". Gap is always DETECTABLE.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Stop } from "./types.js";

export type ApprovalStatus = "ok" | "missing" | "stale";

const TOKEN_DIR = ".devloop";
const tokenPath = (repo: string, stop: Stop): string =>
  join(repo, TOKEN_DIR, `${stop}.approved`);

const hashFile = (artifactPath: string): string =>
  createHash("sha256").update(readFileSync(artifactPath)).digest("hex");

// Written ONLY by a real human approval action — never by the driver prompt.
export function writeApproval(stop: Stop, artifactPath: string, repo: string): void {
  const p = tokenPath(repo, stop);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, hashFile(artifactPath));
}

export function verifyApproval(stop: Stop, artifactPath: string, repo: string): ApprovalStatus {
  const p = tokenPath(repo, stop);
  if (!existsSync(p)) return "missing";
  const recorded = readFileSync(p, "utf8").trim();
  return recorded === hashFile(artifactPath) ? "ok" : "stale";
}

export function assertPrecondition(stop: Stop, artifactPath: string, repo: string): void {
  const status = verifyApproval(stop, artifactPath, repo);
  if (status !== "ok") {
    throw new Error(
      `devloop precondition failed: stop "${stop}" is ${status} for ${artifactPath} ` +
        `(no valid human approval token under ${TOKEN_DIR}/). Fail-closed.`,
    );
  }
}
