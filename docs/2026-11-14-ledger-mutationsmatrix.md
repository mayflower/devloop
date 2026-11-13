# Befund-Ledger: Mutationsmatrix und Vorher-Nachweis

Zu `docs/2026-11-13-befund-ledger-critic-verdikt-design.md` (Abnahme 2). Je Pflicht-Probe (a)-(l):
die Mutation und die Tests, die dabei rot werden müssen. Testtitel tragen das Tag `(Probe x)`.
Die Wirkung wurde gegen eine **Wegwerf-Referenzimplementierung** (nicht Teil dieses Branches)
nachgemessen: Baseline alle neuen Tests grün, jede Mutation unten färbt mindestens einen der
genannten Tests rot (Anzahl roter Tests in Klammern).

| Probe | Mutation | Datei :: Testname (muss rot werden) |
|---|---|---|
| (a) Fortschritt per Anzahl | `progress` aus Befundzahl statt Ledger | `test/core/ledger.test.ts` :: "[REQ-LEDGER-6] (Probe a) Tabellenfall 'falsche Stagnation' ..." (1 -> 2 Befunde muss RE_GEN sein); "... Tabellenfall 'falscher Fortschritt' ..." (2 -> 1 muss FRESH_CONTEXT_RETRY sein); "... Anzahl gleich, aber echter Fortschritt ..."; `test/core/loop.test.ts` :: "[REQ-LEDGER-8] (Probe a) ein veraltetes errorCounts-Feld ..." (beide Richtungen) (gemessen 7) |
| (b) not-run als completed | `status` bei leer/ungültig/not-run `completed` mit `findings: []` | `test/core/critic.test.ts` :: "[REQ-CRITIC-2] (Probe b) leere Ausgabe ...", "... kein JSON ...", "... JSON ohne findings-Feld ..."; "[REQ-CRITIC-3] (Probe b) eine not-run Instanz ...", "... leeres Array von Läufen ..."; `test/cli/critic-verdict.test.ts` :: "[REQ-CRITIC-2] (Probe b) leere rawOutputs + Eingabefeld status 'completed' ..."; `test/core/driver.test.ts` :: "[REQ-CRITIC-4] (Probe b) not-run führt nie zu MARK_READY oder DONE" (gemessen 5 bzw. 5) |
| (c) Selbst-Label statt abgeleitetem Verdikt | Verdikt aus `verdict` der Critic-Ausgabe | `test/cli/critic-verdict.test.ts` :: "[REQ-CRITIC-5] (Probe c) Selbst-Label 'accepted' mit offenem blocker -> ... rejected" (Label accepted + offener blocker); "[REQ-CRITIC-1] Eingabefeld 'verdict' wird nicht beachtet"; `test/core/ledger.test.ts` :: "[REQ-CRITIC-5] (Probe c) ein einziger offener blocker ..."; `test/core/critic.test.ts` :: "[REQ-CRITIC-5] (Probe c) das Selbst-Label ... wird ignoriert" (gemessen 5) |
| (d) Abwesenheit eines Critic-Befunds = closed | Critic-Einträge, die fehlen, werden closed | `test/core/ledger.test.ts` :: "[REQ-LEDGER-3] (Probe d) fehlender Critic-Befund bleibt unverändert ...", "... frischer Critic zieht ... Verdikt auf rejected"; "[REQ-LEDGER-6] (Probe a) Tabellenfall 'falscher Fortschritt'"; `test/cli/critic-verdict.test.ts` :: "[REQ-LEDGER-3] (Probe d) frischer Critic zieht den offenen Befund nicht ..." (gemessen 6) |
| (e) "kein reopened"-Klausel gestrichen | `progress` ignoriert in der Runde wiedergeöffnete blocker/major | `test/core/ledger.test.ts` :: "[REQ-LEDGER-6] (Probe e) A adressiert, B taucht nach fixed-claimed wieder auf -> kein Fortschritt" (R1 A,B major; R2 addressed [A,B], Critic zieht B; A fixed-claimed, B reopened; Folge: FRESH_CONTEXT_RETRY); "... ein in der Runde wiedergeöffneter major verhindert Fortschritt ..." (gemessen 2) |
| (f) Nits zählen für Fortschritt | Nit-Fix gilt als Fortschritt / Nit-Reopen blockiert Fortschritt | `test/core/ledger.test.ts` :: "[REQ-LEDGER-6] (Probe f) kein Fortschritt, wenn nur ein Nit adressiert wird und der blocker offen bleibt"; "[REQ-LEDGER-9] (Probe f) ein wiedergeöffnetes Nit blockiert den Fortschritt nicht"; `test/core/ledger.test.ts` :: "[REQ-LEDGER-9] Nit mit reopenCount 2 löst keine oscillation aus" (gemessen je 1) |
| (g) REQ-LEDGER-7 nach der Stagnationsprüfung | Oszillation hinter Stagnation geprüft | `test/core/loop.test.ts` :: "[REQ-LEDGER-7] (Probe g) Oszillation eskaliert VOR der Stagnationsprüfung (kein Fresh-Retry)" (lastRound judged, !progress, oscillation, freshContextUsed false -> ESCALATE_OSCILLATION statt FRESH_CONTEXT_RETRY) (gemessen 1) |
| (h) Critic-Neustart zweimal | `retried: true` führt erneut zu `SPAWN_STATION critic` | `test/core/driver.test.ts` :: "[REQ-CRITIC-4] (Probe h) critiqued + not-run NACH dem Neustart -> ESCALATE critic-not-run ..." (gemessen 1) |
| (i) Key enthält Zeilennummer | Zeile/`evidence`/`claim` fließt in den Key | `test/core/finding-key.test.ts` :: "[REQ-KEY-1] (Probe i) Gate-Key ist zeilenunabhängig ... 3 Zeilen verschoben => gleicher Key", "... Critic-Key ist zeilen- und textunabhängig"; `test/core/critic.test.ts` :: "[REQ-CRITIC-3] (Probe i) derselbe Defekt ... verschieden lokalisiert ... ein Befund", "[REQ-KEY-2] Zeile in evidence und Wortlaut von claim beeinflussen den Key nicht"; `test/cli/critic-verdict.test.ts` :: "[REQ-KEY-1] (Probe i) derselbe Befund um 3 Zeilen verschoben trifft denselben Ledger-Eintrag" (gemessen: Gate-Variante 2, Critic-Variante 11) |
| (j) Schweregrad = letzter statt höchster | `severity` wird überschrieben | `test/core/ledger.test.ts` :: "[REQ-LEDGER-1] (Probe j) Schweregrad ist der höchste je gesehene ...", "... herabgestufter Befund bleibt für das Verdikt blocker" (gemessen 2) |
| (k) `reconstructState` ignoriert `draft` | Draft-Zweig entfernt | `test/core/resume.test.ts` :: "[REQ-BIND-4] (Probe k) impl PR, green, DRAFT -> gated/green ...", "[REQ-BIND-5] (Probe k) Draft + grün ist für KEINE Review-Entscheidung merge-pending und nie ready", "[REQ-BIND-4] Draft-PR aus resume speist den Driver in den Critic ..." (gemessen 3) |
| (l) erste Runde wird als Stagnation gewertet | `judged` immer true bzw. `nextLoopDecision` ignoriert `judged` | `test/core/ledger.test.ts` :: "[REQ-LEDGER-11] (Probe l) erste Runde auf leerem Ledger ist nicht bewertet ...", "... Ende-zu-Ende: erste bewertete Runde verbrennt den Fresh-Retry nicht"; `test/core/loop.test.ts` :: "[REQ-LEDGER-11] (Probe l) nicht bewertete Runde ... -> RE_GEN" (beide) (gemessen 5 bzw. 3) |

