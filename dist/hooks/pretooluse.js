// Local PreToolUse hook — the CONVENIENCE (bypassable) layer of the binding anchor
// (design §0.2). The AUTHORITATIVE guarantee is the CI required-check (precondition-check);
// this hook just fails fast locally: it blocks a merge action when the t3-merge approval
// token is absent in the project dir. Coarse on purpose (content-binding is CI's job).
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const MERGE_PATTERN = /\b(git\s+merge|gh\s+pr\s+merge)\b/;
export function evaluateHook(input, repo) {
    if (input.tool_name !== "Bash")
        return { block: false };
    const command = input.tool_input?.command ?? "";
    if (!MERGE_PATTERN.test(command))
        return { block: false };
    // Scope: this is a GLOBAL plugin hook. Only act in devloop-managed repos (those that
    // ran /devloop:init -> have a .devloop/ dir). Elsewhere it must be a no-op, so it never
    // interferes with merges in unrelated repos.
    if (!existsSync(join(repo, ".devloop")))
        return { block: false };
    const tokenPresent = existsSync(join(repo, ".devloop", "t3-merge.approved"));
    if (tokenPresent)
        return { block: false };
    return {
        block: true,
        reason: "devloop: merge blocked — no t3-merge approval token in .devloop/. " +
            "The merge stop is human-gated (design §9). (Authoritative gate: CI precondition-check.)",
    };
}
// --- Runner: only when executed directly (not when imported by tests) ---
function isMain() {
    return !!process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}
if (isMain()) {
    const chunks = [];
    for await (const chunk of process.stdin)
        chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8") || "{}";
    const input = JSON.parse(raw);
    const repo = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
    const result = evaluateHook(input, repo);
    if (result.block) {
        process.stderr.write((result.reason ?? "devloop: blocked") + "\n");
        process.exit(2); // exit 2 = blocking error for PreToolUse hooks
    }
    process.exit(0);
}
