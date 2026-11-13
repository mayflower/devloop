import { test, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
// Wie die bestehenden CLI-Tests: gegen das gebaute dist (pretest baut).
const script = resolve(root, "dist/cli/critic-verdict.js");

function run(input: unknown) {
  const r = spawnSync("node", [script], { encoding: "utf8", input: JSON.stringify(input), cwd: root });
  let out: any;
  try {
    out = JSON.parse(r.stdout);
  } catch {
    out = undefined;
  }
  return { status: r.status, out, stderr: r.stderr };
}

const F = (over: Record<string, unknown> = {}) => ({
  req: "REQ-X-1",
  klasse: "req-uncovered",
  datei: "src/a.ts",
  severity: "blocker",
  claim: "nicht abgedeckt",
  evidence: "src/a.ts:10",
  ...over,
});
const raw = (findings: unknown[], label = "rejected") => JSON.stringify({ verdict: label, findings });
const KEY = "review:REQ-X-1:req-uncovered:src/a.ts";
const open = (key: string, severity = "major", state = "open") => ({
  [key]: { key, source: "critic", severity, state, reopenCount: 0 },
});

test("[REQ-CRITIC-1] gültige rohe Ausgabe mit offenem blocker -> completed, rejected, Ledger-Runde", () => {
  const { status, out } = run({ rawOutputs: [raw([F()])], ledger: {}, addressed: [] });
  expect(status).toBe(0);
  expect(out.status).toBe("completed");
  expect(out.verdict).toBe("rejected");
  expect(out.round.ledger[KEY]).toMatchObject({ source: "critic", severity: "blocker", state: "open", reopenCount: 0 });
  expect(out.round.judged).toBe(false); // erste Runde: nichts offen zu Beginn (REQ-LEDGER-11)
});

test("[REQ-CRITIC-1] findings: [] bei leerem Ledger -> completed, accepted", () => {
  const { out } = run({ rawOutputs: [raw([], "rejected")], ledger: {}, addressed: [] });
  expect(out.status).toBe("completed");
  expect(out.verdict).toBe("accepted");
});

// Probe (b)
test("[REQ-CRITIC-2] (Probe b) leere rawOutputs + Eingabefeld status 'completed' -> trotzdem not-run, ohne verdict/round", () => {
  const { out } = run({ rawOutputs: [], status: "completed", verdict: "accepted", ledger: {}, addressed: [] });
  expect(out.status).toBe("not-run");
  expect(out).not.toHaveProperty("verdict");
  expect(out).not.toHaveProperty("round");
});

test("[REQ-CRITIC-2] (Probe b) leerer / nicht-JSON / schemaverletzender Output -> not-run, ohne verdict/round", () => {
  for (const bad of ["", "irgendwas ohne JSON", raw([F({ klasse: "stil" })]), JSON.stringify({ verdict: "accepted" })]) {
    const { out } = run({ rawOutputs: [bad], ledger: {}, addressed: [] });
    expect(out.status, bad).toBe("not-run");
    expect(out).not.toHaveProperty("verdict");
    expect(out).not.toHaveProperty("round");
  }
});

test("[REQ-CRITIC-3] eine gültige und eine ungültige Instanz -> ganze Runde not-run", () => {
  const { out } = run({ rawOutputs: [raw([F()]), "kaputt"], ledger: {}, addressed: [] });
  expect(out.status).toBe("not-run");
});

test("[REQ-CRITIC-3] zwei gültige Instanzen: Befunde vereinigt, Duplikate per Key (höchster Schweregrad)", () => {
  const a = raw([F({ severity: "nit", evidence: "src/a.ts:3" }), F({ klasse: "security", datei: "src/b.ts" })]);
  const b = raw([F({ severity: "blocker", evidence: "src/a.ts:9" })]);
  const { out } = run({ rawOutputs: [a, b], ledger: {}, addressed: [] });
  expect(out.status).toBe("completed");
  expect(Object.keys(out.round.ledger).sort()).toEqual([KEY, "review:REQ-X-1:security:src/b.ts"].sort());
  expect(out.round.ledger[KEY].severity).toBe("blocker");
});

// Probe (c)
test("[REQ-CRITIC-5] (Probe c) Selbst-Label 'accepted' mit offenem blocker -> abgeleitetes Verdikt rejected", () => {
  const { out } = run({ rawOutputs: [raw([F()], "accepted")], ledger: {}, addressed: [] });
  expect(out.verdict).toBe("rejected");
});

test("[REQ-CRITIC-1] Eingabefeld 'verdict' wird nicht beachtet", () => {
  const { out } = run({ rawOutputs: [raw([F()], "accepted")], verdict: "accepted", ledger: {}, addressed: [] });
  expect(out.verdict).toBe("rejected");
});

test("[REQ-CRITIC-1] Eingabefeld 'status: not-run' wird ebenfalls nicht beachtet (Status entsteht nur aus der rohen Ausgabe)", () => {
  const { out } = run({ rawOutputs: [raw([])], status: "not-run", ledger: {}, addressed: [] });
  expect(out.status).toBe("completed");
});

// Probe (d) auf CLI-Ebene
test("[REQ-LEDGER-3] (Probe d) frischer Critic zieht den offenen Befund nicht und nichts adressiert -> Ledger offen, rejected", () => {
  const { out } = run({ rawOutputs: [raw([])], ledger: open(KEY, "blocker"), addressed: [] });
  expect(out.status).toBe("completed");
  expect(out.round.ledger[KEY].state).toBe("open");
  expect(out.verdict).toBe("rejected");
  expect(out.round.judged).toBe(true);
  expect(out.round.progress).toBe(false);
});

test("[REQ-LEDGER-4] adressierter Befund + Critic zieht ihn nicht -> fixed-claimed, Fortschritt, accepted", () => {
  const { out } = run({ rawOutputs: [raw([])], ledger: open(KEY, "blocker"), addressed: [KEY] });
  expect(out.round.ledger[KEY].state).toBe("fixed-claimed");
  expect(out.round.progress).toBe(true);
  expect(out.verdict).toBe("accepted");
});

test("[REQ-LEDGER-5] fixed-claimed Befund, den der Critic wieder zieht -> reopened, rejected", () => {
  const { out } = run({ rawOutputs: [raw([F()])], ledger: open(KEY, "blocker", "fixed-claimed"), addressed: [] });
  expect(out.round.ledger[KEY]).toMatchObject({ state: "reopened", reopenCount: 1 });
  expect(out.verdict).toBe("rejected");
  expect(out.round.progress).toBe(false);
});

test("[REQ-LEDGER-7] zweites Wiederöffnen im CLI-Ergebnis: oscillation true", () => {
  const ledger = { [KEY]: { key: KEY, source: "critic", severity: "blocker", state: "fixed-claimed", reopenCount: 1 } };
  const { out } = run({ rawOutputs: [raw([F()])], ledger, addressed: [] });
  expect(out.round.oscillation).toBe(true);
});

test("[REQ-CRITIC-5] nur Nits -> accepted", () => {
  const { out } = run({ rawOutputs: [raw([F({ severity: "nit", klasse: "convention" })])], ledger: {}, addressed: [] });
  expect(out.verdict).toBe("accepted");
});

test("[REQ-KEY-1] (Probe i) derselbe Befund um 3 Zeilen verschoben trifft denselben Ledger-Eintrag (kein neuer Key)", () => {
  const first = run({ rawOutputs: [raw([F({ evidence: "src/a.ts:10" })])], ledger: {}, addressed: [] });
  const second = run({
    rawOutputs: [raw([F({ evidence: "src/a.ts:13", claim: "anders formuliert" })])],
    ledger: first.out.round.ledger,
    addressed: [],
  });
  expect(Object.keys(second.out.round.ledger)).toEqual([KEY]);
});
