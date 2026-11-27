# req-delta wertet nur REQ-Definitionen aus — Design

> devloop, Issue #30. `req-delta` ordnet jeder Zeile, die irgendwo eine REQ-ID enthält, diese ID
> zu, und die letzte Zeile gewinnt. Nennungen im Fließtext gelten damit als Änderung, und
> Fortsetzungszeilen eines Kriteriums zählen nicht mit. Status: **abgenommen** (2026-11-27).

## Ist-Zustand (main, 0561491)

- `src/core/req-delta.ts`: `REQ_LINE = /\b(REQ-[A-Z0-9]+-\d+)\b\s*[:\-—]?\s*(.*)$/`, pro Zeile;
  die Map behält die **letzte** Zeile je ID. Text = Rest der Zeile nach der ID.
- Nutzer: `spec-to-tests` und `spec-to-twin` (`dist/cli/req-delta.js <alt> <neu>` →
  `{added, changed, removed}`), um genau die betroffenen REQs neu abzuleiten.

Gemessene Fehler:

1. **Falsch positiv (Issue):** Der reine Nachtrag aus #13 (Grenze F3 nennt REQ-CFGBASE-4) liefert
   `changed: ["REQ-CFGBASE-4"]`.
2. **Falsch negativ:** Ein mehrzeiliges Kriterium (Fortsetzungszeilen eingerückt, Normalform in
   devloop) ändert nur seine zweite Zeile → kein Delta, die Tests werden nicht neu abgeleitet.
3. **Fortsetzungszeile mit Nennung:** `  REQ-SPECGATE-5 gilt für den Inhalt …` (Fortsetzung eines
   anderen Kriteriums) überschreibt den Text von REQ-SPECGATE-5.

Formen in echten Specs (16 bsk-Specs, devloop-Designs):

| Form | Beispiel | Vorkommen |
|---|---|---|
| fett, Liste | `- **REQ-X-1** *(When)* — …`, `- **REQ-X-1 [When]:** …` | 14 bsk-Specs, alle devloop-Specs |
| fett, Absatz | `**REQ-X-1** *(Contract)*` + Text in den Folgezeilen | 1 bsk-Spec |
| schlicht, Liste | `- REQ-X-1 [When]: …` | 2 bsk-Specs (dort ohne fette Form) |
| Nennung, Listenpunkt | `- REQ-X-12 macht die Tool-Grenze laut …` | 3 bsk-Specs, alle mit fetter Form; einmal **vor** der Definition |
| Nennung, Code | `` `REQ-FORUM-5-topic-….json` ``, `- **`REQ-X-11` (e)** …` | mehrere |

## Entscheidung

`req-delta` erkennt REQ-**Definitionen** an ihrer Form, nicht an der bloßen Nennung, und nimmt die
Fortsetzungszeilen zum Text dazu. Die fette Form hat Vorrang: Enthält eine Spec mindestens eine
fette Definition, gelten schlichte Zeilen als Nennungen. Damit funktionieren beide Stile, und die
Nennungen in gemischten Specs fallen heraus. Abschnitte „Bekannte Grenzen“ und „Folge-Issues“
enthalten nie Definitionen (wie `spec-amend-class`).

## Begriffe

- **ID-Beginn:** Die Zeile beginnt (nach optionalem `- ` oder `* `) mit der REQ-ID, auf die weder
  `-` noch ein Buchstabe oder eine Ziffer folgt.
- **Fette Definition:** Zeile ohne Einrückung, nach optionalem `- `/`* ` steht `**` und direkt
  danach die REQ-ID (ID-Beginn innerhalb der Fettung).
- **Schlichte Definition:** Zeile ohne Einrückung mit ID-Beginn ohne `**`, oder eine Überschrift
  `#{1,6} REQ-…`.
