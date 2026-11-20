// Smoke report parsing (REQ-SMOKE-2/3). The status is DERIVED from validating the station's raw
// report — never taken from a label the station (or the caller) supplies. Anything that does not
// validate is "not-run", never "passed".
//
// A smoke case is only valid with an observed EFFECT (state before/after on the real consumer
// path, e.g. a DB row, a rendered page, a stored file) — a bare HTTP status is not a smoke.

export type SmokeStatus = "passed" | "not-applicable" | "failed" | "not-run";
export const SMOKE_MODES = ["browser", "api", "cli", "other"] as const;

export interface SmokeCase {
  id: string;
  req: string | null;
  mode: (typeof SMOKE_MODES)[number];
  action: string;
  expected: string;
  observed: string;
  effect: string;
  pass: boolean;
}

export interface SmokeConsumer {
  changed: string;
  caller: string;
  evidence: string;
}

export interface SmokeRun {
  status: SmokeStatus;
  cases: SmokeCase[];
  failedCases: string[];
  consumers: SmokeConsumer[];
  notApplicable: string | null;
  abnahme: string | null;
}

const NOT_RUN: SmokeRun = {
  status: "not-run",
  cases: [],
  failedCases: [],
  consumers: [],
  notApplicable: null,
  abnahme: null,
};

const nonEmpty = (x: unknown): x is string => typeof x === "string" && x.trim() !== "";

// End index (exclusive) of the balanced JSON object starting at `start`, string-aware; -1 if none.
function objectEnd(s: string, start: number): number {
  let depth = 0;
  let inStr = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i + 1;
  }
  return -1;
}

// THE top-level JSON object in the text that has a `cases` field. More than one such object (a
// quoted schema example, an earlier run printed alongside) is ambiguous -> undefined (not-run):
// picking the first would let a green example mask a red real report.
function findReport(raw: string): Record<string, unknown> | undefined {
  const found: Record<string, unknown>[] = [];
  let i = raw.indexOf("{");
  while (i !== -1) {
    const end = objectEnd(raw, i);
    if (end !== -1) {
      try {
        const v: unknown = JSON.parse(raw.slice(i, end));
        if (v && typeof v === "object" && !Array.isArray(v)) {
          if ("cases" in v) found.push(v as Record<string, unknown>);
          i = raw.indexOf("{", end);
          continue;
        }
      } catch {
        /* not JSON -> next brace */
      }
    }
    i = raw.indexOf("{", i + 1);
  }
  return found.length === 1 ? found[0] : undefined;
}

const TIERS = ["T0", "T1", "T2", "T3"] as const;
export type SmokeTier = (typeof TIERS)[number];

// `.devloop/config.json` -> smoke.tiers. Absent config / absent `smoke` / absent `tiers` -> [] (off).
// Present but malformed -> undefined: the caller must fail closed (refuse), never read it as "off".
export function readSmokeTiers(config: unknown): SmokeTier[] | undefined {
  if (config === undefined || config === null) return [];
  if (typeof config !== "object" || Array.isArray(config)) return undefined;
  const smoke = (config as Record<string, unknown>).smoke;
  if (smoke === undefined) return [];
  if (!smoke || typeof smoke !== "object" || Array.isArray(smoke)) return undefined;
  const tiers = (smoke as Record<string, unknown>).tiers;
  if (tiers === undefined) return [];
  if (!Array.isArray(tiers)) return undefined;
  if (!tiers.every((t) => typeof t === "string" && (TIERS as readonly string[]).includes(t))) return undefined;
  return [...new Set(tiers as SmokeTier[])];
}

function toConsumer(x: unknown): SmokeConsumer | undefined {
  if (!x || typeof x !== "object") return undefined;
  const c = x as Record<string, unknown>;
  if (!nonEmpty(c.changed) || !nonEmpty(c.caller) || !nonEmpty(c.evidence)) return undefined;
  return { changed: c.changed, caller: c.caller, evidence: c.evidence };
}

function toCase(x: unknown): SmokeCase | undefined {
  if (!x || typeof x !== "object") return undefined;
  const c = x as Record<string, unknown>;
  if (!nonEmpty(c.id) || !nonEmpty(c.action) || !nonEmpty(c.expected)) return undefined;
  if (!nonEmpty(c.observed) || !nonEmpty(c.effect)) return undefined;
  if (typeof c.pass !== "boolean") return undefined;
  if (typeof c.mode !== "string" || !(SMOKE_MODES as readonly string[]).includes(c.mode)) return undefined;
  if (c.req !== null && c.req !== undefined && typeof c.req !== "string") return undefined;
  return {
    id: c.id,
    req: typeof c.req === "string" ? c.req : null,
    mode: c.mode as SmokeCase["mode"],
    action: c.action,
    expected: c.expected,
    observed: c.observed,
    effect: c.effect,
    pass: c.pass,
  };
}

export function parseSmokeReport(raw: string): SmokeRun {
  const r = findReport(raw);
  if (!r || !Array.isArray(r.cases) || !Array.isArray(r.consumers)) return NOT_RUN;

  const setup = r.setup as Record<string, unknown> | undefined;
  if (!setup || typeof setup !== "object" || setup.ok !== true) return NOT_RUN; // stack never stood

  const consumers: SmokeConsumer[] = [];
  for (const x of r.consumers) {
    const c = toConsumer(x);
    if (!c) return NOT_RUN;
    consumers.push(c);
  }
  const cases: SmokeCase[] = [];
  for (const x of r.cases) {
    const c = toCase(x);
    if (!c) return NOT_RUN;
    cases.push(c);
  }
  if (new Set(cases.map((c) => c.id)).size !== cases.length) return NOT_RUN;

  const notApplicable = nonEmpty(r.notApplicable) ? r.notApplicable : null;
  const abnahme = nonEmpty(r.abnahme) ? r.abnahme : null;

  if (cases.length === 0) {
    // "Nothing to smoke" must be argued: a reason AND the consumer analysis it rests on.
    if (notApplicable === null || consumers.length === 0) return NOT_RUN;
    return { status: "not-applicable", cases, failedCases: [], consumers, notApplicable, abnahme };
  }
  if (notApplicable !== null) return NOT_RUN; // contradictory: cases ran but "not applicable"
  if (abnahme === null) return NOT_RUN; // the human's acceptance guide is part of the deliverable
  if (consumers.length === 0) return NOT_RUN; // no consumer analysis -> mode choice unfounded

  const failedCases = cases.filter((c) => !c.pass).map((c) => c.id);
  return {
    status: failedCases.length > 0 ? "failed" : "passed",
    cases,
    failedCases,
    consumers,
    notApplicable: null,
    abnahme,
  };
}
