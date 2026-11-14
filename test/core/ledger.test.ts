import { test, expect } from "vitest";
import {
  applyRound,
  deriveVerdict,
  renderLedgerTable,
  type Ledger,
  type LedgerEntry,
  type EntryState,
} from "../../src/core/ledger.js";
import type { Finding, Severity, Source } from "../../src/core/finding-key.js";
import { nextLoopDecision, type LoopState } from "../../src/core/loop.js";

// ---- Helfer: Befunde und Ledger von Hand bauen (unabhängig von finding-key.ts) -------------
const gate = (name: string): Finding => ({ key: `test:f.test.ts:${name}`, source: "gate", severity: "blocker" });
const crit = (name: string, severity: Severity = "major"): Finding => ({
  key: `review:-:other:${name}.ts`,
  source: "critic",
  severity,
});
const gk = (name: string) => gate(name).key;
const ck = (name: string) => crit(name).key;

const entry = (
  key: string,
  source: Source,
  severity: Severity,
  state: EntryState,
  reopenCount = 0,
): LedgerEntry => ({ key, source, severity, state, reopenCount });
const L = (...es: LedgerEntry[]): Ledger => Object.fromEntries(es.map((e) => [e.key, e]));
const round = (findings: Finding[], addressed: string[] = []) => ({ findings, addressed });

function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object") {
    Object.freeze(o);
    for (const v of Object.values(o as object)) deepFreeze(v);
  }
  return o;
}

// ---- REQ-LEDGER-1 ---------------------------------------------------------------------------
test("[REQ-LEDGER-1] neuer Befund wird als open mit seinem Schweregrad geführt, reopenCount 0", () => {
  const r = applyRound({}, round([gate("a"), crit("b", "nit")]));
  expect(r.ledger[gk("a")]).toEqual(entry(gk("a"), "gate", "blocker", "open"));
  expect(r.ledger[ck("b")]).toEqual(entry(ck("b"), "critic", "nit", "open"));
});

test("[REQ-LEDGER-1] je Key genau ein Eintrag, auch bei doppelt gemeldetem Key; Zustand bleibt im erlaubten Satz", () => {
  const r = applyRound({}, round([crit("a", "nit"), crit("a", "blocker")]));
  expect(Object.keys(r.ledger)).toEqual([ck("a")]);
  expect(["open", "fixed-claimed", "closed", "reopened"]).toContain(r.ledger[ck("a")].state);
  expect(r.ledger[ck("a")].severity).toBe("blocker");
});

test("[REQ-LEDGER-1] (Probe j) derselbe Critic-Key zweimal in einer Runde, blocker dann nit => severity blocker", () => {
  const r = applyRound({}, round([crit("a", "blocker"), crit("a", "nit")]));
  expect(Object.keys(r.ledger)).toEqual([ck("a")]);
  expect(r.ledger[ck("a")].severity).toBe("blocker");
});

test("[REQ-LEDGER-1] doppelt gemeldeter Key erhöht reopenCount nur einmal pro Runde", () => {
  const prev = L(entry(gk("a"), "gate", "blocker", "closed"));
  const r = applyRound(prev, round([gate("a"), gate("a")]));
  expect(r.ledger[gk("a")].state).toBe("reopened");
  expect(r.ledger[gk("a")].reopenCount).toBe(1);
});

test("[REQ-LEDGER-1] applyRound verändert den übergebenen Vorgänger-Ledger nicht", () => {
  const prev = deepFreeze(L(entry(gk("a"), "gate", "blocker", "open"), entry(ck("b"), "critic", "major", "open")));
  expect(() => applyRound(prev, round([crit("c")], [ck("b")]))).not.toThrow();
});

// Probe (j): Schweregrad = letzter statt höchster gesehener
test("[REQ-LEDGER-1] (Probe j) Schweregrad ist der höchste je gesehene, nicht der letzte", () => {
  const r1 = applyRound({}, round([crit("a", "blocker")]));
  const r2 = applyRound(r1.ledger, round([crit("a", "nit")]));
  expect(r2.ledger[ck("a")].severity).toBe("blocker");
  const r3 = applyRound(r2.ledger, round([crit("a", "major")]));
  expect(r3.ledger[ck("a")].severity).toBe("blocker");
});

