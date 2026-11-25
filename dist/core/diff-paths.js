// Parses the output of `git diff --no-renames -z --name-only`: NUL-separated, unquoted paths.
// Empty entries (the trailing NUL, or an empty output) are dropped.
export function parseNulPaths(raw) {
    return raw.split("\0").filter((p) => p !== "");
}
