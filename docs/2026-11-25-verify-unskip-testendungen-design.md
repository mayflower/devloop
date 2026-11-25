# verify-unskip: Testdatei = was vitest per Default einsammelt — Design

> devloop, Issue #23. Die Unskip-Naht erkennt Testdateien an einer festen Endung, die enger ist als
> das Default-Include von vitest. Dateien dazwischen führt vitest aus, die Naht prüft sie nicht.
> Status: **Entwurf** (2026-11-25), wartet auf Abnahme.

## Ist-Zustand (main, e565b3e — v0.10.2)

- `src/cli/verify-unskip.ts:37`: `TEST_FILE = /\.(test|spec)\.[jt]sx?$/` — einzige Stelle im Code,
  die eine Testdatei definiert.
- vitest 2.1.9 (Repo-Stand) Default-Include: `**/*.{test,spec}.?(c|m)[jt]s?(x)`.
- Lücke: `.mts`, `.cts`, `.mjs`, `.cjs` (und `.mtsx`/`.ctsx`/`.mjsx`/`.cjsx`). Gemessen (Critic zu
  #19/#20): neue `test/evil.test.mts` mit aktivem `test("evil")` → Naht `ok: true` auf main wie auf
  dem Stand von #24, vitest: `✓ test/evil.test.mts (1 test)`.

## Anforderungen (EARS)

- **REQ-TESTEXT-1** *(ubiquitous)* — `verify-unskip` soll jeden geänderten Pfad als Testdatei
  behandeln, dessen Dateiname auf `.test.` oder `.spec.` gefolgt von der Endung
  `?(c|m)[jt]s?(x)` endet — genau die Menge des vitest-Default-Includes. Regex-Form:
  `/\.(test|spec)\.[cm]?[jt]sx?$/`.
- **REQ-TESTEXT-2** *(ubiquitous)* — Pfade, die das vitest-Default-Include nicht trifft, bleiben
  keine Testdateien (z. B. `foo.mts`, `foo.test.json`, `foo.test.d.ts`,
  `foo.test-d.ts`). Alles andere an der Naht bleibt unverändert.

## Detektoren (Wirkung) und Mutationsproben

CLI-Tests gegen `dist/cli/verify-unskip.js` in echten temporären Git-Repos (Default-Scope):

| Fall | Erwartung | tötet Mutation |
|---|---|---|
| neue aktive `t/a.test.mts`, `t/b.test.cts`, `t/c.spec.mjs`, `t/d.test.cjs` (je eigener Lauf) | Exit 1, Datei in `violations` | alter Regex |
| neue aktive `t/e.test.mtsx` | Exit 1 | `x`-Suffix für c/m vergessen |
| bestehende `t/f.test.mts` geskippt, PR entfernt nur `.skip` | Exit 0, Datei in `checked` | — (Gegenprobe) |
| neue aktive `t/g.mts` (ohne `.test.`) | Exit 0, nicht in `checked` | Regex zu weit (`.test.` optional) |
| neue aktive `t/h.test.xts` bzw. `t/i.test.json` | Exit 0, nicht in `checked` | Regex zu weit (beliebiger Präfixbuchstabe / beliebige Endung) |
| Abgleich: jede Datei der obigen Liste mit `vitest list` (bzw. `vitest run`) im Test-Repo gegengeprüft — Naht-Menge == vitest-Menge | gleich | Abweichung Regex ↔ vitest |

Der letzte Detektor prüft die Wirkung (vitest sammelt genau diese Dateien ein), nicht nur die
Regex-Form. Ist `vitest list` im Test nicht praktikabel, wird der Abgleich einmalig gemessen und
im PR dokumentiert.

## Bekannte Grenzen

- **Eigenes `include` in der vitest-Config des Ziel-Repos** (oder ein anderer Runner, z. B. Jests
  `__tests__/**`) wird nicht gelesen. Robust wäre, die Testdateien über den Runner selbst zu
  sammeln — gehört zu #21.
- **Groß/Klein-Schreibung der Endung** (`.TEST.TS`): vitest-Globs sind auf Linux
  case-sensitiv, der Regex ebenso. Auf case-insensitiven Dateisystemen nicht betrachtet.
