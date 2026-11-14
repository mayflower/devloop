import { test, expect } from "vitest";
import { applyGateRound, parseGateRoundInput, type GateRoundInput } from "../../src/core/gate-round.js";
import { applyRound, type Ledger, type LedgerEntry } from "../../src/core/ledger.js";
import { gateFinding, type GateRaw } from "../../src/core/finding-key.js";

// ---- Helfer ---------------------------------------------------------------------------------
const tst = (testName: string, line?: number): GateRaw => ({ kind: "test", file: "t.test.ts", testName, ...(line ? { line } : {}) });
const mut = (fn = "f"): GateRaw => ({ kind: "mutant", file: "src/a.ts", fn, mutator: "ArithmeticOperator" });
const sem = (): GateRaw => ({ kind: "semgrep", rule: "no-eval", file: "src/a.ts", fn: "f" });
const trc = (req = "REQ-X-1"): GateRaw => ({ kind: "trace", req });
const key = (r: GateRaw) => gateFinding(r).key;
const input = (raws: GateRaw[], ran: GateRoundInput["ran"], addressed: string[] = []): GateRoundInput => ({
  raws,
  ran,
  addressed,
});
const entry = (k: string, over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  key: k,
  source: "gate",
  severity: "blocker",
  state: "open",
  reopenCount: 0,
  ...over,
});
const critKey = "review:REQ-X-1:other:src/c.ts";
const critEntry = (over: Partial<LedgerEntry> = {}) => entry(critKey, { source: "critic", severity: "major", ...over });

// ---- REQ-GATE-1 -----------------------------------------------------------------------------
test("[REQ-GATE-1] Gate-Befunde aller vier Arten landen unter ihrem gateFinding-Key als open blocker", () => {
  const raws = [tst("a"), mut(), sem(), trc()];
  const r = applyGateRound({}, input(raws, ["test", "mutant", "semgrep", "trace"]));
  expect(Object.keys(r.ledger).sort()).toEqual(raws.map(key).sort());
  for (const raw of raws) expect(r.ledger[key(raw)]).toEqual(entry(key(raw)));
});

test("[REQ-GATE-1] [REQ-KEY-1] derselbe Test mit anderer Zeilennummer -> derselbe Key, kein neuer Eintrag", () => {
  const r1 = applyGateRound({}, input([tst("a", 10)], ["test"]));
  const r2 = applyGateRound(r1.ledger, input([tst("a", 99)], ["test"]));
  expect(Object.keys(r2.ledger)).toEqual([key(tst("a"))]);
  expect(Object.keys(r2.ledger)).toEqual(Object.keys(r1.ledger));
  expect(r2.ledger[key(tst("a"))].state).toBe("open");
  expect(r2.ledger[key(tst("a"))].reopenCount).toBe(0);
});

test("[REQ-GATE-1] gleiche Eingabe wie applyRound mit gateFinding, wenn alle Arten gelaufen sind", () => {
  const prev = applyGateRound({}, input([tst("a"), mut()], ["test", "mutant"])).ledger;
  const raws = [tst("b"), mut()];
  const viaGate = applyGateRound(prev, input(raws, ["test", "mutant", "semgrep", "trace"], []));
  const viaRound = applyRound(prev, { findings: raws.map(gateFinding), addressed: [] });
  expect(viaGate).toEqual(viaRound);
});

test("[REQ-GATE-1] falsche Stagnation behoben: R1 Test A rot; R2 A grün, B rot -> progress true, judged true", () => {
  const r1 = applyGateRound({}, input([tst("A")], ["test"]));
  expect(r1.judged).toBe(false);
  const r2 = applyGateRound(r1.ledger, input([tst("B")], ["test"]));
  expect(r2.judged).toBe(true);
  expect(r2.progress).toBe(true);
  expect(r2.ledger[key(tst("A"))].state).toBe("closed");
  expect(r2.ledger[key(tst("B"))].state).toBe("open");
});

test("[REQ-GATE-1] derselbe Test bleibt rot -> kein Fortschritt", () => {
  const r1 = applyGateRound({}, input([tst("A")], ["test"]));
  const r2 = applyGateRound(r1.ledger, input([tst("A")], ["test"]));
  expect(r2.judged).toBe(true);
  expect(r2.progress).toBe(false);
});

test("[REQ-GATE-1] Critic-Einträge bleiben bei Abwesenheit unverändert (auch bei ran mit allen Arten)", () => {
  const prev: Ledger = { [critKey]: critEntry() };
  const r = applyGateRound(prev, input([tst("A")], ["test", "mutant", "semgrep", "trace"]));
  expect(r.ledger[critKey]).toEqual(critEntry());
});

test("[REQ-GATE-1] addressed setzt Critic-Keys auf fixed-claimed, Gate-Keys nicht", () => {
  const gk = key(tst("A"));
  const prev: Ledger = { [critKey]: critEntry(), [gk]: entry(gk) };
  const r = applyGateRound(prev, input([tst("A")], ["test"], [critKey, gk]));
  expect(r.ledger[critKey].state).toBe("fixed-claimed");
  expect(r.ledger[gk].state).toBe("open");
});