test("[REQ-LEDGER-1] (Probe j) Schweregrad steigt nit -> major -> blocker", () => {
  let l: Ledger = {};
  for (const s of ["nit", "major", "blocker"] as const) l = applyRound(l, round([crit("a", s)])).ledger;
  expect(l[ck("a")].severity).toBe("blocker");
});

test("[REQ-LEDGER-1] (Probe j) herabgestufter Befund bleibt für das Verdikt blocker", () => {
  const r1 = applyRound({}, round([crit("a", "blocker")]));
  const r2 = applyRound(r1.ledger, round([crit("a", "nit")]));
  expect(deriveVerdict(r2.ledger)).toBe("rejected");
});

// ---- REQ-LEDGER-2 ---------------------------------------------------------------------------
test("[REQ-LEDGER-2] Gate-Befund, der in der Folgerunde fehlt, wird closed", () => {
  const prev = L(entry(gk("a"), "gate", "blocker", "open"));
  const r = applyRound(prev, round([]));
  expect(r.ledger[gk("a")].state).toBe("closed");
});

test("[REQ-LEDGER-2] auch ein reopened Gate-Befund wird closed, wenn er fehlt (in jeder Runde)", () => {
  const prev = L(entry(gk("a"), "gate", "blocker", "reopened", 1));
  const r = applyRound(prev, round([gate("other")]));
  expect(r.ledger[gk("a")].state).toBe("closed");
  expect(r.ledger[gk("a")].reopenCount).toBe(1);
});

test("[REQ-LEDGER-2] Gate-Befunde schließen auch in einer Runde, in der nichts offen war (nur Gate-closed)", () => {
  const prev = L(entry(gk("a"), "gate", "blocker", "closed"));
  const r = applyRound(prev, round([]));
  expect(r.ledger[gk("a")]).toEqual(entry(gk("a"), "gate", "blocker", "closed"));
});

test("[REQ-LEDGER-2] ein weiterhin gemeldeter Gate-Befund bleibt offen", () => {
  const prev = L(entry(gk("a"), "gate", "blocker", "open"));
  const r = applyRound(prev, round([gate("a")]));
  expect(r.ledger[gk("a")].state).toBe("open");
});

// ---- REQ-LEDGER-3 (Probe d) -------------------------------------------------------------------
test("[REQ-LEDGER-3] (Probe d) fehlender Critic-Befund bleibt unverändert, wird NICHT closed", () => {
  const states: EntryState[] = ["open", "reopened", "fixed-claimed", "closed"];
  for (const st of states) {
    const e = entry(ck("a"), "critic", "major", st, st === "reopened" ? 1 : 0);
    const r = applyRound(L(e), round([crit("other")]));
    expect(r.ledger[ck("a")]).toEqual(e);
  }
});

test("[REQ-LEDGER-3] (Probe d) Critic-Befund, den ein frischer Critic nicht zieht, hält das Verdikt auf rejected", () => {
  const r1 = applyRound({}, round([crit("a", "blocker")]));
  const r2 = applyRound(r1.ledger, round([])); // frischer Critic: keine Befunde, implement meldet nichts
  expect(r2.ledger[ck("a")].state).toBe("open");
  expect(deriveVerdict(r2.ledger)).toBe("rejected");
});

// ---- REQ-LEDGER-4 ---------------------------------------------------------------------------
test("[REQ-LEDGER-4] adressierter Critic-Befund (open) wird fixed-claimed", () => {
  const prev = L(entry(ck("a"), "critic", "major", "open"));
  const r = applyRound(prev, round([], [ck("a")]));
  expect(r.ledger[ck("a")].state).toBe("fixed-claimed");
});

test("[REQ-LEDGER-4] adressierter Critic-Befund (reopened) wird fixed-claimed; reopenCount bleibt", () => {
  const prev = L(entry(ck("a"), "critic", "major", "reopened", 1));
  const r = applyRound(prev, round([], [ck("a")]));
  expect(r.ledger[ck("a")].state).toBe("fixed-claimed");
  expect(r.ledger[ck("a")].reopenCount).toBe(1);
});

