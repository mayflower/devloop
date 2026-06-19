import { test, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  writeApproval,
  verifyApproval,
  assertPrecondition,
} from "../../src/core/tokens.js";

let repo: string;
let spec: string;

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "devloop-tok-"));
  spec = join(repo, "spec.md");
  writeFileSync(spec, "# Spec\nREQ-X-1: the system shall ...\n");
});

afterEach(() => rmSync(repo, { recursive: true, force: true }));

test("approval verifies ok against the exact reviewed artifact", () => {
  writeApproval("spec-review", spec, repo);
  expect(verifyApproval("spec-review", spec, repo)).toBe("ok");
});

test("missing token -> 'missing' (the gap is detectable, not silent)", () => {
  expect(verifyApproval("spec-review", spec, repo)).toBe("missing");
});

test("editing the artifact after approval -> 'stale' (content-binding breaks)", () => {
  writeApproval("spec-review", spec, repo);
  appendFileSync(spec, "\nsmuggled change after approval\n");
  expect(verifyApproval("spec-review", spec, repo)).toBe("stale");
});

test("assertPrecondition throws fail-closed on missing", () => {
  expect(() => assertPrecondition("spec-review", spec, repo)).toThrow();
});

test("assertPrecondition throws fail-closed on stale", () => {
  writeApproval("spec-review", spec, repo);
  appendFileSync(spec, "\ntamper\n");
  expect(() => assertPrecondition("spec-review", spec, repo)).toThrow();
});

test("assertPrecondition passes silently when ok", () => {
  writeApproval("spec-review", spec, repo);
  expect(() => assertPrecondition("spec-review", spec, repo)).not.toThrow();
});
