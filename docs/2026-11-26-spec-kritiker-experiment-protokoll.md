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

## Ergebnis (2026-11-26)

35 Läufe (29 Mutanten, 6 Kontrollen), frisches Opus je Lauf, blind, nur lesend. Kein technischer
Abbruch, keine Wiederholung. Gegenüber Anhang A kamen nur zwei technische Dinge dazu: ein Satz
vorweg, der das Lesen auf das eigene Variantenverzeichnis beschränkt, und die Ausgabe über ein
Schema mit denselben Feldern statt als freier JSON-Text.

| Messgröße | Ergebnis | Schwelle | erfüllt |
|---|---|---|---|
| Tötungsrate W | 4 / 15 (27 %) | ≥ 80 % (12 / 15) | nein |
| Kontrollen mit `blocker` | 6 / 6 (11 Blocker) | ≤ 1 / 6 Fehlalarm | nicht beurteilt, für die Entscheidung unerheblich |
| M nach Regel | 1 / 14 | – | – |

**Entscheidung nach Protokoll: Der Eingangs-Stopp bleibt.**

### W-Mutanten im Einzelnen

| Spec | Op | Ziel | Befund am Ziel |
|---|---|---|---|
| m1 | O1 | CORE-25 | `blocker` (nicht_verlangt): getötet |
| m1 | O4 | SCHEMA-3 | `hinweis` (offene_auslegung) |
| m1 | O5 | CORE-32 | `hinweis` (nicht_verlangt) |
| m2 | O1 | EDIT-9 | keiner |
| m2 | O2 | STAT-2 | `blocker` (widerspruch): getötet |
| m2 | O5 | EDIT-21 | `hinweis` (nicht_verlangt) |
| m3a | O4 | BUI-5 | `hinweis` (offene_auslegung) |
| m3a | O5 | BARCH-5 | keiner |
| m3b | O4 | SYNC-8 | `blocker` (widerspruch): getötet |
| m3b | O5 | SRV-7 | `hinweis` (nicht_verlangt) |
| gerade-100 | O2 | CAT-5 | `hinweis` (widerspruch) |
| gerade-100 | O5 | G100-11 | `blocker` (widerspruch): getötet |
| plan | O3 | LBL-4 gestrichen | `hinweis` (offene_auslegung, Querung) |
| plan | O4 | LBL-5 | keiner zur Mutation; der `blocker` an LBL-5 betrifft das Lesen und kommt auch in unveränderten Varianten |
| plan | O5 | LBL-11 | `hinweis` (nicht_verlangt) |

### Beobachtungen

- **Gesehen, aber zu schwach eingestuft.** In 8 der 11 nicht getöteten W-Mutanten beschreibt der
  Kritiker die Mutation am Ziel-REQ zutreffend, stuft sie aber als `hinweis` ein. Mit jeder
  Schwere wären es 12 / 15. Diese Zählung ist nachträglich und trägt keine Entscheidung: Jeder
  Lauf liefert 4–10 Hinweise, und auf Hinweis-Ebene trennt der Kritiker schlecht (die 256-KiB-Grenze
  des Mutanten bemängelt er genauso wie die 1-MiB-Grenze des Originals).
- **Die O5-Ergänzung in Anhang A hat nicht gewirkt.** 5 der 6 hinzugefügten REQs blieben `hinweis`.
  Getötet wurde nur gerade-100 O5, und zwar als `widerspruch`, weil der Zusatz zugleich sachlich
  falsch war.
- **Kontroll-Blocker sind stabil.** Jeder der 11 Blocker in den Kontrollen taucht in den
  Mutanten-Läufen derselben Spec wieder auf. Ob es echte Mängel der abgenommenen
  carrera-planer-Specs sind, ist nicht beurteilt.

### Folgen

- Die zweite Messung (Rückkanten) wird nicht gefahren. Sie hätte nur einen Erfolg der ersten
  Messung absichern sollen.
- Kandidat für ein eigenes Folgeexperiment: ein Kritiker mit anderer Schwere-Kalibrierung, geprüft an
  **frischen** Mutanten. Die 29 Mutanten hier sind für die Kalibrierung verbraucht.

## Anhang A: Kritiker-Prompt (eingefroren vor dem ersten Lauf)

Platzhalter: `<SPEC>` ist der Pfad der Spec-Variante. `<GRUNDLAGE>` ist das Verzeichnis mit der
Grundlage. Die Varianten liegen unter neutralen Namen (`spec.md` in einem zufällig benannten
Verzeichnis), sodass der Pfad nichts über Mutant oder Kontrolle verrät.