test("[REQ-LEDGER-4] addressed mit unbekanntem Key wird ignoriert (kein neuer Eintrag)", () => {
  const prev = L(entry(ck("a"), "critic", "major", "open"));
  const r = applyRound(prev, round([], ["review:-:other:unbekannt.ts"]));
  expect(Object.keys(r.ledger)).toEqual([ck("a")]);
  expect(r.ledger[ck("a")].state).toBe("open");
});

test("[REQ-LEDGER-4] addressed mit Gate-Key wird ignoriert (Gate entscheidet, nicht implement)", () => {
  const prev = L(entry(gk("a"), "gate", "blocker", "open"));
  const r = applyRound(prev, round([gate("a")], [gk("a")]));
  expect(r.ledger[gk("a")].state).toBe("open");
});

test("[REQ-LEDGER-4] addressed ändert keinen Critic-Eintrag, der schon closed/fixed-claimed ist", () => {
  for (const st of ["closed", "fixed-claimed"] as const) {
    const e = entry(ck("a"), "critic", "major", st);
    expect(applyRound(L(e), round([], [ck("a")])).ledger[ck("a")]).toEqual(e);
  }
});

// ---- REQ-LEDGER-5 ---------------------------------------------------------------------------
test("[REQ-LEDGER-5] closed Befund erneut gemeldet -> reopened, reopenCount +1", () => {
  const prev = L(entry(gk("a"), "gate", "blocker", "closed"));
  const r = applyRound(prev, round([gate("a")]));
  expect(r.ledger[gk("a")]).toEqual(entry(gk("a"), "gate", "blocker", "reopened", 1));
});

test("[REQ-LEDGER-5] fixed-claimed Befund erneut gemeldet -> reopened, reopenCount +1", () => {
  const prev = L(entry(ck("a"), "critic", "major", "fixed-claimed"));
  const r = applyRound(prev, round([crit("a")]));
  expect(r.ledger[ck("a")]).toEqual(entry(ck("a"), "critic", "major", "reopened", 1));
});

test("[REQ-LEDGER-5] reopenCount zählt weiter: zweites Wiederöffnen -> 2", () => {
  let l = L(entry(gk("a"), "gate", "blocker", "closed", 1));
  l = applyRound(l, round([gate("a")])).ledger;
  expect(l[gk("a")].reopenCount).toBe(2);
});

test("[REQ-LEDGER-5] bekannter Key in open/reopened, erneut gemeldet: Zustand und reopenCount unverändert", () => {
  const o = applyRound(L(entry(ck("a"), "critic", "major", "open")), round([crit("a")]));
  expect(o.ledger[ck("a")]).toEqual(entry(ck("a"), "critic", "major", "open", 0));
  const re = applyRound(L(entry(ck("a"), "critic", "major", "reopened", 1)), round([crit("a")]));
  expect(re.ledger[ck("a")]).toEqual(entry(ck("a"), "critic", "major", "reopened", 1));
});

test("[REQ-LEDGER-5] addressed wird vor dem Abgleich angewendet: adressiert UND erneut gemeldet -> reopened", () => {
  const prev = L(entry(ck("a"), "critic", "major", "open"));
  const r = applyRound(prev, round([crit("a")], [ck("a")]));
  expect(r.ledger[ck("a")].state).toBe("reopened");
  expect(r.ledger[ck("a")].reopenCount).toBe(1);
});

test("[REQ-LEDGER-5] reopened verhält sich wie open: kann wieder closed (Gate) werden", () => {
  const prev = L(entry(gk("a"), "gate", "blocker", "reopened", 1));
  expect(applyRound(prev, round([])).ledger[gk("a")].state).toBe("closed");
});

