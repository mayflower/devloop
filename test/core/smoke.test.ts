import { test, expect } from "vitest";
import { parseSmokeReport } from "../../src/core/smoke.js";

const C = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  req: "REQ-X-1",
  mode: "api",
  action: "PATCH als user",
  expected: "pending contribution, Zeile unverändert",
  observed: "HTTP 200, contributions 37 -> 38 (pending), notes unverändert",
  effect: "select status from contributions ... -> pending",
  pass: true,
  ...over,
});
const K = { changed: "PATCH /versions/:id", caller: "wuerfelgeist-mcp update_version", evidence: "VersionsClient.ts:42" };
const R = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ consumers: [K], setup: { ok: true, steps: ["up"] }, cases: [C()], notApplicable: null, abnahme: "## Abnahme\n1. ...", ...over });

test("[REQ-SMOKE-2] gültiger Bericht, alle Fälle grün -> passed", () => {
  expect(parseSmokeReport(R()).status).toBe("passed");
});

test("[REQ-SMOKE-2] Text und Codezaun um das JSON sind erlaubt", () => {
  expect(parseSmokeReport("Bericht:\n```json\n" + R() + "\n```\n").status).toBe("passed");
});

test("[REQ-SMOKE-2] ein roter Fall -> failed mit Fall-ID", () => {
  const r = parseSmokeReport(R({ cases: [C(), C({ id: "c2", pass: false })] }));
  expect(r.status).toBe("failed");
  expect(r.failedCases).toEqual(["c2"]);
});

test("[REQ-SMOKE-3] ein Selbst-Label status: passed zählt nicht", () => {
  expect(parseSmokeReport(R({ status: "passed", cases: [C({ pass: false })] })).status).toBe("failed");
  expect(parseSmokeReport(JSON.stringify({ status: "passed" })).status).toBe("not-run");
});

test("[REQ-SMOKE-3] Fall ohne beobachtete Wirkung (effect) ist ungültig -> not-run", () => {
  expect(parseSmokeReport(R({ cases: [C({ effect: "" })] })).status).toBe("not-run");
  expect(parseSmokeReport(R({ cases: [C({ effect: undefined })] })).status).toBe("not-run");
  expect(parseSmokeReport(R({ cases: [C({ observed: "  " })] })).status).toBe("not-run");
});

test("[REQ-SMOKE-3] pass muss boolean sein, mode aus der Liste", () => {
  expect(parseSmokeReport(R({ cases: [C({ pass: "true" })] })).status).toBe("not-run");
  expect(parseSmokeReport(R({ cases: [C({ mode: "gefühlt" })] })).status).toBe("not-run");
});

test("[REQ-SMOKE-3] Stack nicht aufgebaut (setup.ok false/fehlt) -> not-run, nie failed oder passed", () => {
  expect(parseSmokeReport(R({ setup: { ok: false, steps: [] } })).status).toBe("not-run");
  expect(parseSmokeReport(R({ setup: undefined })).status).toBe("not-run");
});

test("[REQ-SMOKE-3] Fälle ohne Konsumenten-Analyse -> not-run", () => {
  expect(parseSmokeReport(R({ consumers: [] })).status).toBe("not-run");
  expect(parseSmokeReport(R({ consumers: [{ changed: "x", caller: "y", evidence: "" }] })).status).toBe("not-run");
});

test("[REQ-SMOKE-3] Fälle ohne Abnahme-Anleitung für den Menschen -> not-run", () => {
  expect(parseSmokeReport(R({ abnahme: "" })).status).toBe("not-run");
});

test("[REQ-SMOKE-3] doppelte Fall-IDs -> not-run", () => {
  expect(parseSmokeReport(R({ cases: [C(), C()] })).status).toBe("not-run");
});

test("[REQ-SMOKE-2] not-applicable nur mit Begründung UND Konsumenten-Analyse", () => {
  expect(parseSmokeReport(R({ cases: [], notApplicable: "reine Doku-Änderung, kein Laufzeitpfad" })).status).toBe("not-applicable");
  expect(parseSmokeReport(R({ cases: [], notApplicable: null })).status).toBe("not-run");
  expect(parseSmokeReport(R({ cases: [], consumers: [], notApplicable: "egal" })).status).toBe("not-run");
});

test("[REQ-SMOKE-3] widersprüchlich: Fälle UND notApplicable -> not-run", () => {
  expect(parseSmokeReport(R({ notApplicable: "doch nicht" })).status).toBe("not-run");
});

test("[REQ-SMOKE-3] Müll, leerer Text, kein cases-Feld -> not-run", () => {
  for (const raw of ["", "kein json", "{}", JSON.stringify({ consumers: [K], setup: { ok: true } })])
    expect(parseSmokeReport(raw).status).toBe("not-run");
});
