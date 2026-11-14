// Finding identity (REQ-KEY-1/2). A key identifies a defect across rounds. It contains NO line
// number and NO free text — only stable coordinates (file / function / rule / REQ-ID).
export const CRITIC_KLASSEN = [
    "req-uncovered",
    "happy-path-only",
    "spec-deviation",
    "convention",
    "security",
    "other",
];
export function gateFindingKey(raw) {
    switch (raw.kind) {
        case "test":
            return `test:${raw.file}:${raw.testName}`;
        case "mutant":
            return `mutant:${raw.file}:${raw.fn}:${raw.mutator}`;
        case "semgrep":
            return `semgrep:${raw.rule}:${raw.file}:${raw.fn}`;
        case "trace":
            return `trace:${raw.req}`;
    }
}
// Deliberately file-granular (not function-granular): fresh critics localise the same defect
// differently. Extra fields (line, claim, evidence) are accepted and ignored.
export function criticFindingKey(c) {
    return `review:${c.req}:${c.klasse}:${c.datei}`;
}
// Gate findings are deterministic and always blockers.
export function gateFinding(raw) {
    return { key: gateFindingKey(raw), source: "gate", severity: "blocker" };
}