- **Nachtrags-Abschnitt:** wie in REQ-NACHTRAG (#27): Überschrift beginnt mit „Bekannte Grenzen“
  oder „Folge-Issues“, Unterabschnitte erben.
- **Definitionsblock:** die Definitionszeile und alle folgenden Zeilen bis vor die nächste
  Überschrift, Definitionszeile, einen nicht eingerückten Listenpunkt oder eine Leerzeile, auf die
  als nächste nicht leere Zeile eine **nicht eingerückte** Zeile folgt. Leerzeilen mit eingerückter
  Fortsetzung danach (weitere Absätze eines Listenpunkts, z. B. „Nachschärfung …“) gehören zum
  Block.
- **Kriteriumstext:** der Definitionsblock ab nach der ID (ohne optionales `:`/`-`/`—` direkt nach
  der ID), Whitespace normalisiert.

## Anforderungen (EARS)

- **REQ-REQDEF-1** *(ubiquitous)* — `req-delta` soll als Definitionen nur Zeilen außerhalb von
  Nachtrags-Abschnitten werten: die fetten Definitionen, wenn die Spec mindestens eine enthält,
  sonst die schlichten.
- **REQ-REQDEF-2** *(ubiquitous)* — Der Text eines Kriteriums soll sein gesamter Definitionsblock
  sein. Ändert sich eine Fortsetzungszeile, soll die ID unter `changed` stehen.
- **REQ-REQDEF-3** *(unwanted)* — Wenn eine REQ-ID nur außerhalb einer Definition genannt wird
  (Fließtext, Fortsetzungszeile, Code, Nachtrags-Abschnitt, schlichte Zeile in einer Spec mit fetter
  Form), soll das weder `added`, `changed` noch `removed` erzeugen.
- **REQ-REQDEF-4** *(unwanted)* — Wenn dieselbe ID mehrfach definiert ist, soll die erste
  Definition gelten.
- **REQ-REQDEF-5** *(ubiquitous)* — Aufruf, Exit-Codes und Ausgabeformat von `req-delta` sollen
  unverändert bleiben (`{added, changed, removed}`, fehlende alte Datei = leere Spec).
- **REQ-REQDEF-6** *(ubiquitous)* — `agents/devloop-spec-to-tests.md`, `agents/devloop-spec-to-twin.md`
  und `USAGE.md` sollen nennen, welche Zeilen als Definition zählen.

## Umsetzung (Skizze, nicht bindend)

- Die Erkennung der Nachtrags-Abschnitte aus `spec-amend.ts` teilen, nicht kopieren.
- Versionssprung **v0.16.0**.

## Detektoren (Wirkung) und Mutationsproben

Unit-Tests gegen `reqDelta`, ein CLI-Test gegen `dist/`, ein Test auf echten Spec-Ständen.

| Fall | Erwartung | tötet Mutation |
|---|---|---|
| #13-Nachtrag: `config-aus-basis-alt.md` → `-neu.md` (Fixture aus #27) | leeres Delta | Nachtrags-Abschnitt nicht ausgenommen |
| Fortsetzungszeile eines fetten Kriteriums geändert | `changed` enthält die ID | nur erste Zeile gewertet |
| Absatzform `**REQ-X-1** *(Contract)*`, Text in der Folgezeile geändert | `changed` | dto. |
| Fortsetzungszeile eines Kriteriums nennt REQ-X-5 (anderer Text), REQ-X-5 selbst unverändert | REQ-X-5 nicht in `changed` | jede Zeile mit ID gewertet |
| fetter Listenpunkt mit zweitem, eingerücktem Absatz nach Leerzeile; nur der zweite Absatz ändert sich | `changed` enthält die ID | Block endet an jeder Leerzeile |
| dto., dritter Absatz nach zwei Leerzeilen | `changed` | dto. |
| Absatzform: Leerzeile, dann nicht eingerückter Fließtext ändert sich | leeres Delta | Block endet nie an Leerzeile |
| Listenpunkt, Leerzeile, nicht eingerückter Absatz (kein Listenpunkt) ändert sich | leeres Delta | dto. |
| Kriterium direkt gefolgt von einer Überschrift, Text unter der Überschrift ändert sich | leeres Delta | Block endet nicht an Überschrift |
| Spec mit fetter Form, Listenpunkt `- REQ-X-12 macht …` **vor** der Definition, nur der Listenpunkt ändert sich | leeres Delta | schlichte Form trotz fetter Form gewertet; letzte statt erste Definition |
| Spec nur in schlichter Form (`- REQ-X-1 [When]: …`), Text geändert / REQ entfernt / REQ neu | `changed` / `removed` / `added` | schlichte Form nie gewertet |
| `` `REQ-X-5-irgendwas.json` `` und `- **`REQ-X-11` (e)**` | keine Definition | ID-Beginn ohne Endprüfung; Backtick zugelassen |
| REQ in „Bekannte Grenzen“ neu als fette Zeile | kein `added` | Nachtrags-Abschnitt nicht ausgenommen |
| dieselbe ID zweimal fett definiert, nur die zweite ändert sich | leeres Delta | letzte statt erste Definition |
| bestehende Tests in `test/core/req-delta.test.ts` | unverändert grün | — (REQ-REQDEF-5) |
| CLI: fehlende alte Datei, neue Spec mit zwei fetten REQs | `added` beide, Exit 0 | — (REQ-REQDEF-5) |

Mutationen werden im Implementierungs-PR gefahren und mit Ergebnis in der PR-Beschreibung
dokumentiert.

## Bekannte Grenzen (dokumentiert, keine eigene Runde)

- **Eingerückter Codeblock nach Absatzform:** Ein mit vier Leerzeichen eingerückter Codeblock nach
  einer Leerzeile hinter einem fetten Absatz-Kriterium (ohne Listenpunkt) zählt zum Block.
- **Heuristik nach Form:** Eine Nennung in fetter Form am Zeilenanfang (`**REQ-X-1** wird …`) außerhalb
  der Nachtrags-Abschnitte gilt als Definition. Mit REQ-REQDEF-4 überschreibt sie keine frühere
  Definition, kann aber eine fehlende vortäuschen.
- **`spec-amend-class`** erkennt REQ-Definitionen weiter nur in der kanonischen Form
  `- **REQ-…**` (Grenze aus #27). Den Abgleich beider Erkennungen macht #30 nicht; Folge-Issue #36.
- **Folgeabsätze ohne Vertragsänderung:** Eingerückte Absätze unter einem Kriterium
  (Implementierungshinweise, „Quelle: …“, Detektor-Nachzug) gehören zum Block. Ändern sie sich, steht
  die ID unter `changed`, auch wenn der Vertrag gleich bleibt; spec-to-tests leitet dann unnötig neu
  ab (fail-safe). Gemessen in bsk 633 (FORUM-93/94).
- **Änderung über Verweis:** Verweist ein Kriterium auf ein anderes („wie REQ-X-1“), bleibt sein
  Text gleich, wenn sich das andere ändert; `req-delta` meldet nur das andere (bsk 776 SLAUTHOR-21).
- **Trenner hinter der Fettung:** Bei `**REQ-X-1**: Text` steht der Doppelpunkt nicht direkt nach
  der ID und wird nicht abgeschnitten. Wirkung nur, wenn sich allein der Trenner ändert.