// ---- REQ-LEDGER-6 (Fortschritt) -----------------------------------------------------------
test("[REQ-LEDGER-6] Fortschritt: ein offener Gate-blocker wird in der Runde closed", () => {
  const prev = L(entry(gk("a"), "gate", "blocker", "open"));
  const r = applyRound(prev, round([]));
  expect(r.judged).toBe(true);
  expect(r.progress).toBe(true);
});

test("[REQ-LEDGER-6] Fortschritt: ein offener Critic-major wird adressiert -> fixed-claimed", () => {
  const prev = L(entry(ck("a"), "critic", "major", "open"));
  const r = applyRound(prev, round([], [ck("a")]));
  expect(r.progress).toBe(true);
});

test("[REQ-LEDGER-6] Fortschritt auch für einen zu Rundenbeginn reopened blocker", () => {
  const prev = L(entry(gk("a"), "gate", "blocker", "reopened", 1));
  expect(applyRound(prev, round([])).progress).toBe(true);
});

test("[REQ-LEDGER-6] kein Fortschritt: offener blocker bleibt offen (nichts adressiert, weiter gemeldet)", () => {
  const prev = L(entry(gk("a"), "gate", "blocker", "open"));
  const r = applyRound(prev, round([gate("a")]));
  expect(r.judged).toBe(true);
  expect(r.progress).toBe(false);
});

test("[REQ-LEDGER-6] kein Fortschritt: Critic-Befund fehlt nur im Output (Abwesenheit ist keine Evidenz)", () => {
  const prev = L(entry(ck("a"), "critic", "major", "open"));
  const r = applyRound(prev, round([]));
  expect(r.judged).toBe(true);
  expect(r.progress).toBe(false);
});

// Probe (e): „kein reopened"-Klausel gestrichen
test("[REQ-LEDGER-6] (Probe e) A adressiert, B taucht nach fixed-claimed wieder auf -> kein Fortschritt", () => {
  const r1 = applyRound({}, round([crit("A"), crit("B")]));
  expect(r1.judged).toBe(false);
  const r2 = applyRound(r1.ledger, round([crit("B")], [ck("A"), ck("B")]));
  expect(r2.ledger[ck("A")].state).toBe("fixed-claimed");
  expect(r2.ledger[ck("B")].state).toBe("reopened");
  expect(r2.judged).toBe(true);
  expect(r2.progress).toBe(false);
  expect(r2.oscillation).toBe(false);
  const decision = nextLoopDecision(
    { iteration: 1, gateChangedNotCode: false, freshContextUsed: false, lastRound: r2 },
    { maxIter: 5 },
  );
  expect(decision).toBe("FRESH_CONTEXT_RETRY");
});

test("[REQ-LEDGER-6] nur in DIESER Runde wiedergeöffnete Befunde blockieren den Fortschritt; ein schon reopened Key tut es nicht", () => {
  let l = applyRound({}, round([gate("A")])).ledger;
  l = applyRound(l, round([gate("B")])).ledger; // A closed, B open
  l = applyRound(l, round([])).ledger; // B closed
  l = applyRound(l, round([gate("B"), gate("C")])).ledger; // B reopened, C open (nichts offen zu Beginn)
  // Runde 5: C geschlossen (fehlt), B kehrt aus reopened nicht... B bleibt gemeldet (open-artig)
  const r5 = applyRound(l, round([gate("B")]));
  expect(r5.ledger[gk("C")].state).toBe("closed");
  expect(r5.ledger[gk("B")].state).toBe("reopened");
  // B war schon reopened (nicht neu in dieser Runde) und C wurde geschlossen: Fortschritt.
  expect(r5.progress).toBe(true);
});

// Probe (f): Nits zählen für Fortschritt
test("[REQ-LEDGER-6] (Probe f) kein Fortschritt, wenn nur ein Nit adressiert wird und der blocker offen bleibt", () => {
  const prev = L(entry(gk("A"), "gate", "blocker", "open"), entry(ck("n"), "critic", "nit", "open"));
  const r = applyRound(prev, round([gate("A")], [ck("n")]));
  expect(r.ledger[ck("n")].state).toBe("fixed-claimed");
  expect(r.judged).toBe(true);
  expect(r.progress).toBe(false);
});