// ---- REQ-GATE-2 (Probe m) --------------------------------------------------------------------
test("[REQ-GATE-2] (Probe m) mutant-Blocker offen, Runde ran=[test] -> mutant unverändert (open, reopenCount 0), nicht closed, kein Fortschritt", () => {
  const mk = key(mut());
  const r1 = applyGateRound({}, input([mut()], ["test", "mutant"]));
  expect(r1.ledger[mk].state).toBe("open");
  const r2 = applyGateRound(r1.ledger, input([tst("A")], ["test"]));
  expect(r2.ledger[mk]).toEqual(entry(mk, { state: "open", reopenCount: 0 }));
  expect(r2.judged).toBe(true);
  expect(r2.progress).toBe(false);
});

test("[REQ-GATE-2] (Probe m) Gegenprobe: ran=[test,mutant], mutant nicht mehr gemeldet -> closed, progress true", () => {
  const mk = key(mut());
  const r1 = applyGateRound({}, input([mut()], ["test", "mutant"]));
  const r2 = applyGateRound(r1.ledger, input([tst("A")], ["test", "mutant"]));
  expect(r2.ledger[mk].state).toBe("closed");
  expect(r2.progress).toBe(true);
});

test("[REQ-GATE-2] (Probe m) jede nicht gelaufene Art bleibt komplett unverändert (Zustand, reopenCount, Schweregrad)", () => {
  const prev: Ledger = {
    [key(tst("T"))]: entry(key(tst("T")), { state: "reopened", reopenCount: 1 }),
    [key(mut())]: entry(key(mut()), { state: "fixed-claimed", reopenCount: 2, severity: "blocker" }),
    [key(sem())]: entry(key(sem()), { state: "open", severity: "major" }),
    [key(trc())]: entry(key(trc()), { state: "closed", reopenCount: 1 }),
  };
  // ran = nur "test"; der Testbefund T bleibt gemeldet, die übrigen drei Arten sind nicht gelaufen
  const r = applyGateRound(prev, input([tst("T")], ["test"]));
  expect(r.ledger[key(mut())]).toEqual(prev[key(mut())]);
  expect(r.ledger[key(sem())]).toEqual(prev[key(sem())]);
  expect(r.ledger[key(trc())]).toEqual(prev[key(trc())]);
});

test("[REQ-GATE-2] (Probe m) Eingabe-Ledger wird nicht mutiert", () => {
  const prev = applyGateRound({}, input([mut()], ["mutant"])).ledger;
  const snapshot = JSON.parse(JSON.stringify(prev));
  applyGateRound(prev, input([], ["test"]));
  expect(prev).toEqual(snapshot);
});

test("[REQ-GATE-2] Folgeprobe: R1 mutant offen; R2 mutant nicht gelaufen; R3 mutant wieder gemeldet -> kein reopened, reopenCount 0, oscillation false", () => {
  const mk = key(mut());
  const r1 = applyGateRound({}, input([mut()], ["test", "mutant"]));
  const r2 = applyGateRound(r1.ledger, input([tst("A")], ["test"]));
  const r3 = applyGateRound(r2.ledger, input([tst("A"), mut()], ["test", "mutant"]));
  expect(r3.ledger[mk].state).toBe("open");
  expect(r3.ledger[mk].state).not.toBe("reopened");
  expect(r3.ledger[mk].reopenCount).toBe(0);
  expect(r3.oscillation).toBe(false);
});

test("[REQ-GATE-2] gelaufene Art, Befund fehlt -> closed (REQ-LEDGER-2 gilt für gelaufene Arten)", () => {
  const r1 = applyGateRound({}, input([sem()], ["semgrep"]));
  const r2 = applyGateRound(r1.ledger, input([], ["semgrep"]));
  expect(r2.ledger[key(sem())].state).toBe("closed");
});

test("[REQ-GATE-2] ran=[] -> alle Gate-Einträge unverändert, kein Fortschritt", () => {
  const r1 = applyGateRound({}, input([tst("A"), mut()], ["test", "mutant"]));
  const r2 = applyGateRound(r1.ledger, input([], []));
  expect(r2.ledger).toEqual(r1.ledger);
  expect(r2.progress).toBe(false);
});

