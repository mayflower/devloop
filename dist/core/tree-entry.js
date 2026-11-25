// Reads the ENTRY of a path in a git ref (type + mode + full content), without a shell.
// "Path absent in this ref" is a normal result ({kind:"missing"}); every other failure to
// determine the entry or its content THROWS (a read error must never look like "empty").
import { execFileSync } from "node:child_process";
// Contents up to this size are read completely; larger ones are a read error (fail-closed).
export const MAX_BLOB_BYTES = 64 * 1024 * 1024;
export class TreeEntryReadError extends Error {
}
const git = (repo, args, maxBuffer) => {
    try {
        return execFileSync("git", ["-C", repo, ...args], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
            maxBuffer,
        });
    }
    catch (e) {
        const err = e;
        const detail = String(err.stderr ?? "").trim() || err.message || String(e);
        throw new TreeEntryReadError(detail);
    }
};
export function readTreeEntry(repo, ref, path) {
    const where = `${path} @ ${ref}`;
    try {
        const raw = git(repo, ["ls-tree", "-z", ref, "--", path], 16 * 1024 * 1024);
        const records = raw.split("\0").filter((r) => r !== "");
        if (records.length === 0)
            return { kind: "missing" };
        // Exact path match: never trust "some line came back".
        let found;
        for (const rec of records) {
            const m = /^(\d+) (\w+) ([0-9a-f]+)\t([\s\S]*)$/.exec(rec);
            if (!m)
                throw new TreeEntryReadError(`unparsable ls-tree record`);
            if (m[4] === path)
                found = { mode: m[1], type: m[2], oid: m[3] };
        }
        if (!found)
            throw new TreeEntryReadError("ls-tree returned no entry for the exact path");
        if (found.mode === "120000")
            return { kind: "symlink" };
        if (found.mode === "160000" || found.type === "commit")
            return { kind: "submodule" };
        if (found.mode === "100644" || found.mode === "100755") {
            const content = git(repo, ["cat-file", "blob", found.oid], MAX_BLOB_BYTES);
            return { kind: "file", mode: found.mode, content };
        }
        return { kind: "other", type: found.type };
    }
    catch (e) {
        if (e instanceof TreeEntryReadError) {
            throw new TreeEntryReadError(`cannot read ${where}: ${e.message}`);
        }
        throw e;
    }
}
