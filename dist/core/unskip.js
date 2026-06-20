// The unskip seam (Obol pilot §4): spec-to-tests writes the COMPLETE test, skipped; implement
// may ONLY remove `.skip`. This is where the test<->code separation (§11 #3) stands or falls,
// so it is machine-audited here (not prompt-trusted).
//
// isUnskipOnly(old, new) is true iff `new` can be produced from `old` by DELETING zero or more
// `.skip` tokens — nothing else. Editing an assertion/title, adding/removing a test, or ADDING
// a `.skip` anywhere (sneaking a test off — even while unskipping another) is forbidden.
const SKIP = ".skip";
const isWordChar = (c) => c !== undefined && /\w/.test(c);
// A `.skip` token only counts at a word boundary (so `.skipped` is not treated as `.skip`).
const skipAt = (s, i) => s.startsWith(SKIP, i) && !isWordChar(s[i + SKIP.length]);
export function isUnskipOnly(oldContent, newContent) {
    let i = 0; // pointer into old
    let j = 0; // pointer into new
    while (i < oldContent.length && j < newContent.length) {
        if (oldContent[i] === newContent[j]) {
            i++;
            j++;
        }
        else if (skipAt(oldContent, i)) {
            i += SKIP.length; // a `.skip` present in old but not new -> removed (allowed)
        }
        else {
            return false; // a difference that is not a removed `.skip`
        }
    }
    // Drain any trailing removed `.skip` tokens in old.
    while (skipAt(oldContent, i))
        i += SKIP.length;
    // Allowed only if both fully consumed: nothing in new is unmatched (no added content/skips),
    // nothing left in old except removed skips.
    return i === oldContent.length && j === newContent.length;
}
