# verify-unskip: Inhalte vollständig und nur aus regulären Dateien lesen — Design

> devloop, Issues #19 und #20. Nach #12 kommen alle geänderten Testpfade an; geprüft wird aber
> der Inhalt, den `git show` liefert. Zwei Wege lassen einen aktiven Test trotzdem durch.
> Status: **abgenommen** (2026-11-25); Nachtrag nach Critic-Runde 1 (REQ-UNSKIPCONTENT-7, Grenzen) abgenommen 2026-11-25.

## Ist-Zustand (main, 86c0be9)

`src/cli/verify-unskip.ts`: `gitSafe(["show", `${ref}:${file}`])` für Basis und HEAD.
`gitSafe` ruft `execFileSync` **ohne `maxBuffer`** (Node-Default 1 MiB) und liefert bei **jedem**
Fehler `""`. `""` bedeutet für die Bewertung „Datei existiert in diesem Ref nicht".

1. **#19 – Größe.** Eine neue Testdatei > 1 MiB: `git show` scheitert (ENOBUFS), Inhalt `""`,
   `isAllowedTestEdit("", "")` → erlaubt. Gemessen: aktiver `test("evil")` + 1,2 MB Kommentar →
   `ok: true`, vitest führt den Test aus. Ist ein verwalteter Test schon auf der Basis > 1 MiB,
   geht jede Änderung an ihm durch.
2. **#20 – Symlink.** Neue Datei `test/c.test.ts` als Symlink auf `test/helper.ts` (aktiver Test).
   `git show` liefert den Zielpfad `helper.ts` als Text, darin kein aktiver Test → `ok: true`.
   vitest folgt dem Link und führt den Test aus. (Eine *bestehende* Testdatei durch einen Symlink
   zu ersetzen, fällt schon heute auf.)
3. **Gleiche Klasse bei der Config:** `managed-tests.json` wird per `gitSafe` aus der Basis gelesen;
   scheitert das Lesen aus einem anderen Grund als „fehlt", fällt der Code auf den Arbeitsbaum
   (PR-HEAD) zurück — der PR bestimmte dann seinen Scope selbst.

## Begriffe

- **Eintrag eines Pfads in einem Ref:** Typ und Modus des Pfads im Baum dieses Refs, wie Git ihn
  führt: fehlt / reguläre Datei (Modus `100644` oder `100755`) / Symlink (`120000`) /
  Submodul (`160000`) / Verzeichnis.
- **Lesefehler:** jeder Fehlschlag beim Ermitteln von Eintrag oder Inhalt, der nicht „Pfad fehlt
  in diesem Ref" ist.

## Anforderungen (EARS)

- **REQ-UNSKIPCONTENT-1** *(ubiquitous)* — `verify-unskip` soll für jeden geprüften Testpfad den
  Inhalt in Basis und HEAD vollständig lesen, unabhängig von der Dateigröße (mindestens bis
  64 MiB je Datei).
- **REQ-UNSKIPCONTENT-2** *(ubiquitous)* — `verify-unskip` soll „Pfad fehlt in diesem Ref" (Inhalt
  leer: neue bzw. gelöschte Datei) von einem Lesefehler unterscheiden.
- **REQ-UNSKIPCONTENT-3** *(unwanted)* — Wenn beim Lesen eines geprüften Testpfads ein Lesefehler
  auftritt, soll `verify-unskip` mit Exit 1 fehlschlagen und Pfad und Ref nennen.
- **REQ-UNSKIPCONTENT-4** *(unwanted)* — Wenn ein geprüfter (verwalteter) Testpfad in Basis oder
  HEAD vorhanden, aber keine reguläre Datei ist (Symlink, Submodul, anderer Typ), soll
  `verify-unskip` ihn als Verstoß werten, mit einer Meldung, die den Typ nennt.
