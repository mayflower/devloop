# Globs passen auch auf Pfade mit Zeilenende — Design

> devloop, Issue #15. `globToRegExp` baut `new RegExp("^" + re + "$")` ohne `s`-Flag. `**` wird zu
> `.*`, und `.` passt in JavaScript nicht auf Zeilenenden. Ein Pfad mit Zeilenende in einem
> Verzeichnisnamen entgeht damit jedem `**`-Glob: Spec-, Config-, Protected-, Tier- und
> Managed-Tests-Globs sowie die CODEOWNERS-Deckung. Status: **abgenommen** (2026-11-27).

## Ist-Zustand (main, 7510268)

- `src/core/glob.ts`: `**/` → `(?:.*/)?`, `**` → `.*`, `*` → `[^/]*`, `?` → `[^/]`. Nur die
  `.*`-Teile scheitern an Zeilenenden; `[^/]` passt schon heute auf `\n`.
- Die Diff-Pfade kommen aus `git diff --no-renames -z --name-only` (NUL-getrennt, ungequotet). Ein
  Zeilenende im Pfad erreicht die Glob-Prüfung also unverändert.
- Nutzer von `globToRegExp`/`matchesAnyGlob`: `spec-change.ts` (Spec-Gate), `config-change.ts`
  (Config-Gate, Erstaufnahme), `protected-set.ts` (Tamper-Check), `tier.ts` (Tier),
  `managed-tests.ts` (verify-unskip), `codeowners.ts` (CODEOWNERS-Deckung).

Gemessen (Kritiker #4, Runde 2): `specs/a<LF>b/spec.md` trifft `**/spec.md` nicht. Bei einer Basis
ohne CODEOWNERS liefert die Precondition-Action `{"ok":true,"pending":true}` statt `spec-unguarded`.
Ein Bot muss den Pfad absichtlich so wählen; die normale Kette erzeugt ihn nicht.

## Entscheidung

`s`-Flag (dotAll) in `globToRegExp`. Damit passt `**` auf jedes Zeichen, wie es die
Glob-Semantik verspricht. Eine zentrale Änderung, alle Nutzer erben sie.

## Begriffe

- **Zeilenende:** `\n` (LF), `\r` (CR), U+2028, U+2029.

## Anforderungen (EARS)

- **REQ-GLOBNL-1** *(ubiquitous)* — `globToRegExp` soll Zeilenenden wie jedes andere Zeichen
  behandeln: `**` und `**/` passen auf sie, `*` und `?` passen auf sie innerhalb eines
  Pfadsegments; `/` bleibt die einzige Grenze für `*` und `?`.
- **REQ-GLOBNL-2** *(unwanted)* — Wenn ein PR einen Spec-Pfad mit Zeilenende ändert, den die
  Basis-CODEOWNERS nicht deckt, soll `verify-review` mit `spec-unguarded` enden.
- **REQ-GLOBNL-3** *(unwanted)* — Wenn ein PR einen Pfad mit Zeilenende im Protected-Set ändert,
  soll `verify-review` den Tamper-Alarm auslösen.
- **REQ-GLOBNL-4** *(ubiquitous)* — `derive-tier` soll einem Pfad mit Zeilenende das Tier des
  passenden Globs geben, nicht den Default.
- **REQ-GLOBNL-5** *(ubiquitous)* — Für Pfade ohne Zeilenende soll sich kein Glob-Ergebnis ändern.

## Umsetzung (Skizze, nicht bindend)

- `new RegExp("^" + re + "$", "s")`.
- Versionssprung **v0.15.0** (Gates greifen auf Pfaden, die sie bisher übersahen).

## Detektoren (Wirkung) und Mutationsproben

| Fall | Erwartung | tötet Mutation |
|---|---|---|
| Glob-Unit: `**/spec.md` gegen `specs/a<X>b/spec.md` für X = LF, CR, U+2028, U+2029 | passt | Flag fehlt |
| Glob-Unit: `services/**` gegen `services/a<LF>b/x.ts`; `specs/*/spec.md` gegen `specs/a<LF>b/spec.md` | passt | Flag fehlt (erster Fall) |
| Glob-Unit: `specs/*/spec.md` gegen `specs/a/b<LF>/spec.md` | passt nicht (`*` überschreitet kein `/`) | `*` zu `.*` aufgeweicht |
| Glob-Unit: `*.md` gegen `a.md<LF>` und `a.md<LF>x` | passt / passt nicht (Anker am Ende) | `$` ohne Anker, `m`-Flag statt `s` |
| verify-review (temporäres Git-Repo, Basis ohne CODEOWNERS): Diff `specs/a<LF>b/spec.md` | `ok:false`, `spec-unguarded` (vorher `pending`) | Flag fehlt |
| verify-review: Diff `.github/workflows/a<LF>b.yml` (Protected-Set der Basis enthält `.github/**`) | Tamper-Alarm | Flag fehlt |
| derive-tier: tier-map `{T2:["services/**"], default:"T1"}`, Pfad `services/a<LF>b/x.ts` | T2 (vorher T1) | Flag fehlt |
| bestehende Glob-, Tier-, Gate-Tests | unverändert grün | — (REQ-GLOBNL-5) |

Mutationen werden im Implementierungs-PR gefahren und mit Ergebnis in der PR-Beschreibung
dokumentiert.

## Bekannte Grenzen (dokumentiert, keine eigene Runde)

- **Nach dem Update auf v0.15.0** greifen Spec-, Config-, CODEOWNERS- und Tamper-Gate auf Pfaden mit
  Zeilenende. Ein solcher Pfad kann auch ein niedrigeres Tier bekommen als bisher, wenn er vorher
  nur über den Default auf T3 kam und jetzt einen T1-Glob (z. B. `**`) trifft. Das ist das
  richtige Tier; der bisherige Wert war Zufall.
- **GitHubs CODEOWNERS-Matching** für Pfade mit Zeilenende ist nicht gemessen. devloop behandelt
  sie wie jedes andere Zeichen.
- **Testpfad, der auf ein Zeilenende endet** (`x.test.ts<LF>`): `TEST_FILE` in `verify-unskip`
  (`/\.(test|spec)\.[cm]?[jt]sx?$/`, kein Glob) erkennt ihn nicht als Testdatei. vitest sammelt
  solche Dateien mit dem Default-`include` nicht; mit eigenem `include` wie `**/*.test.*` laufen sie
  ungeprüft. Variante von #21, kein Glob-Gate (Kritiker #15, H1).