test("[REQ-LEDGER-9] (Probe f) ein wiedergeöffnetes Nit blockiert den Fortschritt nicht", () => {
  const prev = L(entry(gk("A"), "gate", "blocker", "open"), entry(ck("n"), "critic", "nit", "fixed-claimed"));
  const r = applyRound(prev, round([crit("n", "nit")]));
  expect(r.ledger[ck("n")].state).toBe("reopened");
  expect(r.ledger[gk("A")].state).toBe("closed");
  expect(r.progress).toBe(true);
});

test("[REQ-LEDGER-6] ein in der Runde wiedergeöffneter major verhindert Fortschritt, auch wenn ein anderer blocker closed wurde", () => {
  const prev = L(
    entry(gk("A"), "gate", "blocker", "open"),
    entry(ck("m"), "critic", "major", "fixed-claimed"),
  );
  const r = applyRound(prev, round([crit("m", "major")]));
  expect(r.ledger[gk("A")].state).toBe("closed");
  expect(r.ledger[ck("m")].state).toBe("reopened");
  expect(r.progress).toBe(false);
});

// ---- REQ-LEDGER-7 (Oszillation) ----------------------------------------------------------
test("[REQ-LEDGER-7] zweites Wiederöffnen eines Gate-blockers in einer Runde -> oscillation", () => {
  let l = applyRound({}, round([gate("A")])).ledger; // R1 open
  l = applyRound(l, round([])).ledger; // R2 closed
  const r3 = applyRound(l, round([gate("A")])); // R3 reopened (1)
  expect(r3.ledger[gk("A")].reopenCount).toBe(1);
  expect(r3.oscillation).toBe(false);
  const r4 = applyRound(r3.ledger, round([])); // R4 closed
  const r5 = applyRound(r4.ledger, round([gate("A")])); // R5 reopened (2)
  expect(r5.ledger[gk("A")].reopenCount).toBe(2);
  expect(r5.oscillation).toBe(true);
});

test("[REQ-LEDGER-7] erstes Wiederöffnen (reopenCount 1) ist noch keine Oszillation", () => {
  const prev = L(entry(gk("A"), "gate", "blocker", "closed"));
  const r = applyRound(prev, round([gate("A")]));
  expect(r.ledger[gk("A")].reopenCount).toBe(1);
  expect(r.oscillation).toBe(false);
});

test("[REQ-LEDGER-7] Critic-major, das zum zweiten Mal wiederöffnet, löst oscillation aus", () => {
  const prev = L(entry(ck("m"), "critic", "major", "fixed-claimed", 1));
  const r = applyRound(prev, round([crit("m", "major")]));
  expect(r.ledger[ck("m")].reopenCount).toBe(2);
  expect(r.oscillation).toBe(true);
});

test("[REQ-LEDGER-7] oscillation gilt für DIESE Runde: ein schon reopened Key (Count 2), der nur weiter gemeldet wird, löst sie nicht erneut aus", () => {
  const prev = L(entry(gk("A"), "gate", "blocker", "reopened", 2));
  const r = applyRound(prev, round([gate("A")]));
  expect(r.oscillation).toBe(false);
});

test("[REQ-LEDGER-9] Nit mit reopenCount 2 löst keine oscillation aus", () => {
  const prev = L(entry(ck("n"), "critic", "nit", "fixed-claimed", 1));
  const r = applyRound(prev, round([crit("n", "nit")]));
  expect(r.ledger[ck("n")].reopenCount).toBe(2);
  expect(r.oscillation).toBe(false);
});

// ---- REQ-LEDGER-11 / Probe (l) --------------------------------------------------------------
test("[REQ-LEDGER-11] (Probe l) erste Runde auf leerem Ledger ist nicht bewertet (weder Fortschritt noch Stagnation)", () => {
  const r = applyRound({}, round([gate("A"), gate("B")]));
  expect(r.judged).toBe(false);
  expect(r.progress).toBe(false);
});

