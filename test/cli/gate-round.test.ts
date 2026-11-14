import { test, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
// Wie die bestehenden CLI-Tests: gegen das gebaute dist (pretest baut).
const script = resolve(root, "dist/cli/gate-round.js");

function runRaw(stdin: string) {
  const r = spawnSync("node", [script], { encoding: "utf8", input: stdin, cwd: root });
  let out: any;
  try {
    out = JSON.parse(r.stdout);
  } catch {
    out = undefined;
  }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, out };
}
const run = (input: unknown) => runRaw(JSON.stringify(input));

const T = (testName: string, line?: number) => ({ kind: "test", file: "t.test.ts", testName, ...(line ? { line } : {}) });
const M = { kind: "mutant", file: "src/a.ts", fn: "f", mutator: "ArithmeticOperator" };
const tkey = (n: string) => `test:t.test.ts:${n}`;
const MKEY = "mutant:src/a.ts:f:ArithmeticOperator";
const e = (key: string, over: Record<string, unknown> = {}) => ({
  [key]: { key, source: "gate", severity: "blocker", state: "open", reopenCount: 0, ...over },
});

// ---- REQ-GATE-1 -----------------------------------------------------------------------------
test("[REQ-GATE-1] Ende zu Ende: Exit 0, stdout { round } mit neuem Ledger, judged/progress/oscillation", () => {
  const { status, out } = run({ raws: [T("A")], ran: ["test"], ledger: {}, addressed: [] });
  expect(status).toBe(0);
  expect(Object.keys(out)).toEqual(["round"]);
  expect(out.round.ledger[tkey("A")]).toEqual({
    key: tkey("A"),
    source: "gate",
    severity: "blocker",
    state: "open",
    reopenCount: 0,
  });
  expect(out.round.judged).toBe(false);
  expect(out.round.progress).toBe(false);
  expect(out.round.oscillation).toBe(false);
});

test("[REQ-GATE-1] falsche Stagnation behoben: Test A grün, B rot -> progress true", () => {
  const r1 = run({ raws: [T("A")], ran: ["test"], ledger: {}, addressed: [] });
  const r2 = run({ raws: [T("B")], ran: ["test"], ledger: r1.out.round.ledger, addressed: [] });
  expect(r2.out.round.judged).toBe(true);
  expect(r2.out.round.progress).toBe(true);
  expect(r2.out.round.ledger[tkey("A")].state).toBe("closed");
});

test("[REQ-GATE-1] [REQ-KEY-1] andere Zeilennummer -> derselbe Key", () => {
  const r1 = run({ raws: [T("A", 5)], ran: ["test"], ledger: {}, addressed: [] });
  const r2 = run({ raws: [T("A", 50)], ran: ["test"], ledger: r1.out.round.ledger, addressed: [] });
  expect(Object.keys(r2.out.round.ledger)).toEqual([tkey("A")]);
});

test("[REQ-GATE-1] Critic-Eintrag bleibt unverändert; addressed setzt ihn auf fixed-claimed", () => {
  const ck = "review:REQ-X-1:other:src/c.ts";
  const ledger = { [ck]: { key: ck, source: "critic", severity: "major", state: "open", reopenCount: 0 } };
  const a = run({ raws: [T("A")], ran: ["test"], ledger, addressed: [] });
  expect(a.out.round.ledger[ck].state).toBe("open");
  const b = run({ raws: [T("A")], ran: ["test"], ledger, addressed: [ck] });
  expect(b.out.round.ledger[ck].state).toBe("fixed-claimed");
});

test("[REQ-GATE-1] im Input mitgeschickte Felder 'progress', 'judged', 'round' werden ignoriert", () => {
  const { status, out } = run({
    raws: [T("A")],
    ran: ["test"],
    ledger: {},
    addressed: [],
    progress: true,
    judged: true,
    oscillation: true,
    round: { progress: true },
  });
  expect(status).toBe(0);
  expect(out.round.progress).toBe(false);
  expect(out.round.judged).toBe(false);
  expect(out.round.oscillation).toBe(false);
});

