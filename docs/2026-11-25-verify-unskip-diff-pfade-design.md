# verify-unskip: jeder geänderte Testpfad kommt an — Design

> devloop, Issue #12. Die Unskip-Naht (`verify-unskip`, §11 #3) prüft nur die Testdateien, die
> `git diff --name-only` liefert. Drei Eigenschaften dieses Aufrufs lassen Änderungen an
> verwalteten Tests ungeprüft durch. Gleiches Muster wie REQ-SPECGATE-9 (#4) für die Action.
> Status: **Entwurf** (2026-11-25), wartet auf Abnahme.

## Ist-Zustand (main, 33f31a1)

`src/cli/verify-unskip.ts:67`: `gitSafe(["diff", "--name-only", `${base}...HEAD`])`, danach Split
an `\n` und Filter `TEST_FILE = /\.(test|spec)\.[jt]sx?$/`. `gitSafe` liefert bei jedem
Git-Fehler `""`.

Gemessen (temporäres Repo, Basis `main`, PR-Branch `devloop/x`, keine `managed-tests.json`):

1. **Quoting.** `größe.test.ts` wird von `test.skip(... toBe(1))` auf aktives `test(... toBe(2))`
   geändert. Git liefert `"gr\303\266\303\237e.test.ts"` mit Anführungszeichen; der Regex matcht
   wegen des schließenden `"` nicht. Ergebnis `ok: true`, `checked: []`.
2. **Rename-Erkennung.** `git mv b.test.ts b.ts.bak`: Der Diff nennt nur `b.ts.bak`, kein
   Testpfad. Die Löschung des Tests wird nie geprüft. Ergebnis `ok: true`. Ein Rename
   `a.test.ts → c.test.ts` mit geänderten (weiter geskippten) Assertions wird als *neue* Datei
   bewertet: alle Tests geskippt → erlaubt.
3. **Fail-open bei Git-Fehler.** Basis `origin/gibtsnicht` (nicht auflösbar): `git diff` scheitert,
   `gitSafe` liefert `""`, keine Testdateien → `ok: true`. In der Action wird die Basis mit
   `git fetch … || true` geholt; scheitert der Fetch, wird die Naht still grün.

## Anforderungen (EARS)

- **REQ-UNSKIPDIFF-1** *(ubiquitous)* — `verify-unskip` soll die geänderten Pfade ohne
  Rename-Erkennung ermitteln: Bei einem Rename erscheinen alter **und** neuer Pfad. Der alte Pfad
  wird als gelöschte Datei bewertet (neuer Inhalt leer → keine reine `.skip`-Entfernung → Verstoß),
  der neue wie bisher.
- **REQ-UNSKIPDIFF-2** *(ubiquitous)* — `verify-unskip` soll die geänderten Pfade ungequotet
  ermitteln (NUL-getrennt). Ein verwalteter Testpfad mit Nicht-ASCII- oder Sonderzeichen soll
  genauso geprüft werden wie jeder andere.
- **REQ-UNSKIPDIFF-3** *(unwanted)* — Wenn die Ermittlung der geänderten Pfade scheitert (z. B.
  Basis nicht auflösbar), soll `verify-unskip` mit Exit 1 und einer Meldung fehlschlagen, statt
  „keine Testdateien" anzunehmen.
- **REQ-UNSKIPDIFF-4** *(ubiquitous)* — Alles andere bleibt: No-op auf `devloop/spec/*`,
  Scope über `managed-tests.json` (aus der Basis), Bewertung per `isAllowedTestEdit`, Format der
  Ausgabe (Felder dürfen ergänzt werden).

## Detektoren (Wirkung) und Mutationsproben

CLI-Tests gegen `dist/cli/verify-unskip.js` in einem echten temporären Git-Repo, `core.quotePath`
im Test-Repo ausdrücklich `true` (damit das Quoting auf jeder Maschine greift):

| Fall | Erwartung | tötet Mutation |
|---|---|---|
| Umlaut-Testdatei: Assertion geändert | Exit 1, Datei in `violations` | `-z`/NUL-Split entfernt |
| Gegenprobe: Umlaut-Testdatei, nur `.skip` entfernt | Exit 0, Datei in `checked` | Umlaut-Pfade pauschal als Verstoß |
| `git mv b.test.ts b.ts.bak` | Exit 1, `b.test.ts` in `violations` | `--no-renames` entfernt |
| `git mv a.test.ts c.test.ts`, Assertion geändert, weiter geskippt | Exit 1 | dto. |
| Testdatei gelöscht (ohne Rename) | Exit 1 (wie bisher) | — |
| Basis nicht auflösbar | Exit 1, Meldung nennt die Basis | Diff-Fehler wieder als `""` |
| Spec-Branch mit allen obigen Änderungen | Exit 0 (No-op wie bisher) | — |
| Unverwalteter Umlaut-Test (managed-tests ohne ihn) | Exit 0, Datei in `unmanaged` | Scope ignoriert |

## Bekannte Grenzen

- **Ein reiner Rename eines verwalteten Tests** (Inhalt unverändert) wird nach REQ-1 zum Verstoß
  (alter Pfad gelöscht). Für `implement` ist das gewollt: Es soll Tests nicht verschieben. Auf
  Spec-Branches greift die Naht nicht.
- **Zeilenenden im Pfad** und Glob-Matching für `managed-tests.json`: hängt an #15 (`s`-Flag).
- **Der Name `TEST_FILE`-Regex** bestimmt weiter, was eine Testdatei ist. Eine verwaltete Datei,
  die zu einem Nicht-Testnamen umbenannt wird, fällt über den **alten** Pfad auf (REQ-1).