test("[REQ-LEDGER-11] Runde ohne offenen blocker/major zu Rundenbeginn ist nicht bewertet (nur closed/fixed-claimed/nit offen)", () => {
  const prev = L(
    entry(gk("A"), "gate", "blocker", "closed"),
    entry(ck("B"), "critic", "major", "fixed-claimed"),
    entry(ck("n"), "critic", "nit", "open"),
  );
  const r = applyRound(prev, round([gate("X")]));
  expect(r.judged).toBe(false);
});

test("[REQ-LEDGER-11] judged = true sobald zu Rundenbeginn ein blocker/major open ODER reopened ist", () => {
  expect(applyRound(L(entry(ck("a"), "critic", "major", "open")), round([])).judged).toBe(true);
  expect(applyRound(L(entry(ck("a"), "critic", "blocker", "reopened", 1)), round([])).judged).toBe(true);
});

test("[REQ-LEDGER-11] 'zu Rundenbeginn' heißt vor addressed: ein in dieser Runde adressierter Befund zählt als offen zu Beginn", () => {
  const prev = L(entry(ck("a"), "critic", "major", "open"));
  expect(applyRound(prev, round([], [ck("a")])).judged).toBe(true);
});

test("[REQ-LEDGER-11] Ende-zu-Ende: erste bewertete Runde verbrennt den Fresh-Retry nicht", () => {
  const r = applyRound({}, round([gate("A")]));
  const d = nextLoopDecision(
    { iteration: 0, gateChangedNotCode: false, freshContextUsed: false, lastRound: r },
    { maxIter: 5 },
  );
  expect(d).toBe("RE_GEN");
});

// ---- Tabellenfälle der Spec Ende-zu-Ende (Abnahme 1) ----------------------------------------
const mkState = (lastRound: LoopState["lastRound"]): LoopState => ({
  iteration: 1,
  gateChangedNotCode: false,
  freshContextUsed: false,
  lastRound,
});

test("[REQ-LEDGER-6] (Probe a) Tabellenfall 'falsche Stagnation': Gate A rot -> A behoben, B und C laufen an und sind rot => RE_GEN", () => {
  const r1 = applyRound({}, round([gate("A")]));
  const r2 = applyRound(r1.ledger, round([gate("B"), gate("C")]));
  expect(r2.ledger[gk("A")].state).toBe("closed");
  expect(r2.judged).toBe(true);
  expect(r2.progress).toBe(true); // 1 -> 2 Befunde, trotzdem Fortschritt
  expect(nextLoopDecision(mkState(r2), { maxIter: 5 })).toBe("RE_GEN");
});

test("[REQ-LEDGER-6] (Probe a) Tabellenfall 'falscher Fortschritt': Critic A,B -> implement behebt nichts, frischer Critic zieht nur A => FRESH_CONTEXT_RETRY", () => {
  const r1 = applyRound({}, round([crit("A"), crit("B")]));
  const r2 = applyRound(r1.ledger, round([crit("A")], [])); // frischer Critic sieht nur A; nichts adressiert
  expect(r2.ledger[ck("B")].state).toBe("open"); // Abwesenheit ist keine Evidenz
  expect(r2.judged).toBe(true);
  expect(r2.progress).toBe(false); // 2 -> 1 Befunde, trotzdem Stagnation
  expect(nextLoopDecision(mkState(r2), { maxIter: 5 })).toBe("FRESH_CONTEXT_RETRY");
});

test("[REQ-LEDGER-6] (Probe a) Anzahl gleich, aber echter Fortschritt: A closed, B neu => RE_GEN (gleiche Zählerwerte 1 -> 1)", () => {
  const r1 = applyRound({}, round([gate("A")]));
  const r2 = applyRound(r1.ledger, round([gate("B")]));
  expect(r2.progress).toBe(true);
  expect(nextLoopDecision(mkState(r2), { maxIter: 5 })).toBe("RE_GEN");
});

// ---- REQ-CRITIC-5: Verdikt aus dem Ledger ableiten (Probe c) ------------------------------------
test("[REQ-CRITIC-5] leerer Ledger -> accepted", () => {
  expect(deriveVerdict({})).toBe("accepted");
});

