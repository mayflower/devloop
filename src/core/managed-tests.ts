// WHICH test files does devloop actually manage? (the §11 test<->code seam, scoped)
//
// The unskip seam exists to protect the tests that `spec-to-tests` derived from a reviewed
// spec — the ones `implement` may neither author nor edit. It was never meant to claim EVERY
// test file in the target repo: a repo also holds ordinary, hand-written tests (a dev tool, a
// script, a legacy suite) that have nothing to do with a devloop run. Enforcing the seam on
// those makes it impossible to ADD a normal, active test outside a `devloop/spec/*` branch.
//
// The distinction comes from a CONFIG FILE IN THE TARGET REPO — `.devloop/managed-tests.json`,
// a glob list — deliberately NOT from the branch name: an agent picks its own branch name, so a
// branch-coupled exemption is self-serve. `.devloop/**` is part of the protected set
// (protected-globs.json), so an agent cannot widen the exemption list to smuggle its own tests
// past the seam — `verify-review` fails a diff that touches the protected set, unconditionally
// and independent of tier, BEFORE the unskip step ever runs.
//
// Fail-closed & backwards compatible: NO config file (or an unreadable/malformed one) means
// EVERY test file is managed — exactly today's behaviour. No existing adopter gets looser by
// upgrading; a repo opts into the narrower scope explicitly, in a file only a human can land.

import { matchesAnyGlob } from "./glob.js";

/** Repo-relative path of the (optional) managed-test glob list. */
export const MANAGED_TESTS_PATH = ".devloop/managed-tests.json";

/** `null` = no usable configuration -> every test file is managed (fail-closed default). */
export type ManagedTestGlobs = string[] | null;

/**
 * Parse `.devloop/managed-tests.json`. Accepts a bare array (like protected-globs.json /
 * bot-logins.json) or `{ "globs": [...] }`. Anything else — absent, empty, invalid JSON, wrong
 * shape, non-string entries — yields `null` (= manage everything), never a partial list: a
 * half-understood config must not silently disarm the seam.
 *
 * An EXPLICIT empty array is honoured (`[]` = "no devloop-managed tests here"); it is a
 * deliberate statement in a protected file, not an accident.
 */
export function parseManagedTestGlobs(raw: string | null | undefined): ManagedTestGlobs {
  if (raw === null || raw === undefined || raw.trim() === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null; // malformed -> fail closed
  }
  const globs = Array.isArray(parsed)
    ? parsed
    : typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { globs?: unknown }).globs)
      ? ((parsed as { globs: unknown[] }).globs)
      : null;
  if (globs === null) return null; // wrong shape -> fail closed
  if (!globs.every((g) => typeof g === "string")) return null; // non-string entry -> fail closed
  return globs as string[];
}

/** Is this repo-relative test path devloop-managed (i.e. does the unskip seam apply to it)? */
export function isManagedTestPath(path: string, globs: ManagedTestGlobs): boolean {
  return globs === null ? true : matchesAnyGlob(path, globs);
}
