import { test, expect } from "vitest";
import { parseCriticOutput, mergeCriticRuns, type CriticRun } from "../../src/core/critic.js";
import type { Finding } from "../../src/core/finding-key.js";

const F = (over: Record<string, unknown> = {}) => ({
  req: "REQ-X-1",
  klasse: "req-uncovered",
  datei: "src/a.ts",
  severity: "blocker",
  claim: "REQ-X-1 ist nicht abgedeckt",
  evidence: "src/a.ts:10",
  ...over,
});
const out = (findings: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ verdict: "rejected", findings, ...extra });

const keyOf = (f: Finding) => f.key;

// ---- REQ-CRITIC-2 / REQ-KEY-2: Parsing ---------------------------------------------------------
test("[REQ-KEY-2] gültiger Befund -> completed, Finding mit source critic, Schweregrad und Key", () => {
  const r = parseCriticOutput(out([F()]));
  expect(r.status).toBe("completed");
  expect(r.findings).toEqual([
    { key: "review:REQ-X-1:req-uncovered:src/a.ts", source: "critic", severity: "blocker" },
  ]);
});

test("[REQ-KEY-2] alle sechs Klassen und alle drei Schweregrade sind gültig; req '-' ist gültig", () => {
  const klassen = ["req-uncovered", "happy-path-only", "spec-deviation", "convention", "security", "other"];
  const sev = ["blocker", "major", "nit"];
  const findings = klassen.map((k, i) => F({ klasse: k, severity: sev[i % 3], req: i === 0 ? "-" : "REQ-X-1" }));
  const r = parseCriticOutput(out(findings));
  expect(r.status).toBe("completed");
  expect(r.findings.map((f) => f.severity)).toEqual(klassen.map((_, i) => sev[i % 3]));
  expect(r.findings[0].key).toBe("review:-:req-uncovered:src/a.ts");
});

test("[REQ-KEY-2] jedes fehlende Pflichtfeld => not-run", () => {
  for (const field of ["req", "klasse", "datei", "severity", "claim", "evidence"]) {
    const f: Record<string, unknown> = F();
    delete f[field];
    expect(parseCriticOutput(out([f])).status, `fehlt: ${field}`).toBe("not-run");
  }
});

test("[REQ-KEY-2] Enum verletzt (klasse / severity) => not-run", () => {
  expect(parseCriticOutput(out([F({ klasse: "stil" })])).status).toBe("not-run");
  expect(parseCriticOutput(out([F({ severity: "critical" })])).status).toBe("not-run");
  expect(parseCriticOutput(out([F({ severity: "BLOCKER" })])).status).toBe("not-run");
});

test("[REQ-KEY-2] falscher Feldtyp => not-run", () => {
  expect(parseCriticOutput(out([F({ req: 5 })])).status).toBe("not-run");
  expect(parseCriticOutput(out([F({ datei: null })])).status).toBe("not-run");
});

test("[REQ-KEY-2] ein einziger ungültiger Befund neben gültigen macht den ganzen Lauf not-run", () => {
  const bad = F();
  delete (bad as Record<string, unknown>).claim;
  expect(parseCriticOutput(out([F(), bad])).status).toBe("not-run");
});

test("[REQ-KEY-2] Zeile in evidence und Wortlaut von claim beeinflussen den Key nicht", () => {
  const a = parseCriticOutput(out([F({ evidence: "src/a.ts:10", claim: "Variante eins" })]));
  const b = parseCriticOutput(out([F({ evidence: "src/a.ts:13", claim: "ganz andere Beschreibung" })]));
  expect(a.findings[0].key).toBe(b.findings[0].key);
});

// Probe (b)
test("[REQ-CRITIC-2] (Probe b) leere Ausgabe => not-run (nicht completed mit findings [])", () => {
  for (const raw of ["", "   ", "\n\n"]) {
    const r = parseCriticOutput(raw);
    expect(r.status).toBe("not-run");
  }
});

test("[REQ-CRITIC-2] (Probe b) kein JSON => not-run", () => {
  expect(parseCriticOutput("Alles sieht gut aus, keine Befunde.").status).toBe("not-run");
  expect(parseCriticOutput("{ kaputt").status).toBe("not-run");
});

test("[REQ-CRITIC-2] (Probe b) JSON ohne findings-Feld / findings kein Array => not-run", () => {
  expect(parseCriticOutput(JSON.stringify({ verdict: "accepted" })).status).toBe("not-run");
  expect(parseCriticOutput(JSON.stringify({ verdict: "accepted", findings: "keine" })).status).toBe("not-run");
  expect(parseCriticOutput(JSON.stringify({ verdict: "accepted", findings: null })).status).toBe("not-run");
  expect(parseCriticOutput(JSON.stringify({ verdict: "accepted", findings: {} })).status).toBe("not-run");
  expect(parseCriticOutput("[]").status).toBe("not-run");
});

test("[REQ-CRITIC-2] (Probe b) findings: [] ist gültig: completed ohne Befunde", () => {
  expect(parseCriticOutput(out([]))).toEqual({ status: "completed", findings: [] });
});