// ---- REQ-GATE-2 (Probe m) --------------------------------------------------------------------
test("[REQ-GATE-2] (Probe m) mutant offen, ran=[test] -> mutant unverändert, kein Fortschritt", () => {
  const r = run({ raws: [T("A")], ran: ["test"], ledger: e(MKEY), addressed: [] });
  expect(r.status).toBe(0);
  expect(r.out.round.ledger[MKEY]).toEqual({ key: MKEY, source: "gate", severity: "blocker", state: "open", reopenCount: 0 });
  expect(r.out.round.progress).toBe(false);
});

test("[REQ-GATE-2] (Probe m) Gegenprobe: ran=[test,mutant] -> mutant closed, progress true", () => {
  const r = run({ raws: [T("A")], ran: ["test", "mutant"], ledger: e(MKEY), addressed: [] });
  expect(r.out.round.ledger[MKEY].state).toBe("closed");
  expect(r.out.round.progress).toBe(true);
});

test("[REQ-GATE-2] Folgeprobe über drei CLI-Aufrufe: kein reopened, reopenCount 0, oscillation false", () => {
  const r1 = run({ raws: [M], ran: ["test", "mutant"], ledger: {}, addressed: [] });
  const r2 = run({ raws: [T("A")], ran: ["test"], ledger: r1.out.round.ledger, addressed: [] });
  const r3 = run({ raws: [T("A"), M], ran: ["test", "mutant"], ledger: r2.out.round.ledger, addressed: [] });
  expect(r3.out.round.ledger[MKEY].state).toBe("open");
  expect(r3.out.round.ledger[MKEY].reopenCount).toBe(0);
  expect(r3.out.round.oscillation).toBe(false);
});

// ---- REQ-GATE-3 (Probe n) --------------------------------------------------------------------
const base = { raws: [T("A")], ran: ["test"], ledger: {}, addressed: [] as unknown[] };
const without = (k: string) => {
  const { [k]: _omit, ...rest } = base as Record<string, unknown>;
  return rest;
};
const invalid: [string, string][] = [
  ["stdin leer", ""],
  ["stdin kein JSON", "nope {"],
  ["stdin JSON null", "null"],
  ["stdin JSON Array", "[]"],
  ["ran fehlt", JSON.stringify(without("ran"))],
  ["raws fehlt", JSON.stringify(without("raws"))],
  ["addressed fehlt", JSON.stringify(without("addressed"))],
  ["ledger fehlt", JSON.stringify(without("ledger"))],
  ["ledger kein Objekt", JSON.stringify({ ...base, ledger: "x" })],
  ["ledger null", JSON.stringify({ ...base, ledger: null })],
  ["raw.kind nicht in ran", JSON.stringify({ ...base, ran: ["mutant"] })],
  ["raw mit unbekannter Art", JSON.stringify({ ...base, raws: [{ kind: "lint", file: "a" }] })],
  ["ran-Eintrag unbekannte Art", JSON.stringify({ ...base, ran: ["test", "lint"] })],
  ["Pflichtfeld fehlt (test ohne testName)", JSON.stringify({ ...base, raws: [{ kind: "test", file: "t.ts" }] })],
  ["Pflichtfeld leer (trace req)", JSON.stringify({ ...base, ran: ["trace"], raws: [{ kind: "trace", req: "" }] })],
  ["mutant ohne mutator", JSON.stringify({ ...base, ran: ["mutant"], raws: [{ kind: "mutant", file: "a", fn: "f" }] })],
  ["semgrep ohne rule", JSON.stringify({ ...base, ran: ["semgrep"], raws: [{ kind: "semgrep", file: "a", fn: "f" }] })],
  ["raws kein Array", JSON.stringify({ ...base, raws: {} })],
  ["addressed-Eintrag kein String", JSON.stringify({ ...base, addressed: [1] })],
];
for (const [name, stdin] of invalid) {
  test(`[REQ-GATE-3] (Probe n) ungültig -> Exit 2, Meldung auf stderr, stdout leer: ${name}`, () => {
    const r = runRaw(stdin);
    expect(r.status).toBe(2);
    expect(r.stdout).toBe("");
    expect(r.stderr.length).toBeGreaterThan(0);
  });
}

test("[REQ-GATE-3] gültige Eingabe: stderr leer, stdout genau ein JSON-Dokument", () => {
  const r = run(base);
  expect(r.status).toBe(0);
  expect(r.out).toBeDefined();
  expect(r.stderr).toBe("");
});