```text
Du prüfst eine Spec, bevor auf ihrer Basis Tests und Code entstehen. Niemand hat sie vor dir
gelesen. Was du nicht findest, wird gebaut.

Spec: <SPEC>
Grundlage (alles, woraus die Spec abgeleitet sein muss): <GRUNDLAGE>/

Frage: Setzt die Spec ihre Grundlage richtig und vollständig um, und verlangt sie nichts, was die
Grundlage nicht trägt?

Lies die Grundlage vollständig und dann die Spec vollständig. Prüfe jedes Akzeptanzkriterium
(REQ) gegen die Grundlage. Prüfe umgekehrt jede Aussage der Grundlage, die in den Umfang der
Spec fällt, auf Abdeckung durch ein REQ.

Melde jeden Befund mit einer dieser Kategorien:
- widerspruch: Das REQ sagt etwas anderes als die Grundlage (Bedingung, Wert, Verhalten).
- luecke: Die Grundlage verlangt etwas im Umfang der Spec, das kein REQ abdeckt.
- nicht_verlangt: Das REQ fordert etwas, das die Grundlage weder verlangt noch nahelegt, und die
  Spec begründet es nicht als Entscheidung.
- offene_auslegung: Die Grundlage lässt mehrere Lesarten zu, und die Spec legt sich auf eine fest,
  ohne das als Entscheidung auszuweisen.

Schwere:
- blocker: Würde so gebaut etwas anderes ergeben, als die Grundlage verlangt, oder etwas
  Verlangtes fehlt, oder es würde etwas gebaut, das die Grundlage nicht trägt und die Spec nicht
  als Entscheidung begründet.
- hinweis: Alles andere.

Jeder Befund braucht ein wörtliches Zitat aus der Grundlage mit Datei und, wo möglich, Zeile. Bei
nicht_verlangt zitierst du die Grundlagenstelle, die den Umfang festlegt, über den das REQ
hinausgeht. Ohne Zitat kein blocker. Entscheidungen, die die Spec selbst ausdrücklich als vom Menschen getroffen
oder abgenommen ausweist, sind keine Befunde, solange sie der Grundlage nicht widersprechen.
Stil, Formulierung und Testbarkeit sind nicht Gegenstand.

Antworte ausschließlich mit JSON:
{"findings":[{"req":"REQ-… oder Abschnitt","kategorie":"widerspruch|luecke|nicht_verlangt|offene_auslegung","schwere":"blocker|hinweis","beleg":"Datei:Zeile — Zitat","begruendung":"…"}]}
Keine Befunde: {"findings":[]}
```

## Anhang B: Mutantenliste mit Einordnung (eingefroren nach Abnahme)

- **Material:** Die Erstfassungen liegen bei `TMogdans/carrera-planer`. Die Grundlage stammt
  jeweils aus dem Stand des Spec-Commits. Bei M1 hat dieser Commit `KONZEPT.md` und
  `docs/recherche.md` mitgeändert, mit den Abschnitten „Kreuzung (Acht)“ und „Raster“.
- **Auswahl:** `auswahl.py`, deterministisch. Formuliert hat Sonnet, ein Lauf je Spec.
- **gerade-100 O4 entfällt:** Der einzige Kandidat hat kein Fehlerverhalten. Damit bleiben
  29 Mutanten.