test("[REQ-CRITIC-5] offener blocker -> rejected; offener major -> rejected; reopened major -> rejected", () => {
  expect(deriveVerdict(L(entry(ck("a"), "critic", "blocker", "open")))).toBe("rejected");
  expect(deriveVerdict(L(entry(ck("a"), "critic", "major", "open")))).toBe("rejected");
  expect(deriveVerdict(L(entry(ck("a"), "critic", "major", "reopened", 1)))).toBe("rejected");
});

test("[REQ-CRITIC-5] accepted genau dann, wenn kein blocker/major open|reopened: nits, closed und fixed-claimed zählen nicht", () => {
  const l = L(
    entry(ck("n"), "critic", "nit", "open"),
    entry(ck("n2"), "critic", "nit", "reopened", 2),
    entry(ck("a"), "critic", "blocker", "closed"),
    entry(ck("b"), "critic", "major", "fixed-claimed"),
  );
  expect(deriveVerdict(l)).toBe("accepted");
});

test("[REQ-CRITIC-5] (Probe c) ein einziger offener blocker neben vielen erledigten Einträgen genügt für rejected", () => {
  const l = L(
    entry(ck("a"), "critic", "major", "closed"),
    entry(ck("b"), "critic", "blocker", "open"),
    entry(ck("c"), "critic", "nit", "closed"),
  );
  expect(deriveVerdict(l)).toBe("rejected");
});

test("[REQ-CRITIC-5] Verdikt aus applyRound: Critic-Run mit nur Nits -> accepted", () => {
  const r = applyRound({}, round([crit("n", "nit")]));
  expect(deriveVerdict(r.ledger)).toBe("accepted");
});

// ---- REQ-LEDGER-10: Tabelle ---------------------------------------------------------------------
test("[REQ-LEDGER-10] renderLedgerTable: Markdown-Tabelle mit allen Keys", () => {
  const l = L(
    entry(gk("a"), "gate", "blocker", "open"),
    entry(ck("b"), "critic", "major", "closed"),
  );
  const t = renderLedgerTable(l);
  expect(typeof t).toBe("string");
  expect(t).toContain(gk("a"));
  expect(t).toContain(ck("b"));
  expect(t.split("\n").filter((x) => x.includes("|")).length).toBeGreaterThanOrEqual(3); // Kopf, Trenner/Zeilen
});

test("[REQ-LEDGER-10] offene blocker/major stehen zuoberst, vor allen übrigen Zeilen", () => {
  const l = L(
    entry("K-closed", "critic", "blocker", "closed"),
    entry("K-claimed", "critic", "major", "fixed-claimed"),
    entry("K-nit-open", "critic", "nit", "open"),
    entry("K-open-major", "critic", "major", "open"),
    entry("K-reopened-blocker", "gate", "blocker", "reopened", 1),
  );
  const t = renderLedgerTable(l);
  const idx = (k: string) => t.indexOf(k);
  const top = Math.max(idx("K-open-major"), idx("K-reopened-blocker"));
  for (const other of ["K-closed", "K-claimed", "K-nit-open"]) {
    expect(idx(other)).toBeGreaterThan(top);
  }
});

test("[REQ-LEDGER-10] fixed-claimed erscheint ausdrücklich als 'behoben (unverifiziert)'", () => {
  const l = L(entry("K-claimed", "critic", "major", "fixed-claimed"));
  const line = renderLedgerTable(l).split("\n").find((x) => x.includes("K-claimed"));
  expect(line).toBeDefined();
  expect(line).toContain("behoben (unverifiziert)");
});

test("[REQ-LEDGER-10] 'behoben (unverifiziert)' steht nur bei fixed-claimed, nicht bei closed/open", () => {
  const l = L(
    entry("K-closed", "gate", "blocker", "closed"),
    entry("K-open", "critic", "major", "open"),
  );
  expect(renderLedgerTable(l)).not.toContain("unverifiziert");
});

test("[REQ-LEDGER-10] leerer Ledger lässt sich rendern", () => {
  expect(typeof renderLedgerTable({})).toBe("string");
});
