// Critic output parsing + merging (REQ-KEY-2, REQ-CRITIC-2/3). The status comes ONLY from
// validating the raw output against the schema — never from a field the caller (or the critic)
// supplies. Anything that does not validate is "not-run", never "completed without findings".
import { CRITIC_KLASSEN, criticFindingKey } from "./finding-key.js";
const NOT_RUN = { status: "not-run", findings: [] };
const SEVERITIES = ["blocker", "major", "nit"];
const RANK = { nit: 0, major: 1, blocker: 2 };
// End index (exclusive) of the balanced JSON object starting at `start`, string-aware; -1 if none.
function objectEnd(s, start) {
    let depth = 0;
    let inStr = false;
    for (let i = start; i < s.length; i++) {
        const c = s[i];
        if (inStr) {
            if (c === "\\")
                i++;
            else if (c === '"')
                inStr = false;
        }
        else if (c === '"')
            inStr = true;
        else if (c === "{")
            depth++;
        else if (c === "}" && --depth === 0)
            return i + 1;
    }
    return -1;
}
// First JSON object in the text that has a `findings` field (text/fences around it are fine).
function findVerdictObject(raw) {
    let i = raw.indexOf("{");
    while (i !== -1) {
        const end = objectEnd(raw, i);
        if (end !== -1) {
            try {
                const v = JSON.parse(raw.slice(i, end));
                if (v && typeof v === "object" && !Array.isArray(v)) {
                    if ("findings" in v)
                        return v;
                    i = raw.indexOf("{", end);
                    continue;
                }
            }
            catch {
                /* not JSON -> try the next brace */
            }
        }
        i = raw.indexOf("{", i + 1);
    }
    return undefined;
}
function toFinding(x) {
    if (!x || typeof x !== "object")
        return undefined;
    const f = x;
    const { req, klasse, datei, severity, claim, evidence } = f;
    if (typeof req !== "string" || req === "")
        return undefined;
    if (typeof datei !== "string" || datei === "")
        return undefined;
    if (typeof claim !== "string" || typeof evidence !== "string")
        return undefined;
    if (typeof klasse !== "string" || !CRITIC_KLASSEN.includes(klasse))
        return undefined;
    if (typeof severity !== "string" || !SEVERITIES.includes(severity))
        return undefined;
    return { key: criticFindingKey({ req, klasse, datei }), source: "critic", severity: severity };
}
export function parseCriticOutput(raw) {
    const obj = findVerdictObject(raw);
    if (!obj || !Array.isArray(obj.findings))
        return NOT_RUN;
    const findings = [];
    for (const x of obj.findings) {
        const f = toFinding(x);
        if (!f)
            return NOT_RUN;
        findings.push(f);
    }
    return { status: "completed", findings };
}
export function mergeCriticRuns(runs) {
    if (runs.length === 0 || runs.some((r) => r.status !== "completed"))
        return NOT_RUN;
    const byKey = new Map();
    for (const r of runs)
        for (const f of r.findings) {
            const cur = byKey.get(f.key);
            if (!cur || RANK[f.severity] > RANK[cur.severity])
                byKey.set(f.key, f);
        }
    return { status: "completed", findings: [...byKey.values()] };
}