- **REQ-UNSKIPCONTENT-5** *(unwanted)* — Wenn `managed-tests.json` in der Basis vorhanden ist, aber
  nicht gelesen werden kann (Lesefehler oder keine reguläre Datei), soll `verify-unskip` mit
  Exit 1 fehlschlagen, statt auf den Arbeitsbaum zurückzufallen. Fehlt sie in der Basis, bleibt
  das bisherige Verhalten (Arbeitsbaum, sonst Default „alle Testdateien").
- **REQ-UNSKIPCONTENT-6** *(ubiquitous)* — Alles andere bleibt unverändert: Pfadermittlung aus #12,
  No-op auf `devloop/spec/*`, Scope, Bewertung per `isAllowedTestEdit`, Ausgabeformat (Felder
  dürfen ergänzt werden). Unverwaltete Testpfade werden nicht gelesen und nicht bewertet.
- **REQ-UNSKIPCONTENT-7** *(unwanted)* — Wenn ein vom Diff gemeldeter, geprüfter Testpfad weder in
  der Basis noch im HEAD gefunden wird, soll `verify-unskip` das als Lesefehler werten (Exit 1,
  Pfad genannt). Ein Pfad, den der Diff als geändert meldet, existiert in mindestens einem der
  beiden Stände; „fehlt in beiden" heißt, das Lesen hat den Pfad verfehlt.
  (Anlass Critic-Runde 1, B1: `ls-tree` las `:(top)evil.test.ts` als Pathspec-Magic, der Pfad galt
  in beiden Refs als fehlend, ein aktiver Test ging durch — Regression gegenüber main. B2:
  Nicht-UTF-8-Dateinamen, gleiches Muster, bestand schon vorher.)

## Detektoren (Wirkung) und Mutationsproben

CLI-Tests gegen `dist/cli/verify-unskip.js` in echten temporären Git-Repos:

| Fall | Erwartung | tötet Mutation |
|---|---|---|
| neue Testdatei 1,2 MB mit aktivem Test | Exit 1, Datei in `violations` | `maxBuffer` entfernt |
| neue Testdatei 1,2 MB, alle Tests geskippt | Exit 0, Datei in `checked` | Größe pauschal als Verstoß |
| Basis-Test 1,2 MB geskippt; PR ändert eine Assertion | Exit 1 | `maxBuffer` entfernt |
| Basis-Test 1,2 MB geskippt; PR entfernt nur `.skip` | Exit 0 | dto. (Gegenprobe) |
| neue `test/c.test.ts` als Symlink auf Datei mit aktivem Test | Exit 1, Meldung nennt Symlink | Typprüfung entfernt |
| neue `test/c.test.ts` als Symlink auf Datei **ohne** aktiven Test | Exit 1 (Typ allein genügt) | Typprüfung nur bei aktivem Ziel |
| bestehende Testdatei durch Symlink ersetzt | Exit 1 (wie bisher) | — |
| verwalteter Testpfad als Submodul (gitlink) im HEAD | Exit 1 | Typprüfung nur für Symlinks |
| Lesefehler simuliert (Objekt des Blobs fehlt im Repo, z. B. per gelöschter loose-object-Datei) | Exit 1, nennt Pfad | Fehler wieder als `""` |
| Basis-`managed-tests.json` als Symlink bzw. unlesbar, Arbeitsbaum mit engem Scope | Exit 1 | Rückfall auf den Arbeitsbaum |
| Basis ohne `managed-tests.json`, Arbeitsbaum mit Scope | wie bisher (Quelle `worktree`) | — |
| unverwalteter Symlink-Test (außerhalb des Scopes) | Exit 0, in `unmanaged` | Scope ignoriert |
| Spec-Branch mit allen obigen Konstruktionen | Exit 0 (No-op) | — |
| neue `:(top)evil.test.ts` bzw. `:/evil.test.ts` mit aktivem Test (Default-Scope) | Exit 1 | Pfad als Pathspec statt literal lesen |
| Diff meldet Pfad, Leser findet ihn in keinem Ref (z. B. Nicht-UTF-8-Name oder Leser-Mutation) | Exit 1 | „fehlt in beiden" als erlaubt |
| ausführbare Testdatei (Modus `100755`), nur `.skip` entfernt | Exit 0 | `100755` nicht als reguläre Datei |

## Bekannte Grenzen

- **Inhalte über 64 MiB** je Datei: Lesefehler → Exit 1 (fail-closed, kein stilles Grün).
- **Import-Alias / andere Schreibweisen** umgehen `hasActiveTest` weiterhin (#21).
- **Ein Symlink außerhalb der Test-Endung** (`helper.ts`), auf den ein *unveränderter* Test
  verweist, wird nicht geprüft — das ist kein Testpfad. Der Weg über einen neuen Symlink-Test ist
  durch REQ-4 geschlossen.
- Glob-Matching für den Scope hängt weiter an #15 (`s`-Flag).
- **Datei in PR und Basis gelöscht:** Löscht der PR eine Testdatei, die auch die (weitergelaufene)
  Basis inzwischen gelöscht hat, fehlt sie in beiden Refs → nach REQ-7 rot. Selten; fail-closed.
- **Replace-Refs auf dem Runner** (`refs/replace/*`) verfälschen gelesene Inhalte; das müsste ein
  Mensch im CI setzen, `actions/checkout` holt sie nicht (Critic-Runde 1, B4).
- **Laufzeit etwa verdoppelt** gegenüber v0.10.1 (vier statt zwei Git-Prozesse je geprüfter
  Datei). Gemessen auf macOS: 100 Testdateien typisch 4,8 s (vorher 2,5 s), 1000 Dateien Maximum
  43,6 s (vorher 17,1 s). Kein Fehlalarm; ein Batch-Leser (`cat-file --batch`) wäre ein eigener
  Schritt (Critic-Runde 1, B6).
- **Meldung über 64 MiB** nennt nur `ENOBUFS`, nicht die Grenze (B5).
