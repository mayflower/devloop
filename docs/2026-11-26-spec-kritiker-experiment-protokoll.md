# Experiment: Spec-Kritiker statt Menschen-Stopp am Eingang — Protokoll

> devloop, Issue #11. Das Protokoll ist vorregistriert: Operatoren, Einordnung, Budget und
> Schwellen stehen fest, bevor der erste Kritiker läuft. Danach wird nichts mehr nachgeschärft.
> Status: **abgenommen** (2026-11-26).

## Frage

Findet ein frischer Spec-Kritiker eingeschleuste Fehlauslegungen einer Spec gegen ihre Grundlage
zuverlässig, ohne an korrekten Specs Fehlalarm zu schlagen? Wenn ja, lässt sich der Eingangs-Stopp
ersetzen oder auf ein Entscheidungsprotokoll verkleinern. Wenn nein, bleibt er.

## Material

Gegenstand sind alle sechs Specs aus `TMogdans/carrera-planer`, jeweils in der Fassung des
**ersten** Commits der Spec, also vor allen Rückkanten:

| Spec | REQs (heute) | Zeilen (heute) | Grundlage laut Kopf |
|---|---|---|---|
| m1-rechenkern | 43 | 436 | KONZEPT.md, docs/recherche.md |
| m2-editor | 56 | 592 | KONZEPT.md, M1 |
| m3a-bestand | 50 | 576 | KONZEPT.md, M1, M2 |
| m3b-backend | 36 | 548 | KONZEPT.md, M3a |
| gerade-100 | 23 | 351 | Issue #34, recherche.md, carrera-go-katalog.md, M1–M3a |
| plan-beschriftung-symbole | 26 | 467 | Issues #35, #36, M1–M3a |

**Grundlage** heißt: alle Dokumente, die der Kopf der Spec als Grundlage nennt, in dem Stand, der
beim ersten Commit der Spec galt. Dazu kommen der Issue-Text und `constitution.md`. Die Issues
sind kurz (17–22 Zeilen), die Specs lang. Ein Kritiker, der nur gegen das Issue prüft, hätte keine
Chance und würde an jeder sauberen Detailentscheidung Fehlalarm schlagen. Deshalb bekommt er die
ganze Grundlage.

Die Abschnitte „Entscheidungen des Menschen“ bzw. „Zur Abnahme — entschieden“ bleiben Teil der
Spec. Sie sind die heutige Vorform des Entscheidungsprotokolls.

Der Lauf arbeitet auf Kopien im Scratchpad. carrera-planer wird nicht verändert.

## Mutanten

### Operatoren

| ID | Operator | Beispiel |
|---|---|---|
| O1 | Bedingung umkehren | „wenn geschlossen“ → „wenn offen“ |
| O2 | Schwellwert/Konstante verschieben | 171 mm → 172 mm, `≤` → `<` |
| O3 | Anforderung streichen | REQ samt aller Verweise entfernen |
| O4 | Fehlerverhalten ändern | lauter Fehler → stilles Ignorieren, Abbruch → Fortsetzen |
| O5 | Nicht verlangte Anforderung hinzufügen | neues REQ im passenden Abschnitt |

Je Spec gibt es einen Mutanten je Operator, insgesamt also 6 × 5 = 30.

### Erzeugung

1. **Auswahl per Skript:** Ein deterministisches Skript wählt je Spec und Operator ein
   Ziel-REQ aus den Akzeptanzkriterien. Der Seed ist der Spec-Name. Für O1, O2 und O4 sind nur REQs
   Kandidaten, die eine Bedingung, eine Zahl bzw. ein Fehlerverhalten enthalten.
2. **Formulierung durch Sonnet:** Sonnet formuliert die Mutation. Der Kritiker ist Opus. Damit ist
   das Modell des Generators ein anderes als das des Kritikers.
3. **Konsistenzregel:** Die Mutation wird überall nachgezogen, wo die Spec das REQ erwähnt, also
   auch in Begriffen, Entscheidungen, Smoke und Bekannten Grenzen. Eine echte Fehlauslegung ist in
   sich stimmig. Ein Mutant, der sich durch einen Widerspruch innerhalb der Spec verrät, wäre zu
   leicht zu finden.
4. **Ausschluss:** Ist das Ziel-REQ aus der Grundlage nicht ableitbar, kann der Mutant weder
   widersprechen noch eine Mehrdeutigkeit treffen. Dann nimmt das Skript den nächsten Kandidaten.
   Jeder Ausschluss wird protokolliert.

### Einordnung (vor dem Lauf)

Jeder Mutant wird vor dem Lauf gegen die Grundlage eingeordnet:

- **W — widerspricht der Grundlage:** Es gibt eine zitierbare Stelle, die der Mutation
  widerspricht. Der Kritiker muss den Mutanten finden.
- **M — liegt in einer Mehrdeutigkeit:** Die Grundlage lässt die mutierte Lesart zu. Der Kritiker
  muss die Stelle als offene Auslegung melden.

Die Einordnung schreibe ich mit Belegzitat. **Du nimmst die Mutantenliste ab, bevor die Kritiker
laufen.** Das sind 30 Zeilen. Danach ist die Liste eingefroren.

