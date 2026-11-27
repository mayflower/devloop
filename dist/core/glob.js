// Dependency-free glob matching (so the shipped dist needs no runtime deps).
// Supports: ** (any chars incl. /), **/ (zero-or-more leading dirs), * (non-slash), ? (one non-slash).
// Line terminators (LF, CR, U+2028, U+2029) in a path are ordinary characters: the "s" flag lets ** match them.
export function globToRegExp(glob) {
    let re = "";
    for (let i = 0; i < glob.length; i++) {
        const c = glob[i];
        if (c === "*") {
            if (glob[i + 1] === "*") {
                if (glob[i + 2] === "/") {
                    re += "(?:.*/)?";
                    i += 2;
                }
                else {
                    re += ".*";
                    i += 1;
                }
            }
            else {
                re += "[^/]*";
            }
        }
        else if (c === "?") {
            re += "[^/]";
        }
        else {
            re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
        }
    }
    return new RegExp("^" + re + "$", "s");
}
export const matchesAnyGlob = (path, globs) => globs.some((g) => globToRegExp(g).test(path));