// ---- REQ-GATE-3 (Probe n) --------------------------------------------------------------------
const okBase = { raws: [{ kind: "test", file: "t.ts", testName: "a" }], ran: ["test"], addressed: [] };
const invalid: [string, unknown][] = [
  ["null", null],
  ["String statt Objekt", "x"],
  ["Zahl statt Objekt", 42],
  ["Array statt Objekt", []],
  ["ran fehlt", { raws: okBase.raws, addressed: [] }],
  ["raws fehlt", { ran: ["test"], addressed: [] }],
  ["addressed fehlt", { raws: okBase.raws, ran: ["test"] }],
  ["raws kein Array", { ...okBase, raws: {} }],
  ["ran kein Array", { ...okBase, ran: "test" }],
  ["addressed kein Array", { ...okBase, addressed: "k" }],
  ["raw kein Objekt", { ...okBase, raws: ["test"] }],
  ["raw mit unbekannter Art", { ...okBase, raws: [{ kind: "lint", file: "a" }] }],
  ["raw ohne kind", { ...okBase, raws: [{ file: "t.ts", testName: "a" }] }],
  ["ran-Eintrag unbekannte Art", { ...okBase, ran: ["test", "lint"] }],
  ["ran-Eintrag kein String", { ...okBase, ran: ["test", 1] }],
  ["raw.kind nicht in ran", { ...okBase, ran: ["mutant"] }],
  ["raw.kind nicht in ran (ran leer)", { ...okBase, ran: [] }],
  ["addressed-Eintrag kein String", { ...okBase, addressed: [1] }],
  ["test ohne file", { ...okBase, raws: [{ kind: "test", testName: "a" }] }],
  ["test ohne testName", { ...okBase, raws: [{ kind: "test", file: "t.ts" }] }],
  ["test mit leerem file", { ...okBase, raws: [{ kind: "test", file: "", testName: "a" }] }],
  ["test mit leerem testName", { ...okBase, raws: [{ kind: "test", file: "t.ts", testName: "" }] }],
  ["test mit file als Zahl", { ...okBase, raws: [{ kind: "test", file: 1, testName: "a" }] }],
  ["mutant ohne file", { ...okBase, ran: ["mutant"], raws: [{ kind: "mutant", fn: "f", mutator: "m" }] }],
  ["mutant ohne fn", { ...okBase, ran: ["mutant"], raws: [{ kind: "mutant", file: "a", mutator: "m" }] }],
  ["mutant ohne mutator", { ...okBase, ran: ["mutant"], raws: [{ kind: "mutant", file: "a", fn: "f" }] }],
  ["mutant mit leerem mutator", { ...okBase, ran: ["mutant"], raws: [{ kind: "mutant", file: "a", fn: "f", mutator: "" }] }],
  ["semgrep ohne rule", { ...okBase, ran: ["semgrep"], raws: [{ kind: "semgrep", file: "a", fn: "f" }] }],
  ["semgrep ohne file", { ...okBase, ran: ["semgrep"], raws: [{ kind: "semgrep", rule: "r", fn: "f" }] }],
  ["semgrep ohne fn", { ...okBase, ran: ["semgrep"], raws: [{ kind: "semgrep", rule: "r", file: "a" }] }],
  ["semgrep mit leerer rule", { ...okBase, ran: ["semgrep"], raws: [{ kind: "semgrep", rule: "", file: "a", fn: "f" }] }],
  ["trace ohne req", { ...okBase, ran: ["trace"], raws: [{ kind: "trace" }] }],
  ["trace mit leerem req", { ...okBase, ran: ["trace"], raws: [{ kind: "trace", req: "" }] }],
  ["gültiger und ungültiger raw gemischt", { ...okBase, raws: [okBase.raws[0], { kind: "test", file: "t.ts" }] }],
];

for (const [name, bad] of invalid) {
  test(`[REQ-GATE-3] (Probe n) ungültig -> undefined: ${name}`, () => {
    expect(parseGateRoundInput(bad)).toBeUndefined();
  });
}

test("[REQ-GATE-3] gültige Eingaben aller Arten werden angenommen; line optional und ignoriert", () => {
  const raws = [
    { kind: "test", file: "t.ts", testName: "a", line: 3 },
    { kind: "mutant", file: "a", fn: "f", mutator: "m" },
    { kind: "semgrep", rule: "r", file: "a", fn: "f", line: 1 },
    { kind: "trace", req: "REQ-X-1" },
  ];
  const p = parseGateRoundInput({ raws, ran: ["test", "mutant", "semgrep", "trace"], addressed: ["k"] });
  expect(p).toBeDefined();
  expect(p!.raws).toHaveLength(4);
  expect(p!.ran).toEqual(["test", "mutant", "semgrep", "trace"]);
  expect(p!.addressed).toEqual(["k"]);
});

test("[REQ-GATE-3] gültig: leere raws mit leerem ran und leerem addressed", () => {
  expect(parseGateRoundInput({ raws: [], ran: [], addressed: [] })).toBeDefined();
});

test("[REQ-GATE-3] zusätzliche Felder in der Eingabe (z. B. progress) machen sie nicht ungültig und tauchen im Ergebnis nicht auf", () => {
  const p = parseGateRoundInput({ ...okBase, progress: true, status: "completed" });
  expect(p).toBeDefined();
  expect(p).not.toHaveProperty("progress");
});