Konstruktionen der Spec (Draft-Folgen, Label-accepted, 3-Zeilen-Verschiebung, R1/R2-Folge für (e)) sind
1:1 übernommen. Bei (a) ist "Anzahl" als Mutation nicht eindeutig im Ledger darstellbar; gemessen wurde
`progress := Anzahl Befunde der Runde < Anzahl offener blocker/major zu Beginn`.

## Weitere Abdeckung (keine Pflichtprobe)

- REQ-LEDGER-10: `renderLedgerTable` (Reihenfolge, "behoben (unverifiziert)") rein testbar; das Schreiben
  in den PR durch den Orchestrator (Skill-Prosa) ist nicht pure testbar und hier nicht abgedeckt.
- REQ-BIND-1 (`implement` öffnet Draft-PRs) und REQ-BIND-2 (`gh pr ready`) sind Skill-Prosa. Im Kern getestet
  ist nur `MARK_READY` (Driver) und `markDraft` (REQ-BIND-3); ein Test auf Skill-Text wäre ein Quelltext-Wächter
  und wurde bewusst nicht geschrieben.

## Vorher-Nachweis

`npx tsx test/evidence/before-counter.ts` (Adapter `errorCounts = Anzahl blocker/major je Runde`, heutiges
`nextLoopDecision` unverändert, `maxIter: 5, requireStrictlyDecreasing: true`; Stand vor der Implementierung):

```
Falsche Stagnation (Gate: A rot -> A behoben, B und C laufen an)
  errorCounts=[1,2]  heutige Entscheidung=FRESH_CONTEXT_RETRY  (Wahrheit: Fortschritt => RE_GEN)
Falscher Fortschritt (Critic: A,B -> implement behebt nichts, frischer Critic zieht nur A)
  errorCounts=[2,1]  heutige Entscheidung=RE_GEN  (Wahrheit: Stagnation => FRESH_CONTEXT_RETRY)
```

Beide Entscheidungen sind falsch, kein Absturz. Das Skript trägt `// @ts-nocheck` und ist nach der
Implementierung (neue `LoopState`) nicht mehr lauffähig; es gehört zum PR-Nachweis, nicht zur Suite.
