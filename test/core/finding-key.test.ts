import { test, expect } from "vitest";
import { gateFindingKey, criticFindingKey, gateFinding } from "../../src/core/finding-key.js";

// --- REQ-KEY-1: Key-Ableitung nach Spec-Tabelle, ohne Zeilennummer, ohne Freitext ----------
test("[REQ-KEY-1] Gate-Key: Test rot = test:<datei>:<testname>", () => {
  expect(gateFindingKey({ kind: "test", file: "test/a.test.ts", testName: "does x" })).toBe(
    "test:test/a.test.ts:does x",
  );
});

test("[REQ-KEY-1] Gate-Key: Mutante überlebt = mutant:<datei>:<funktion>:<mutator>", () => {
  expect(
    gateFindingKey({ kind: "mutant", file: "src/a.ts", fn: "foo", mutator: "ConditionalExpression" }),
  ).toBe("mutant:src/a.ts:foo:ConditionalExpression");
});

test("[REQ-KEY-1] Gate-Key: Semgrep = semgrep:<regel>:<datei>:<funktion>", () => {
  expect(gateFindingKey({ kind: "semgrep", rule: "no-eval", file: "src/a.ts", fn: "foo" })).toBe(
    "semgrep:no-eval:src/a.ts:foo",
  );
});

test("[REQ-KEY-1] Gate-Key: Trace-Lücke = trace:<REQ-ID>", () => {
  expect(gateFindingKey({ kind: "trace", req: "REQ-X-1" })).toBe("trace:REQ-X-1");
});

test("[REQ-KEY-1] Critic-Key = review:<REQ-ID oder '-'>:<klasse>:<datei>", () => {
  expect(criticFindingKey({ req: "REQ-X-1", klasse: "req-uncovered", datei: "src/a.ts" })).toBe(
    "review:REQ-X-1:req-uncovered:src/a.ts",
  );
  expect(criticFindingKey({ req: "-", klasse: "convention", datei: "src/b.ts" })).toBe(
    "review:-:convention:src/b.ts",
  );
});

test("[REQ-KEY-1] verschiedene Bestandteile ergeben verschiedene Keys", () => {
  const base = { kind: "test", file: "a", testName: "t" } as const;
  expect(gateFindingKey(base)).not.toBe(gateFindingKey({ ...base, testName: "u" }));
  expect(gateFindingKey(base)).not.toBe(gateFindingKey({ ...base, file: "b" }));
  const c = { req: "REQ-X-1", klasse: "other", datei: "a.ts" };
  expect(criticFindingKey(c)).not.toBe(criticFindingKey({ ...c, klasse: "security" }));
  expect(criticFindingKey(c)).not.toBe(criticFindingKey({ ...c, datei: "b.ts" }));
  expect(criticFindingKey(c)).not.toBe(criticFindingKey({ ...c, req: "REQ-X-2" }));
});

// Probe (i): Key enthält Zeilennummer. Konstruktion: derselbe Befund, 3 Zeilen verschoben.
test("[REQ-KEY-1] (Probe i) Gate-Key ist zeilenunabhängig: gleicher Befund, 3 Zeilen verschoben => gleicher Key", () => {
  expect(gateFindingKey({ kind: "test", file: "a", testName: "t", line: 10 })).toBe(
    gateFindingKey({ kind: "test", file: "a", testName: "t", line: 13 }),
  );
  expect(gateFindingKey({ kind: "test", file: "a", testName: "t", line: 10 })).toBe(
    gateFindingKey({ kind: "test", file: "a", testName: "t" }),
  );
  expect(gateFindingKey({ kind: "mutant", file: "a", fn: "f", mutator: "M", line: 40 })).toBe(
    gateFindingKey({ kind: "mutant", file: "a", fn: "f", mutator: "M", line: 43 }),
  );
  expect(gateFindingKey({ kind: "semgrep", rule: "r", file: "a", fn: "f", line: 7 })).toBe(
    gateFindingKey({ kind: "semgrep", rule: "r", file: "a", fn: "f", line: 10 }),
  );
});

test("[REQ-KEY-1] (Probe i) Critic-Key ist zeilen- und textunabhängig", () => {
  const a = { req: "REQ-X-1", klasse: "spec-deviation", datei: "src/a.ts", line: 10, claim: "Fehler hier" };
  const b = { ...a, line: 13, claim: "ganz anders formuliert" };
  expect(criticFindingKey(a)).toBe(criticFindingKey(b));
  expect(criticFindingKey(a)).toBe("review:REQ-X-1:spec-deviation:src/a.ts");
  expect(criticFindingKey(a)).not.toMatch(/\d{2}|Fehler/);
});

test("[REQ-KEY-1] gateFinding: source gate, Schweregrad immer blocker, Key aus gateFindingKey", () => {
  const raws = [
    { kind: "test", file: "a", testName: "t" },
    { kind: "mutant", file: "a", fn: "f", mutator: "M" },
    { kind: "semgrep", rule: "r", file: "a", fn: "f" },
    { kind: "trace", req: "REQ-X-1" },
  ] as const;
  for (const raw of raws) {
    expect(gateFinding(raw)).toEqual({ key: gateFindingKey(raw), source: "gate", severity: "blocker" });
  }
});
