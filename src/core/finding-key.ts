// Finding identity (REQ-KEY-1/2). A key identifies a defect across rounds. It contains NO line
// number and NO free text — only stable coordinates (file / function / rule / REQ-ID).

export type Severity = "blocker" | "major" | "nit";
export type Source = "gate" | "critic";

export interface Finding {
  key: string;
  source: Source;
  severity: Severity;
}

export type GateRaw =
  | { kind: "test"; file: string; testName: string; line?: number }
  | { kind: "mutant"; file: string; fn: string; mutator: string; line?: number }
  | { kind: "semgrep"; rule: string; file: string; fn: string; line?: number }
  | { kind: "trace"; req: string };

export const CRITIC_KLASSEN = [
  "req-uncovered",
  "happy-path-only",
  "spec-deviation",
  "convention",
  "security",
  "other",
] as const;
export type Klasse = (typeof CRITIC_KLASSEN)[number];

export function gateFindingKey(raw: GateRaw): string {
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
export function criticFindingKey(c: { req: string; klasse: string; datei: string }): string {
  return `review:${c.req}:${c.klasse}:${c.datei}`;
}

// Gate findings are deterministic and always blockers.
export function gateFinding(raw: GateRaw): Finding {
  return { key: gateFindingKey(raw), source: "gate", severity: "blocker" };
}
