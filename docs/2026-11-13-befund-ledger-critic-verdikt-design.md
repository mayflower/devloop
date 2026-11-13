# Befund-Ledger + bindendes Critic-Verdikt — Design

> devloop. Ersetzt die zählerbasierte Fortschrittsmessung der Rückkante durch einen Ledger mit
> Befund-Identität, holt das Critic-Verdikt in den getesteten Kern und macht es merge-bindend.
> Anlass: Vergleich mit dem Elephant-Goldfish Model (google/elephant-goldfish-model,
> `skills/egm-review-loop`, `skills/egm-resolve`), dessen Konvergenzregeln Befunde über Runden
> verfolgen statt sie zu zählen und einen ausgefallenen Reviewer nie als „keine Befunde" werten.
> Status: **Entwurf v2 (nach einer frischen Critic-Runde), wartet auf Spec-Abnahme.**

## Ist-Zustand (origin/main, b7e7115)

1. **Fortschritt = Zähler.** `src/core/loop.ts:7,24-30` hält `errorCounts: number[]` und wertet
   „letzte < vorletzte" (bei `requireStrictlyDecreasing=false`: `<=`) als Fortschritt. Was ein
   Befund ist und wer die Zahlen liefert, regelt nur Prosa.
2. **Das Critic-Verdikt hat keinen Pfad im Kern.** `driver.ts` kennt nach `gated`+grün nur
   `SPAWN_STATION critic`; keine Phase, kein Feld für das Ergebnis. Ein Critic-`rejected` erreicht
   `nextLoopDecision` nie — `handleRedGate` läuft nur bei rotem Gate. Was bei `rejected`, leerem
   Output oder Timeout passiert, entscheidet `skills/loop/SKILL.md` per Prosa.
3. **Bei T0/T1 kann der Critic einen Merge nicht verhindern.** `templates/auto-merge.yml`
   (Variante B) armiert GitHubs Auto-Merge bei `opened` für jeden Nicht-Draft-PR des Bots
   (`.github/workflows/auto-merge.yml`, Bedingung `DRAFT != true`). Der Merge erfolgt, sobald die
   Pflicht-Checks grün sind; der Critic ist kein Check und läuft erst danach. Kein Agent-/Skill-Text
   öffnet Impl-PRs als Draft (`grep -i draft` über `agents/ skills/` leer).
4. **Resume bei grünem CI überspringt den Critic.** `resume.ts:66-68` setzt bei grünen Checks
   direkt `merge-pending`; für T0/T1 folgt `DONE` (`driver.ts:80-82`).
5. **`resume` rekonstruiert keinen Schleifenzustand.** `reconstructState` liefert kein `loop`.
   Fehlt es, eskaliert `handleRedGate` mit `loop-params-required`; setzt der Orchestrator es neu
   an, beginnt `iteration` bei 0 und `maxIter` ist per Resume umgehbar.

Punkt 3 und 4 sind unabhängig vom EGM-Anlass reale Lücken; ohne sie zu schließen, wäre ein
Critic-Verdikt im Kern für T0/T1 wirkungslos.

## Warum der Zähler falsch misst

| Fall | Runde n | Runde n+1 | Zähler | Wahrheit | Realer Pfad |
|---|---|---|---|---|---|
| **Falsche Stagnation** | Gate: Test A rot | A behoben; dadurch laufen B, C erst an und sind rot | 1→2 → `FRESH_CONTEXT_RETRY`, dann Eskalation | Fortschritt | **heute** |
| **Falscher Fortschritt** | Critic: A, B | `implement` behebt nichts; frischer Critic zieht nur A | 2→1 → `RE_GEN` | Stagnation | sobald Critic-Befunde in die Rückkante fließen (REQ-CRITIC-5) — also durch dieses Design |

