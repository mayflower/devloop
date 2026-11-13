// @ts-nocheck
// Vorher-Nachweis (kein vitest-Test, Name ohne ".test."): die beiden Tabellenfälle der Spec als
// errorCounts (= Anzahl blocker/major je Runde) durch das HEUTIGE nextLoopDecision (alter Stand,
// errorCounts + requireStrictlyDecreasing). Nach der Implementierung ist dieses Skript hinfällig.
// Aufruf: npx tsx test/evidence/before-counter.ts
import { nextLoopDecision } from "../../src/core/loop.js";

const params = { maxIter: 5, requireStrictlyDecreasing: true }; // Parameter aus dem alten loop.test.ts
const decide = (errorCounts: number[]) =>
  nextLoopDecision({ iteration: 1, errorCounts, gateChangedNotCode: false, freshContextUsed: false }, params);

const cases = [
  { name: "Falsche Stagnation (Gate: A rot -> A behoben, B und C laufen an)", counts: [1, 2], wahrheit: "Fortschritt => RE_GEN" },
  { name: "Falscher Fortschritt (Critic: A,B -> implement behebt nichts, frischer Critic zieht nur A)", counts: [2, 1], wahrheit: "Stagnation => FRESH_CONTEXT_RETRY" },
];
for (const c of cases) {
  console.log(`${c.name}\n  errorCounts=${JSON.stringify(c.counts)}  heutige Entscheidung=${decide(c.counts)}  (Wahrheit: ${c.wahrheit})`);
}
