# Befund-Ledger: Mutationsmatrix und Vorher-Nachweis

Zu `docs/2026-11-13-befund-ledger-critic-verdikt-design.md` (Abnahme 2). Je Pflicht-Probe (a)-(l):
die Mutation und die Tests, die dabei rot werden müssen. Testtitel tragen das Tag `(Probe x)`.
Die Wirkung wurde gegen eine **Wegwerf-Referenzimplementierung** (nicht Teil dieses Branches)
nachgemessen: Baseline alle neuen Tests grün, jede Mutation unten färbt mindestens einen der
genannten Tests rot (Anzahl roter Tests in Klammern).

| Probe | Mutation | Datei :: Testname (muss rot werden) |
|---|---|---|
| (a) Fortschritt per Anzahl | `progress` aus Befundzahl statt Ledger | `test/core/ledger.test.ts` :: "[REQ-LEDGER-6] (Probe a) Tabellenfall 'falsche Stagnation' ..." (1 -> 2 Befunde muss RE_GEN sein); "... Tabellenfall 'falscher Fortschritt' ..." (2 -> 1 muss FRESH_CONTEXT_RETRY sein); "... Anzahl gleich, aber echter Fortschritt ..."; `test/core/loop.test.ts` :: "[REQ-LEDGER-8] (Probe a) ein veraltetes errorCounts-Feld ..." (beide Richtungen) (gemessen: 6 rote Tests im Ledger/Tabellenfall-Bereich; die `errorCounts`-Tests in `loop.test.ts` töten nur die Loop-Variante dieser Probe, nicht die Ledger-Variante) |
| (b) not-run als completed | `status` bei leer/ungültig/not-run `completed` mit `findings: []` | `test/core/critic.test.ts` :: "[REQ-CRITIC-2] (Probe b) leere Ausgabe ...", "... kein JSON ...", "... JSON ohne findings-Feld ..."; "[REQ-CRITIC-3] (Probe b) eine not-run Instanz ...", "... leeres Array von Läufen ..."; `test/cli/critic-verdict.test.ts` :: "[REQ-CRITIC-2] (Probe b) leere rawOutputs + Eingabefeld status 'completed' ..."; `test/core/driver.test.ts` :: "[REQ-CRITIC-4] (Probe b) not-run führt nie zu MARK_READY oder DONE" (gemessen 5 bzw. 5) |
| (c) Selbst-Label statt abgeleitetem Verdikt | Verdikt aus `verdict` der Critic-Ausgabe | `test/cli/critic-verdict.test.ts` :: "[REQ-CRITIC-5] (Probe c) Selbst-Label 'accepted' mit offenem blocker -> ... rejected" (Label accepted + offener blocker); "[REQ-CRITIC-1] Eingabefeld 'verdict' wird nicht beachtet"; `test/core/ledger.test.ts` :: "[REQ-CRITIC-5] (Probe c) ein einziger offener blocker ..."; `test/core/critic.test.ts` :: "[REQ-CRITIC-5] (Probe c) das Selbst-Label ... wird ignoriert" (gemessen 5) |
| (d) Abwesenheit eines Critic-Befunds = closed | Critic-Einträge, die fehlen, werden closed | `test/core/ledger.test.ts` :: "[REQ-LEDGER-3] (Probe d) fehlender Critic-Befund bleibt unverändert ...", "... frischer Critic zieht ... Verdikt auf rejected"; "[REQ-LEDGER-6] (Probe a) Tabellenfall 'falscher Fortschritt'"; `test/cli/critic-verdict.test.ts` :: "[REQ-LEDGER-3] (Probe d) frischer Critic zieht den offenen Befund nicht ..." (gemessen 6) |
| (e) "kein reopened"-Klausel gestrichen | `progress` ignoriert in der Runde wiedergeöffnete blocker/major | `test/core/ledger.test.ts` :: "[REQ-LEDGER-6] (Probe e) A adressiert, B taucht nach fixed-claimed wieder auf -> kein Fortschritt" (R1 A,B major; R2 addressed [A,B], Critic zieht B; A fixed-claimed, B reopened; Folge: FRESH_CONTEXT_RETRY); "... ein in der Runde wiedergeöffneter major verhindert Fortschritt ..." (gemessen 2) |
| (f) Nits zählen für Fortschritt | Nit-Fix gilt als Fortschritt / Nit-Reopen blockiert Fortschritt | `test/core/ledger.test.ts` :: "[REQ-LEDGER-6] (Probe f) kein Fortschritt, wenn nur ein Nit adressiert wird und der blocker offen bleibt"; "[REQ-LEDGER-9] (Probe f) ein wiedergeöffnetes Nit blockiert den Fortschritt nicht"; `test/core/ledger.test.ts` :: "[REQ-LEDGER-9] Nit mit reopenCount 2 löst keine oscillation aus" (gemessen je 1) |
| (g) REQ-LEDGER-7 nach der Stagnationsprüfung | Oszillation hinter Stagnation geprüft | `test/core/loop.test.ts` :: "[REQ-LEDGER-7] (Probe g) Oszillation eskaliert VOR der Stagnationsprüfung (kein Fresh-Retry)" (lastRound judged, !progress, oscillation, freshContextUsed false -> ESCALATE_OSCILLATION statt FRESH_CONTEXT_RETRY) (gemessen 1) |
| (h) Critic-Neustart zweimal | `retried: true` führt erneut zu `SPAWN_STATION critic` | `test/core/driver.test.ts` :: "[REQ-CRITIC-4] (Probe h) critiqued + not-run NACH dem Neustart -> ESCALATE critic-not-run ..." (gemessen 1) |
| (i) Key enthält Zeilennummer | Zeile/`evidence`/`claim` fließt in den Key | `test/core/finding-key.test.ts` :: "[REQ-KEY-1] (Probe i) Gate-Key ist zeilenunabhängig ... 3 Zeilen verschoben => gleicher Key", "... Critic-Key ist zeilen- und textunabhängig"; `test/core/critic.test.ts` :: "[REQ-CRITIC-3] (Probe i) derselbe Defekt ... verschieden lokalisiert ... ein Befund", "[REQ-KEY-2] Zeile in evidence und Wortlaut von claim beeinflussen den Key nicht"; `test/cli/critic-verdict.test.ts` :: "[REQ-KEY-1] (Probe i) derselbe Befund um 3 Zeilen verschoben trifft denselben Ledger-Eintrag" (gemessen: Gate-Variante 2, Critic-Variante 11); neu: `test/core/critic.test.ts` :: "[REQ-KEY-1] (Probe i) Zusatzfeld line: 10 vs 13 ... gleicher Key" |
| (j) Schweregrad = letzter statt höchster | `severity` wird überschrieben | `test/core/ledger.test.ts` :: "[REQ-LEDGER-1] (Probe j) Schweregrad ist der höchste je gesehene ...", "... herabgestufter Befund bleibt für das Verdikt blocker" (gemessen 2); neu: `test/core/ledger.test.ts` :: "[REQ-LEDGER-1] (Probe j) derselbe Critic-Key zweimal in einer Runde, blocker dann nit => severity blocker" |
| (k) `reconstructState` ignoriert `draft` | Draft-Zweig entfernt | `test/core/resume.test.ts` :: "[REQ-BIND-4] (Probe k) impl PR, green, DRAFT -> gated/green ...", "[REQ-BIND-5] (Probe k) Draft + grün ist für KEINE Review-Entscheidung merge-pending und nie ready", "[REQ-BIND-4] Draft-PR aus resume speist den Driver in den Critic ..." (gemessen 3); neu: `test/cli/pr-state.test.ts` :: "[REQ-BIND-4] pr-state: Draft-PR, alle Checks grün -> facts.draft true, phase gated" (tötet `draft: false` fest verdrahtet im CLI), "... nicht Draft ... ready true", "... isDraft fehlt -> Exit != 0", "... isDraft als String ... Exit != 0"; `test/core/resume.test.ts` :: "[REQ-BIND-4] PrFacts.draft ist Pflichtfeld (Typ-Wächter via npm run typecheck)" (nur im Typecheck rot) |
| (l) erste Runde wird als Stagnation gewertet | `judged` immer true bzw. `nextLoopDecision` ignoriert `judged` | `test/core/ledger.test.ts` :: "[REQ-LEDGER-11] (Probe l) erste Runde auf leerem Ledger ist nicht bewertet ...", "... Ende-zu-Ende: erste bewertete Runde verbrennt den Fresh-Retry nicht"; `test/core/loop.test.ts` :: "[REQ-LEDGER-11] (Probe l) nicht bewertete Runde ... -> RE_GEN" (beide) (gemessen 5 bzw. 3) |

