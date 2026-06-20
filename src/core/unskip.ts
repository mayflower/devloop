// The unskip seam (Obol pilot §4): spec-to-tests writes the COMPLETE test, skipped; implement
// may ONLY remove `.skip`. This is where the test<->code separation (§11 #3) stands or falls,
// so it is machine-audited here (not prompt-trusted).
//
// isUnskipOnly(old, new) is true iff `new` can be produced from `old` by DELETING zero or more
// `.skip` tokens — nothing else. Editing an assertion/title, adding/removing a test, or ADDING
// a `.skip` anywhere (sneaking a test off — even while unskipping another) is forbidden.

const SKIP = ".skip";
const isWordChar = (c: string | undefined): boolean => c !== undefined && /\w/.test(c);
// A `.skip` token only counts at a word boundary (so `.skipped` is not treated as `.skip`).
const skipAt = (s: string, i: number): boolean =>
  s.startsWith(SKIP, i) && !isWordChar(s[i + SKIP.length]);

// Does the source contain an ACTIVE (non-skipped) test call? Matches `it`/`test` with any
// chained props (e.g. .only/.each/.skip) before the call paren; active unless the chain has
// `.skip`. `describe(` is a container, not a test, so it is ignored.
const TEST_CALL = /\b(?:it|test)((?:\.\w+)*)\s*\(/g;
export function hasActiveTest(content: string): boolean {
  for (const m of content.matchAll(TEST_CALL)) {
    if (!/\.skip\b/.test(m[1])) return true;
  }
  return false;
}

// Unified rule for the precondition-check (runs on BOTH the spec PR and the implement PR):
//   - NEW test file (old empty): authoring is allowed — but every test must be `.skip`'d, so
//     nothing secretly-active lands on a green main (spec-PR authoring by spec-to-tests).
//   - EXISTING test file: only `.skip` removal is allowed (implement PR).
// Safe on both: implement cannot smuggle an active test via a new file (would have to be all
// `.skip`'d = inert), nor edit assertions of existing files.
export function isAllowedTestEdit(oldContent: string, newContent: string): boolean {
  if (oldContent === "") return !hasActiveTest(newContent);
  return isUnskipOnly(oldContent, newContent);
}

export function isUnskipOnly(oldContent: string, newContent: string): boolean {
  let i = 0; // pointer into old
  let j = 0; // pointer into new
  while (i < oldContent.length && j < newContent.length) {
    if (oldContent[i] === newContent[j]) {
      i++;
      j++;
    } else if (skipAt(oldContent, i)) {
      i += SKIP.length; // a `.skip` present in old but not new -> removed (allowed)
    } else {
      return false; // a difference that is not a removed `.skip`
    }
  }
  // Drain any trailing removed `.skip` tokens in old.
  while (skipAt(oldContent, i)) i += SKIP.length;
  // Allowed only if both fully consumed: nothing in new is unmatched (no added content/skips),
  // nothing left in old except removed skips.
  return i === oldContent.length && j === newContent.length;
}