test("[REQ-CRITIC-2] not-run trägt keine Befunde, auch wenn die Ausgabe teilweise gültige enthält", () => {
  const bad = F({ klasse: "stil" });
  const r = parseCriticOutput(out([F(), bad]));
  expect(r).toEqual({ status: "not-run", findings: [] });
});

test("[REQ-CRITIC-2] JSON in Text eingebettet und in ```json-Fence wird gefunden", () => {
  const body = out([F({ severity: "major" })]);
  const fenced = `Hier mein Review:\n\n\`\`\`json\n${body}\n\`\`\`\n\nEnde.`;
  const inline = `Ergebnis: ${body} -- das war's`;
  for (const raw of [fenced, inline]) {
    const r = parseCriticOutput(raw);
    expect(r.status).toBe("completed");
    expect(r.findings.map((f) => f.severity)).toEqual(["major"]);
  }
});

test("[REQ-CRITIC-2] das ERSTE JSON-Objekt mit Feld findings zählt; Objekte ohne findings davor werden übersprungen", () => {
  const raw = `Kontext {"nur":"eine Notiz"} dann\n${out([F()])}\nund danach ${out([])}`;
  const r = parseCriticOutput(raw);
  expect(r.status).toBe("completed");
  expect(r.findings).toHaveLength(1);
});

test("[REQ-CRITIC-2] ist das erste Objekt mit findings ungültig, gilt not-run, auch wenn ein späteres gültig ist", () => {
  const raw = `${JSON.stringify({ findings: "kaputt" })}\n${out([])}`;
  expect(parseCriticOutput(raw).status).toBe("not-run");
});

test("[REQ-CRITIC-2] geschweifte Klammern in Zeichenketten stören das Auffinden nicht", () => {
  const raw = `Text\n${out([F({ claim: "nutze { und } sowie \"Quotes\" hier" })])}\nEnde`;
  const r = parseCriticOutput(raw);
  expect(r.status).toBe("completed");
  expect(r.findings).toHaveLength(1);
});

// Probe (c) auf Parse-Ebene
test("[REQ-CRITIC-5] (Probe c) das Selbst-Label 'verdict' wird ignoriert: kein Verdikt-Feld im Ergebnis, Befunde bleiben", () => {
  const r = parseCriticOutput(out([F()], { verdict: "accepted" }));
  expect(r.status).toBe("completed");
  expect(r.findings).toHaveLength(1);
  expect(Object.keys(r).sort()).toEqual(["findings", "status"]);
});

test("[REQ-CRITIC-5] (Probe c) auch ein ungültiges Selbst-Label macht den Lauf nicht ungültig", () => {
  expect(parseCriticOutput(out([], { verdict: "vielleicht" })).status).toBe("completed");
  expect(parseCriticOutput(JSON.stringify({ findings: [] })).status).toBe("completed");
});

// ---- REQ-CRITIC-3: Zusammenführen -------------------------------------------------------------
const run = (findings: Finding[]): CriticRun => ({ status: "completed", findings });
const fnd = (n: string, severity: Finding["severity"] = "major"): Finding => ({
  key: `review:-:other:${n}.ts`,
  source: "critic",
  severity,
});

test("[REQ-CRITIC-3] Vereinigung der Befunde mehrerer Instanzen", () => {
  const m = mergeCriticRuns([run([fnd("a")]), run([fnd("b")])]);
  expect(m.status).toBe("completed");
  expect(m.findings.map(keyOf).sort()).toEqual([fnd("a").key, fnd("b").key]);
});

test("[REQ-CRITIC-3] Duplikate werden per Key zusammengelegt, mit dem höchsten Schweregrad", () => {
  const m = mergeCriticRuns([run([fnd("a", "nit")]), run([fnd("a", "blocker")]), run([fnd("a", "major")])]);
  expect(m.findings).toEqual([fnd("a", "blocker")]);
});

test("[REQ-CRITIC-3] (Probe b) eine not-run Instanz macht die ganze Runde not-run", () => {
  const m = mergeCriticRuns([run([fnd("a")]), { status: "not-run", findings: [] }]);
  expect(m.status).toBe("not-run");
  expect(m.findings).toEqual([]);
});

test("[REQ-CRITIC-3] (Probe b) leeres Array von Läufen => not-run (nie 'completed ohne Befunde')", () => {
  expect(mergeCriticRuns([]).status).toBe("not-run");
});

test("[REQ-CRITIC-3] alle completed ohne Befunde => completed ohne Befunde", () => {
  expect(mergeCriticRuns([run([]), run([])])).toEqual({ status: "completed", findings: [] });
});

test("[REQ-CRITIC-3] einzelne Instanz bleibt unverändert", () => {
  expect(mergeCriticRuns([run([fnd("a", "nit")])])).toEqual(run([fnd("a", "nit")]));
});

test("[REQ-CRITIC-3] (Probe i) derselbe Defekt, von zwei Critics verschieden lokalisiert (Zeile/Wortlaut), ergibt einen Befund", () => {
  const a = parseCriticOutput(out([F({ evidence: "src/a.ts:10", claim: "A" })]));
  const b = parseCriticOutput(out([F({ evidence: "src/a.ts:13", claim: "B" })]));
  expect(mergeCriticRuns([a, b]).findings).toHaveLength(1);
});