## Kritiker

- **Lauf:** frische Opus-Instanz, eine je Spec-Variante, nur lesend, ohne Wissen über Mutanten.
- **Eingabe:** Spec-Variante und Grundlage.
- **Auftrag:** „Prüfe, ob diese Spec ihre Grundlage richtig und vollständig umsetzt. Melde
  Widersprüche, Lücken, nicht verlangte Anforderungen und offene Auslegungen, jeweils mit
  Belegzitat aus der Grundlage.“ Der Prompt wird vor dem Start wörtlich in diesem Dokument
  eingefroren.
- **Ausgabe (Schema):** `findings[]` mit
  - `req`: REQ-ID oder Abschnitt;
  - `kategorie`: `widerspruch` | `luecke` | `nicht_verlangt` | `offene_auslegung`;
  - `schwere`: `blocker` | `hinweis`;
  - `beleg`: Zitat aus der Grundlage;
  - `begruendung`.

## Läufe

Insgesamt gibt es 36 Kritiker-Läufe:

- 30 Mutanten-Läufe;
- 6 Kontroll-Läufe auf den unveränderten Erstfassungen.

## Auswertung

- **Tötung bei W:** ein `blocker` am Ziel-REQ mit passender Kategorie. Bei O3 zählt ein `luecke`
  bzw. `widerspruch`, der auf die Grundlagenstelle des gestrichenen REQ zeigt.
- **Tötung bei M:** mindestens eine `offene_auslegung` am Ziel-REQ. Ein `blocker` zählt hier auch.
- **Fehlalarm in einer Kontrolle:** ein `blocker`, der keinem echten Mangel entspricht.
  - Die `blocker` der Kontrollen beurteilst **du**, ohne zu wissen, aus welchem Lauf sie stammen.
  - Ein Befund mit zutreffendem Belegzitat ist ein **echter Befund**. Er wird getrennt gezählt und
    ist kein Fehlalarm.
- **Rauschen:** `blocker` in Mutanten-Läufen, die nicht den Mutanten betreffen. Das wird nur
  berichtet, nicht als Schwelle verwendet. Es dient als Plausibilitätsprüfung gegen einen
  Kritiker, der „alles tötet“.

## Schwellen (fest)

| Messgröße | Erfolg |
|---|---|
| Tötungsrate der W-Mutanten | ≥ 80 % |
| Kontrollen mit mindestens einem Fehlalarm | ≤ 1 von 6 |
| M-Mutanten | wird berichtet, keine Schwelle |

**Entscheidung danach:**

- Beide Schwellen sind erfüllt: Eingangs-Stopp durch Spec-Kritiker ersetzen. Der Mensch prüft dann
  nur noch das Entscheidungsprotokoll und das Ergebnis. Dafür kommt eine eigene Spec, #4 wird neu
  bewertet.
- Die Tötung ist erfüllt, die Fehlalarme nicht: Den Stopp verkleinern. Der Mensch sieht nur die
  `blocker` des Kritikers und das Entscheidungsprotokoll.
- Die Tötung ist nicht erfüllt: Der Stopp bleibt.

## Budget

- Einmal 36 Opus-Läufe und 6 Sonnet-Läufe, einer je Spec für alle fünf Mutanten.
- Keine Nachschärf-Runden am Prompt oder an den Mutanten. Ein misslungener Lauf, etwa ein Abbruch
  oder ein Schemafehler, wird einmal wiederholt. Dabei bleibt alles unverändert.

## Zweite Messung (Rückkanten), getrennt

Fünf der sechs Specs wurden nach dem ersten Commit geändert:

| Spec | Commits |
|---|---|
| m2-editor | 6 |
| m3a-bestand | 4 |
| m3b-backend | 4 |
| plan-beschriftung-symbole | 3 |
| m1-rechenkern | 2 |

Gemessen wird, ob ein Kritiker auf Spec und Tests (Erstfassungen) die Lücken gefunden hätte, die
später per Rückkante kamen. Das läuft erst nach der ersten Messung und bekommt ein eigenes kurzes
Protokoll, sobald die Rückkanten gesichtet sind.

## Bekannte Grenzen

- **Überlebende als Kontrolle:** Die Kontrollen sind Specs, die einen Menschen-Stopp und eine
  Implementierung überlebt haben. Echte Erstentwürfe sind rauer. Die gemessene Fehlalarmrate ist
  deshalb eher zu optimistisch.
- **Kleine Stichprobe:** Ein Projekt, ein Autor, ein Spec-Stil. Die Stichprobe ist klein. Eine
  Tötung von 24/30 gegenüber 23/30 ist kein belastbarer Unterschied. Die Schwelle entscheidet
  trotzdem, weil sie vorab feststeht.
- **Mutanten sind nicht echte Fehler:** Echte Fehlauslegungen entstehen eher im Schritt
  Gespräch → Issue. Den sieht dieses Experiment nicht, siehe „Herkunft der Anforderung“ in #11.
- **Einordnung durch mich:** Die W/M-Einordnung schreibe ich selbst. Deine Abnahme der Liste ist
  die Gegenprobe.