Konstruktionen der Spec (Draft-Folgen, Label-accepted, 3-Zeilen-Verschiebung, R1/R2-Folge für (e)) sind
1:1 übernommen. Bei (a) ist "Anzahl" als Mutation nicht eindeutig im Ledger darstellbar; gemessen wurde
`progress := Anzahl Befunde der Runde < Anzahl offener blocker/major zu Beginn`.

## Weitere Killer aus der unabhängigen Messung (Nachtrag)

- `test/cli/pr-state.test.ts` (4 Tests, `gh`-Stub im PATH, gegen dist): REQ-BIND-4 am echten CLI-Pfad.
- `test/core/critic.test.ts`: Escapes im `claim` (`say "x" }`), `{` im Text vor dem JSON, `req: ""` => not-run, Zusatzfeld `line` ohne Wirkung auf den Key.
- `test/core/ledger.test.ts`: gleicher Critic-Key zweimal in einer Runde (blocker, nit) => blocker.

## Unabhängige Messung 2026-11-14

12/12 Pflichtproben getötet. 38 eigene Mutationen der unabhängigen Messung, 10 überlebten. Nach diesem
Nachtrag geschlossen: o37, o28, o29, o15, i5, j2.
**o18** (`if (c === "\\") i++;` -> `if (false) i++;` in `objectEnd`) wurde zunächst NICHT getötet: der erste Escape-Test hat zwei escapte Quotes im `claim`, dann stimmt die Klammerbilanz ohne Escape-Behandlung zufällig (336/336 grün, Mutation äquivalent für diese Eingabe). Erst mit Nachtrag 2 geschlossen: `test/core/critic.test.ts` :: "[REQ-CRITIC-2] ungerade Zahl escapter Quotes im claim ('5\" Rohr }') ..." (gemessen: mit Mutation 1 rot, ohne Mutation 31/31 grün). Der Test "escapter Backslash direkt vor dem schließenden Quote" tötet o18 nicht, sondern eine naive Variante `s[i-1] !== "\\"` (gemessen rot).
 Verbleibend, als äquivalent bewertet:
