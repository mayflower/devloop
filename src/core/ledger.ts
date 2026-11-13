// Finding ledger (REQ-LEDGER-1..11). Pure: applyRound folds one evaluated round into the ledger
// and reports the progress signals nextLoopDecision consumes. Counting findings is NOT progress —
// identity over rounds is (design docs/2026-11-13-befund-ledger-critic-verdikt-design.md).

import type { Finding, Severity, Source } from "./finding-key.js";

export type EntryState = "open" | "fixed-claimed" | "closed" | "reopened";

export interface LedgerEntry {
  key: string;
  source: Source;
  severity: Severity; // highest ever seen
  state: EntryState;
  reopenCount: number;
}

export type Ledger = Record<string, LedgerEntry>;

export interface RoundInput {
  findings: Finding[];
  addressed: string[]; // keys implement explicitly reports as addressed (critic keys only count)
}

export interface RoundResult {
  ledger: Ledger;
  judged: boolean;
  progress: boolean;
  oscillation: boolean;
}

const RANK: Record<Severity, number> = { nit: 0, major: 1, blocker: 2 };
const higher = (a: Severity, b: Severity): Severity => (RANK[a] >= RANK[b] ? a : b);
const weighty = (s: Severity) => s !== "nit"; // blocker | major
const isOpenish = (s: EntryState) => s === "open" || s === "reopened";
const isDone = (s: EntryState) => s === "closed" || s === "fixed-claimed";

export function applyRound(prev: Ledger, round: RoundInput): RoundResult {
  const ledger: Ledger = {};
  for (const [k, e] of Object.entries(prev)) ledger[k] = { ...e };

  // Snapshot at round start (REQ-LEDGER-11: before `addressed` is applied).
  const start = new Map<string, { severity: Severity; state: EntryState }>();
  for (const e of Object.values(ledger)) start.set(e.key, { severity: e.severity, state: e.state });
  const judged = [...start.values()].some((e) => weighty(e.severity) && isOpenish(e.state));

  // REQ-LEDGER-4: implement's claim moves critic entries to fixed-claimed (before the compare).
  for (const key of round.addressed) {
    const e = ledger[key];
    if (e && e.source === "critic" && isOpenish(e.state)) e.state = "fixed-claimed";
  }

  // Dedupe the reported findings per key (highest severity).
  const reported = new Map<string, Finding>();
  for (const f of round.findings) {
    const cur = reported.get(f.key);
    reported.set(f.key, cur ? { ...cur, severity: higher(cur.severity, f.severity) } : f);
  }

  const reopenedNow = new Set<string>();
  for (const f of reported.values()) {
    const e = ledger[f.key];
    if (!e) {
      ledger[f.key] = { key: f.key, source: f.source, severity: f.severity, state: "open", reopenCount: 0 };
      continue;
    }
    e.severity = higher(e.severity, f.severity);
    if (isDone(e.state)) {
      e.state = "reopened"; // REQ-LEDGER-5
      e.reopenCount += 1;
      reopenedNow.add(e.key);
    }
  }

  // REQ-LEDGER-2/3: absence is evidence for deterministic gate findings only.
  for (const e of Object.values(ledger)) {
    if (!reported.has(e.key) && e.source === "gate" && isOpenish(e.state)) e.state = "closed";
  }

  const reopenedWeighty = [...reopenedNow].some((k) => weighty(ledger[k].severity));
  const resolvedWeighty = [...start.entries()].some(
    ([k, s]) => weighty(s.severity) && isOpenish(s.state) && isDone(ledger[k].state),
  );
  const progress = judged && resolvedWeighty && !reopenedWeighty;
  const oscillation = [...reopenedNow].some((k) => weighty(ledger[k].severity) && ledger[k].reopenCount >= 2);

  return { ledger, judged, progress, oscillation };
}

// REQ-CRITIC-5: the verdict is DERIVED from the ledger; a critic's self-label is never read.
export function deriveVerdict(ledger: Ledger): "accepted" | "rejected" {
  return Object.values(ledger).some((e) => weighty(e.severity) && isOpenish(e.state))
    ? "rejected"
    : "accepted";
}

// REQ-LEDGER-10: ledger as a markdown table; open blocker/major on top, fixed-claimed explicitly
// labelled as unverified.
export function renderLedgerTable(ledger: Ledger): string {
  const label = (s: EntryState) => (s === "fixed-claimed" ? "behoben (unverifiziert)" : s);
  const top = (e: LedgerEntry) => weighty(e.severity) && isOpenish(e.state);
  const rows = Object.values(ledger).sort(
    (a, b) =>
      Number(top(b)) - Number(top(a)) ||
      RANK[b.severity] - RANK[a.severity] ||
      a.key.localeCompare(b.key),
  );
  const lines = [
    "| Befund | Quelle | Schweregrad | Status | Wiederöffnet |",
    "|---|---|---|---|---|",
    ...rows.map((e) => `| ${e.key} | ${e.source} | ${e.severity} | ${label(e.state)} | ${e.reopenCount} |`),
  ];
  return lines.join("\n") + "\n";
}