Gerechnet mit `maxIter: 5, requireStrictlyDecreasing: true` (Parameter aus `loop.test.ts`).
Der zweite Fall ist der Grund, warum das Critic-Verdikt nicht mit dem Zähler in die Schleife
darf: Ein frischer Critic zieht Stichproben (EGM: „Fresh reviewers sample differently each round").

## Begriffe

- **Runde:** ein `implement`-Lauf und die darauf folgende Bewertung — entweder ein rotes Gate
  oder (bei grünem Gate) ein abgeschlossener Critic-Lauf. Pro Runde wird der Ledger genau
  einmal fortgeschrieben.
- **Quelle deterministisch** (Gate: Test rot, Mutante überlebt, Semgrep, Trace-Lücke): läuft
  bei gleichem Code gleich. **Abwesenheit ist Evidenz.**
- **Quelle Stichprobe** (Critic): **Abwesenheit ist keine Evidenz.** Ein Critic-Befund gilt erst
  als adressiert, wenn `implement` ihn ausdrücklich meldet.
- **Schweregrad:** `blocker | major | nit`. Gate-Befunde sind immer `blocker`. Für einen Key gilt
  der **höchste je gesehene** Schweregrad (ein späterer Critic kann nicht herabstufen).
- Menschliche Review-Kommentare sind **nicht** Teil dieses Ledgers (siehe „Außerhalb").

## Befund-Identität (Key)

| Quelle | Key |
|---|---|
| Test rot | `test:<datei>:<testname>` |
| Mutante überlebt | `mutant:<datei>:<funktion>:<mutator>` |
| Semgrep | `semgrep:<regel>:<datei>:<funktion>` |
| Trace-Lücke | `trace:<REQ-ID>` |
| Critic | `review:<REQ-ID oder "-">:<klasse>:<datei>`, `klasse` ∈ `req-uncovered`, `happy-path-only`, `spec-deviation`, `convention`, `security`, `other` |

Keine Zeilennummern, kein Freitext. Der Review-Key ist bewusst dateigenau (nicht
funktionsgenau), weil frische Critics denselben Defekt verschieden lokalisieren.

## Ledger-Zustände

```
open ──(Gate: fehlt in Folgerunde)──────────────► closed
open ──(Critic: implement meldet adressiert)────► fixed-claimed
closed | fixed-claimed ──(Key erneut gemeldet)──► reopened   (reopenCount += 1)
reopened verhält sich wie open (kann wieder closed / fixed-claimed werden)
```

## Anforderungen

### Key-Ableitung (`src/core/finding-key.ts`, Critic-Schema)

- **REQ-KEY-1** — Wenn das System eine rohe Gate- oder Critic-Ausgabe einliest, soll es jedem
  Befund den Key nach obiger Tabelle zuweisen, ohne Zeilennummer und ohne Befundtext.
- **REQ-KEY-2** — Das Critic-Verdikt-Schema soll je Befund die Pflichtfelder `req` (REQ-ID oder
  `-`), `klasse` (Enum oben), `datei`, `severity` (`blocker|major|nit`), `claim`, `evidence`
  enthalten.

### Ledger und Fortschritt (`src/core/ledger.ts`, `src/core/loop.ts`)

- **REQ-LEDGER-1** — Wenn eine Runde bewertet wird, soll das System ihre Befunde per Key mit dem
  Ledger abgleichen und je Key genau einen Zustand aus {open, fixed-claimed, closed, reopened}
  sowie den höchsten je gesehenen Schweregrad führen.
- **REQ-LEDGER-2** — Wenn ein Gate-Befund in der Folgerunde nicht auftritt, soll das System ihn
  auf `closed` setzen.
- **REQ-LEDGER-3** — Wenn ein Critic-Befund in der Folgerunde nicht auftritt und `implement` ihn
  nicht als adressiert gemeldet hat, soll das System seinen Zustand unverändert lassen.
- **REQ-LEDGER-4** — Wenn `implement` einen Critic-Befund im Zustand open oder reopened als
  adressiert meldet, soll das System ihn auf `fixed-claimed` setzen.
- **REQ-LEDGER-5** — Wenn ein Befund im Zustand `closed` oder `fixed-claimed` erneut gemeldet
  wird, soll das System ihn auf `reopened` setzen und `reopenCount` um 1 erhöhen.
- **REQ-LEDGER-6** — Wenn eine Runde bewertet wird, soll das System sie genau dann als
  Fortschritt werten, wenn mindestens ein Befund mit Schweregrad blocker/major, der zu
  Rundenbeginn open oder reopened war, in dieser Runde `closed` oder `fixed-claimed` wurde,
  **und** kein blocker/major-Befund in dieser Runde `reopened` wurde.
- **REQ-LEDGER-7** — Wenn in einer Runde ein blocker/major-Key `reopened` wird und sein
  `reopenCount` danach ≥ 2 ist, soll `nextLoopDecision` `ESCALATE_OSCILLATION` liefern;
  Priorität: nach Gate-Tamper und Max-Iter, **vor** der Stagnationsprüfung.
- **REQ-LEDGER-8** — Wenn `nextLoopDecision` über Stagnation entscheidet, soll es ausschließlich
  REQ-LEDGER-6 verwenden; `errorCounts` entfällt aus `LoopState`.
- **REQ-LEDGER-9** — Nits sollen weder in REQ-LEDGER-6 noch in REQ-LEDGER-7 eingehen.
- **REQ-LEDGER-10** — Wenn der Driver `STOP_FOR_HUMAN` oder `ESCALATE` liefert, soll der
  Orchestrator den Ledger als Tabelle in den PR schreiben: offene blocker/major zuoberst,
  `fixed-claimed` ausdrücklich als „behoben (unverifiziert)".

### Critic-Verdikt im Kern (`src/core/critic.ts`, `src/cli/critic-verdict.ts`, `driver.ts`)

- **REQ-CRITIC-1** — Wenn ein Critic-Lauf endet, soll der Orchestrator dessen **rohe** Ausgabe an
  die CLI `critic-verdict` geben; `status` und Verdikt sind keine Eingabefelder.
- **REQ-CRITIC-2** — Wenn die rohe Ausgabe nicht gegen das Schema aus REQ-KEY-2 validiert (leer,
  kein JSON, Pflichtfeld fehlt, Enum verletzt), soll die CLI `status: "not-run"` liefern. Ein
  `not-run` soll nie als Runde ohne Befunde gelten.
- **REQ-CRITIC-3** — Wenn das Tier mehrere Critic-Instanzen verlangt (T2/T3), soll das System die
  Befunde aller Instanzen vereinigen (Duplikate per Key); ist eine Instanz `not-run`, ist die
  ganze Critic-Runde `not-run`.
- **REQ-CRITIC-4** — Wenn eine Critic-Runde `not-run` ist, soll der Driver sie genau einmal neu
  spawnen; ist sie erneut `not-run`, soll er `ESCALATE` mit Grund `critic-not-run` liefern.
- **REQ-CRITIC-5** — Wenn eine Critic-Runde `completed` ist, soll das System das Verdikt aus dem
  Ledger **ableiten**: `accepted` genau dann, wenn kein blocker/major-Key open oder reopened
  ist; sonst `rejected`. Ein Selbst-Label des Critic wird ignoriert.
- **REQ-CRITIC-6** — Wenn das abgeleitete Verdikt `rejected` ist, soll der Driver die Rückkante
  über `nextLoopDecision` nehmen.
- **REQ-CRITIC-7** — Wenn das abgeleitete Verdikt `accepted` ist, soll der Driver
  `MARK_READY` liefern und danach in `merge-pending` übergehen.

### Bindung an den Merge (`skills/implement`, `skills/loop`, `resume.ts`)

- **REQ-BIND-1** — `implement` soll Impl-PRs als **Draft** öffnen.
- **REQ-BIND-2** — Wenn der Driver `MARK_READY` liefert, soll der Orchestrator den PR auf
  „ready for review" setzen (`gh pr ready`); das armiert bei T0/T1 den bestehenden Auto-Merge
  (`ready_for_review` ist bereits Trigger).
- **REQ-BIND-3** — Wenn ein bereits ready gesetzter Impl-PR auf die Rückkante geht (menschliches
  `changes-requested`), soll der Orchestrator ihn vor dem nächsten Push zurück auf Draft setzen.
- **REQ-BIND-4** — Wenn `reconstructState` einen Impl-PR mit grünen Checks im Draft-Status
  sieht, soll es `phase: "gated"`, `gateVerdict: "green"` liefern (→ Critic), nicht
  `merge-pending`. `PrFacts` erhält dafür `draft: boolean`.
- **REQ-BIND-5** — Die Driver-Invarianten sollen um „kein Pfad nach `merge-pending` ohne
  abgeleitetes `accepted` einer `completed`-Critic-Runde" ergänzt und **zusätzlich** in
  `resume.test.ts` für `reconstructState` bewiesen werden (Draft + grün ⇒ nie `merge-pending`).

## Abnahme (Wirkung, nicht Form)

1. **Fehlfälle als Entscheidungs-Tests.** Beide Tabellenfälle als Befundfolgen gegen
   `nextLoopDecision` mit Ledger: falsche Stagnation ⇒ `RE_GEN`; falscher Fortschritt ⇒
   `FRESH_CONTEXT_RETRY`. **Vorher-Nachweis** (im PR dokumentiert, kein Test): dieselben Folgen
   über einen Adapter `errorCounts = Anzahl blocker/major je Runde` durch das **heutige**
   `nextLoopDecision` — es muss die jeweils falsche Entscheidung herauskommen (nicht ein
   Absturz).
2. **Pflicht-Mutationsproben** — je Mutation muss mindestens ein benannter Test rot werden:
   - (a) Fortschritt wieder per Anzahl
   - (b) `not-run` als `completed` mit `findings: []`
   - (c) Selbst-Label `accepted` statt abgeleitetem Verdikt (Konstruktion: Label `accepted`,
     ein offener blocker)
   - (d) Abwesenheit eines Critic-Befunds als `closed`
   - (e) „kein reopened"-Klausel aus REQ-LEDGER-6 gestrichen (Konstruktion: R1 A, B major; R2 A
     wird adressiert gemeldet, B taucht nach `fixed-claimed` wieder auf ⇒ muss Stagnation sein)
   - (f) Nits zählen für Fortschritt
   - (g) REQ-LEDGER-7 nach statt vor der Stagnationsprüfung
   - (h) Critic-Neustart zweimal statt einmal
   - (i) Key enthält Zeilennummer (Konstruktion: gleicher Befund, um 3 Zeilen verschoben ⇒ muss
     derselbe Key sein)
   - (j) Schweregrad = letzter statt höchster gesehener
   - (k) `reconstructState` ignoriert `draft`
3. **Key-Stabilität (Pilot, kein Gate):** im nächsten echten Lauf denselben Implement-Stand von
   zwei frischen Critics prüfen lassen; Anteil gleicher Review-Keys, typisch und Maximum der
   Abweichung dokumentieren. Unter 50 % Übereinstimmung ⇒ Klassenliste nachschärfen (eigene
   Spec-Änderung, eigener Stopp).

**Abbruchbedingung für Kritikrunden an diesem Doc:** Die eine frische Critic-Runde ist gelaufen
(Befunde B1–B9 eingearbeitet). Keine weitere Runde vor der Abnahme; danach prüft der echte Lauf.

## Bekannte Grenzen

- **Orchestrator-Vertrauen bleibt.** REQ-CRITIC-1 hebt die Hürde (der Kern validiert selbst,
  `status` ist kein Eingabefeld), aber ein Orchestrator könnte gültiges JSON ohne Befunde
  fabrizieren, und er setzt `gh pr ready`. Echte Abhilfe wäre der Critic als CI-Job mit
  Pflicht-Check — eigener Schritt.
- **`fixed-claimed` ist eine Behauptung.** Ein `implement`, das alles als adressiert meldet,
  erzeugt Fortschritt auf dem Papier, bis ein Critic den Key wieder zieht (zweites Mal ⇒
  Eskalation) oder `maxIter` greift. Sichtbar über REQ-LEDGER-10.
- **Key-Grobheit:** zwei verschiedene Defekte derselben Klasse in derselben Datei verschmelzen.
- **Falsch-positiver Critic-Befund** kann nicht „akzeptiert" werden: er endet in Eskalation an den
  Menschen. Gewollt, solange es keinen menschlichen Kanal in den Ledger gibt.
- **EGMs Churn** (neuer Befund, den das Zurücknehmen eines Fixes löst) ist nicht mechanisch
  prüfbar; REQ-LEDGER-7 ist die mechanische Teilmenge.

## Außerhalb dieses Docs (dokumentierte Lücken)

- **Ledger-Persistenz über `resume`** (Ist-Zustand 5). Mit REQ-BIND-4 ist der *Critic-Nachweis*
  persistent (Draft-Status), der *Ledger* nicht: nach Resume beginnt er leer, `iteration` bei 0.
  Persistenz als Bot-PR-Kommentar bräuchte eine eigene Vertrauensdiskussion (geschrieben von der
  beobachteten Seite; Gate-Befunde könnte CI neu berechnen, Critic-Befunde nicht).
- **Menschliches `changes-requested` auf `merge-pending`** führt zu `RE_GEN` ohne Ledger und ohne
  `maxIter` (`driver.ts:147-149`). Menschliche Review-Kommentare in den Ledger zu holen (inkl.
  „Risiko akzeptiert" = settled) gehört mit der Persistenz zusammen.

## Verworfene Alternativen

- **Zähler behalten, Nits herausfiltern:** behebt keinen der Fehlfälle.
- **Critic prüft die offenen Befunde der Vorrunde selbst nach:** bricht die Frische.
- **Verifier-Station für `fixed-claimed`:** prüfbar, aber eine Station je Runde, ebenfalls
  Stichprobe. Erst bei Pilot-Evidenz, dass `fixed-claimed` regelmäßig falsch ist.
- **Critic als Pflicht-Status-Check, vom Orchestrator gesetzt:** gleiche Vertrauensstufe wie
  Draft→Ready, aber neue Check-Infrastruktur im Ziel-Repo; Draft nutzt den vorhandenen
  Auto-Merge-Filter.
- **Mehr Critic-Instanzen für Recall (EGM A/B):** korrelierte blinde Flecken, ohne Messung nicht
  begründbar.