- **o06**: `higher()` am Eintrag und ein zweites Vorkommen desselben Keys sieht bereits `reopened`; das Ergebnis ist gleich.
- **o10**: Die Severity steigt nur bei Meldung in der Runde; der Eintrag wird dann nie `closed`/`fixed-claimed`, die Abweichung ist nicht beobachtbar.
- **o24**: typgleich, kein beobachtbarer Unterschied.

## Weitere Abdeckung (keine Pflichtprobe)

- REQ-LEDGER-10: `renderLedgerTable` (Reihenfolge, "behoben (unverifiziert)") rein testbar; das Schreiben
  in den PR durch den Orchestrator (Skill-Prosa) ist nicht pure testbar und hier nicht abgedeckt.
- REQ-BIND-1 (`implement` öffnet Draft-PRs) und REQ-BIND-2 (`gh pr ready`) sind Skill-Prosa. Im Kern getestet
  ist nur `MARK_READY` (Driver) und `markDraft` (REQ-BIND-3); ein Test auf Skill-Text wäre ein Quelltext-Wächter
  und wurde bewusst nicht geschrieben.

## Vorher-Nachweis

`npx tsx test/evidence/before-counter.ts` läuft gegen die **gepinnte Fixture** `test/evidence/loop-before.ts`
(= `src/core/loop.ts` aus Commit 1a74327, byte-gleich bis auf zwei vorangestellte Kommentarzeilen mit
`// @ts-nocheck`), unabhängig vom aktuellen `src/`. Adapter `errorCounts = Anzahl blocker/major je Runde`,
`maxIter: 5, requireStrictlyDecreasing: true`:

```
Falsche Stagnation (Gate: A rot -> A behoben, B und C laufen an)
  errorCounts=[1,2]  heutige Entscheidung=FRESH_CONTEXT_RETRY  (Wahrheit: Fortschritt => RE_GEN)
Falscher Fortschritt (Critic: A,B -> implement behebt nichts, frischer Critic zieht nur A)
  errorCounts=[2,1]  heutige Entscheidung=RE_GEN  (Wahrheit: Stagnation => FRESH_CONTEXT_RETRY)
```

Beide Entscheidungen sind falsch, kein Absturz. Die Fixture wird von vitest nicht eingesammelt (kein `.test.`)
und stört den Typecheck nicht (`@ts-nocheck`).