| Spec | Op | REQ | Mutation | Einordnung | Beleg |
|---|---|---|---|---|---|
| m1 | O1 | CORE-25 | zusätzlicher Fehler „ungültiger Verweis“, wenn zwischen verwiesener Kreuzung und Querung eine weitere Kreuzung liegt | **W** | KONZEPT:39–41 „auf eine frühere Kreuzung verweist … Fehler sind: Verweis auf keine Kreuzung, zweite Querung derselben Kreuzung, ungenaue Ankunft“ |
| m1 | O2 | CORE-30 | Acht mit 2 × Gerade 114 statt Gerade 114 + Anschlussstück | M | Grundlage schreibt das Acht-Beispiel nicht vor; Bestand (recherche:57–69) hat nur 1 × Gerade 114, der Bezug „aus dem Bestand“ steht nur in der Spec |
| m1 | O3 | CORE-8 gestrichen | Invarianz der Spur unter Verschiebung/Drehung | M | KONZEPT:98 „verschoben oder gedreht bleibt geschlossen“ bleibt durch CORE-12/Acht („aus beliebiger Startpose“) teilweise abgedeckt |
| m1 | O4 | SCHEMA-3 | unbekannte Zusatzfelder werden still verworfen statt abgewiesen | **W** | KONZEPT:85 „alte Layouts scheitern laut statt still“; constitution:19 |
| m1 | O5 | CORE-32 neu | Kern liefert Gesamtdrehung als Stufenzahl | **W** | nicht verlangt |
| m2 | O1 | EDIT-9 | Querung anhängbar bei exakter Position, Richtung egal | **W** | M1 REQ-CORE-24 „exakt — Position und Richtung“; KONZEPT:40 |
| m2 | O2 | STAT-2 | Lücke in cm statt mm | **W** | KONZEPT:58 „Versatz in mm und Winkel“ |
| m2 | O3 | EDIT-19 gestrichen | Zeichengeometrie (y-Spiegelung, Mittellinie, Band) | M | KONZEPT:88 „Darstellung in SVG“; Zeichnen bleibt über REQ-UI-3 verlangt, die Lücke liegt im Detail |
| m2 | O4 | STORE-6 | Layout mit Kern-Fehlern wird beim Laden abgelehnt statt geladen | M | KONZEPT:131 „Fehler sind dort sichtbar“, M1 REQ-CORE-19 Fehler als Rückgabewerte; Laden fehlerhafter Layouts nicht ausdrücklich verlangt |
| m2 | O5 | EDIT-21 neu | Verlauf liefert deutsche Kurzbeschreibungen | **W** | nicht verlangt |
| m3a | O1 | BEST-5 | kaputter Bestand nur bei Schemafehler, „kein JSON“ fällt heraus | M | nur per Analogie zu M2 REQ-STORE-5; KONZEPT:85 allgemein |
| m3a | O2 | BEST-1 | `schemaVersion` 2 statt 1 | M | Version des Bestandsschemas steht nicht in der Grundlage (Analogie M2) |
| m3a | O3 | BEST-4 gestrichen | Roundtrip-Eigenschaft Sichern/Laden | M | Speichern bleibt verlangt (übrige BEST-REQs); Roundtrip nur per Analogie M2 REQ-STORE-4 |
| m3a | O4 | BUI-5 | Meldungen verschwinden von selbst statt bis zum Schließen zu bleiben | **W** | M2-Spec:382–385 „bleiben stehen, bis der Mensch sie schließt“ |
| m3a | O5 | BARCH-5 neu | keine neue Laufzeitabhängigkeit, `dependencies` unverändert | **W** | nicht verlangt |
| m3b | O1 | SYNC-5 | bei 409 und gleichem Inhalt kein Hinweis, Basis still auf Version m | M | KONZEPT:100–101 verbietet stilles Überschreiben; bei gleichem Inhalt wird nichts überschrieben |
| m3b | O2 | API-13 | Größengrenze 256 KiB statt 1 MiB | M | Grenze steht nicht in der Grundlage |
| m3b | O3 | SYNC-1 gestrichen | Dialog zeigt die Server-Layouts | M | KONZEPT:119 „Layouts geräteübergreifend“; Laden eines Server-Layouts bleibt verlangt, nur die Liste fehlt |
| m3b | O4 | SYNC-8 | Bestand-Konflikt (409) wird ohne Meldung übernommen | **W** | KONZEPT:100–101 „bekommt einen Hinweis statt still überschrieben zu werden“ |
| m3b | O5 | SRV-7 neu | Zugriffslog je `/api`-Anfrage auf stdout | **W** | nicht verlangt |
| gerade-100 | O1 | EINK-3 | Vorlagen-Hinweis nur für Vorlagen ohne Teile mit eigener Artikelnummer | M | Issue #34 fragt offen „wie zeigt die Einkaufsliste das?“ |
| gerade-100 | O2 | CAT-5 | Querweg „kürzer als“ statt „höchstens so lang wie“ der Längsweg | **W** | M1 REQ-CAT-5 (m1-Spec:286–289) „höchstens so lang wie der Längsweg“ |
| gerade-100 | O3 | G100-9 gestrichen | Mutations-Ratchet für `src/catalog`/`src/web/editor` | M | constitution:26 gilt ohnehin global; Lücke in der Spec ändert das Gebaute nicht zwingend |
| gerade-100 | O5 | G100-11 neu | Sammelhinweis „nur gemeinsam in Packung 20061658“ über der Einkaufsliste | **W** | nicht verlangt |
| plan | O1 | LBL-1 | Kurzform nur für Geraden, nicht für Kurven | M | Issue #35 fragt offen „Kurzform: vollen Namen oder Kürzel?“ |
| plan | O2 | LBL-2 | Platzregel `<` statt `≤` | M | Issue #35 fragt offen „ab welcher Zoomstufe“ |
| plan | O3 | LBL-4 gestrichen | keine Beschriftung für Querung, nicht gezeichnete Elemente, Baugruppen | **W** | Issue #35:15 „Baugruppen ohne Maße … haben also auch keine Beschriftung“ |
| plan | O4 | LBL-5 | ungültiger Schalterwert fällt still auf „an“ zurück | **W** | Issue #35:7 „wie der Modus-Schalter“; M3a REQ-MODUS-1 „bei ungültigem Wert eine Meldung“ |
| plan | O5 | LBL-11 neu | Logik liefert Anzahl je Beschriftungsvariante | **W** | nicht verlangt |

Summe: **15 W**, **14 M**. 80 % von 15 sind **12** getötete W-Mutanten.

**Einordnungsregel:** Im Zweifel M. Eine Analogie zu einer früheren Spec oder eine offene Frage im
Issue ergibt M. W gibt es nur bei einer zitierbaren Stelle, der die Mutation direkt widerspricht,
oder bei O5, wenn die Grundlage das Hinzugefügte nicht trägt.
