// Gate rounds in the core (REQ-GATE-1..3). Pure: translates structured gate findings into keys,
// folds them into the ledger via applyRound, and leaves entries of gate kinds that did NOT run
// this round untouched (absence of a skipped job is no evidence, REQ-GATE-2).

import { gateFinding, type GateRaw } from "./finding-key.js";
import { applyRound, type Ledger, type RoundResult } from "./ledger.js";

export type GateKind = GateRaw["kind"];
const GATE_KINDS: readonly GateKind[] = ["test", "mutant", "semgrep", "trace"];

export interface GateRoundInput {
  raws: GateRaw[];
  ran: GateKind[];
  addressed: string[];
}

const isKind = (x: unknown): x is GateKind => typeof x === "string" && (GATE_KINDS as readonly string[]).includes(x);
const nonEmpty = (x: unknown): x is string => typeof x === "string" && x.length > 0;
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

function parseRaw(x: unknown): GateRaw | undefined {
  if (!isObj(x)) return undefined;
  switch (x.kind) {
    case "test":
      return nonEmpty(x.file) && nonEmpty(x.testName) ? { kind: "test", file: x.file, testName: x.testName } : undefined;
    case "mutant":
      return nonEmpty(x.file) && nonEmpty(x.fn) && nonEmpty(x.mutator)
        ? { kind: "mutant", file: x.file, fn: x.fn, mutator: x.mutator }
        : undefined;
    case "semgrep":
      return nonEmpty(x.rule) && nonEmpty(x.file) && nonEmpty(x.fn)
        ? { kind: "semgrep", rule: x.rule, file: x.file, fn: x.fn }
        : undefined;
    case "trace":
      return nonEmpty(x.req) ? { kind: "trace", req: x.req } : undefined;
    default:
      return undefined;
  }
}

// REQ-GATE-3: strict; anything invalid -> undefined (caller aborts, never a silent empty round).
// Only raws/ran/addressed are read; any other field is dropped.
export function parseGateRoundInput(x: unknown): GateRoundInput | undefined {
  if (!isObj(x) || !Array.isArray(x.raws) || !Array.isArray(x.ran) || !Array.isArray(x.addressed)) return undefined;
  if (!x.ran.every(isKind) || !x.addressed.every((k) => typeof k === "string")) return undefined;
  const raws: GateRaw[] = [];
  for (const r of x.raws) {
    const p = parseRaw(r);
    if (!p || !x.ran.includes(p.kind)) return undefined;
    raws.push(p);
  }
  return { raws, ran: [...x.ran] as GateKind[], addressed: [...(x.addressed as string[])] };
}

const kindOf = (key: string): string => key.slice(0, key.indexOf(":"));

export function applyGateRound(prev: Ledger, input: GateRoundInput): RoundResult {
  const held: Ledger = {};
  const active: Ledger = {};
  for (const [k, e] of Object.entries(prev)) {
    const kind = kindOf(k);
    if (e.source === "gate" && isKind(kind) && !input.ran.includes(kind)) held[k] = { ...e };
    else active[k] = e;
  }
  const r = applyRound(active, { findings: input.raws.map(gateFinding), addressed: input.addressed });
  // A held open blocker/major was open at round start: the round is judged (REQ-LEDGER-11).
  const heldOpen = Object.values(held).some(
    (e) => e.severity !== "nit" && (e.state === "open" || e.state === "reopened"),
  );
  return { ...r, judged: r.judged || heldOpen, ledger: { ...r.ledger, ...held } };
}
