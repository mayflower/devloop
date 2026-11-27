// Shared spec.md section logic: which lines sit inside a "Bekannte Grenzen" / "Folge-Issues"
// addendum section (sub-sections inherit). Used by spec-amend-class (#27) and req-delta (#30).
export const HEADING = /^#{1,6} /;
export const NACHTRAG_TITEL = /^(Bekannte Grenzen|Folge-Issues)/;
// One flag per input line: true if the line is inside a nachtrag section (heading included).
// Lines are expected without trailing \r.
export function nachtragFlags(lines) {
    let level = null; // heading level of the enclosing nachtrag section
    return lines.map((text) => {
        if (HEADING.test(text)) {
            const l = text.indexOf(" ");
            if (level !== null && l <= level)
                level = null;
            if (level === null && NACHTRAG_TITEL.test(text.slice(l + 1).trim()))
                level = l;
        }
        return level !== null;
    });
}
