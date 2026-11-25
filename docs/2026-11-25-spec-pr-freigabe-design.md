# Spec-Änderungen brauchen unabhängig vom Tier eine menschliche Freigabe — Design

> devloop, Issue #4. Der Driver behandelt den Spec-Review-Stopp als hart für jedes Tier; der
> CI-Anker (`verify-review`) tut das nicht. Ein Spec-PR mit Tier T0/T1 mergt ohne Review, sobald
> das Ziel-Repo die Spec-Pfade nicht in CODEOWNERS führt (Befund two-dice/bsk, 2026-11-03, v0.8.1).
> Status: **abgenommen** (2026-11-25); Nachtrag REQ-SPECGATE-5 (leeres Array ungültig) abgenommen 2026-11-25.

## Ist-Zustand (main, 7e4d301)

1. **T0/T1 endet vor jeder Spec-Betrachtung.** `src/cli/verify-review.ts:42-46` gibt bei T0/T1
   `ok: true` zurück. Branch und Spec-Pfade spielen keine Rolle.
2. **Auch ab T2 erzwingt `verify-review` keine Freigabe.** Fehlt jede Approval, liefert es
   `ok: true, pending: true` (`verify-review.ts:52-66`). Das ist Absicht: Ein Fail hinterließe
   einen veralteten FAILURE-Lauf, der den Merge auch nach späterem Approve blockiert (v0.2.4).
   Die eigentliche Merge-Sperre ist der **Required CODEOWNER Review** der Branch-Protection.
3. **Der Bot mergt Spec-PRs selbst.** `MERGE_SPEC_PR` (`skills/loop/SKILL.md:53`) lässt den
   Driver nach (driver-seitig geprüfter) Freigabe mergen. Serverseitig hält ihn nur, was
   Branch-Protection verlangt.
4. **Folge:** Ob ein Spec-PR ein Review braucht, hängt allein daran, ob das Ziel-Repo die
   Spec-Pfade in CODEOWNERS führt. Kein Wächter prüft das. `check-codeowners` prüft nur die
   T2/T3-Pfade der tier-map.
5. **Spec-Änderungen gibt es nicht nur auf Spec-Branches.** Ein Impl-PR (`devloop/<slug>`) kann
   die `spec.md` mitändern; die Kette selbst verbietet das nur per Prompt.
6. **`check-codeowners` liest CODEOWNERS aus dem PR-HEAD** (`actions/checkout` auf
   `pull_request.head.sha`). GitHub wertet für die Review-Pflicht aber die CODEOWNERS der
   **Basis** aus. Ein PR, der sich die Deckung selbst einträgt, besteht den Wächter, ohne dass
   GitHub für ihn ein Review verlangt.

## Korrektur am Vorschlag im Issue

Der Detektor im Issue („T0, `devloop/spec/x`, keine Reviews → `ok: false`") widerspricht Punkt 2:
Ein harter Fail ohne Approval bringt das v0.2.4-Problem zurück. Ihn nur für Spec-Branches
einzuführen, ändert daran nichts. Auch ein Ausschluss der Spec-Branches vom Auto-Merge hilft
nicht, weil der Bot Spec-PRs per `MERGE_SPEC_PR` ohnehin selbst mergt (Punkt 3).

Wirksam ist nur der Mechanismus, den GitHub serverseitig durchsetzt: **CODEOWNERS der Basis
müssen jeden geänderten Spec-Pfad decken.** Dann verlangt Branch-Protection das Review, und
`verify-review` stellt sicher, dass diese Bedingung bei jeder Spec-Änderung erfüllt ist —
fail-closed, statisch, ohne vom Review-Zeitpunkt abzuhängen (kein v0.2.4-Effekt).

## Begriffe

- **Spec-Glob:** Muster für Spec-Dateien. Default `["**/spec.md"]`; überschreibbar per
  `.devloop/spec-globs.json` (JSON-Array von Globs). Fehlt die Datei, gilt der Default; ist sie
  kaputt oder kein Array nicht-leerer Strings, gilt fail-closed: `verify-review` schlägt fehl.
- **Spec-Pfad:** ein Diff-Pfad, der auf einen Spec-Glob passt.
- **Spec-Änderung:** ein PR, dessen Head-Branch mit `devloop/spec/` beginnt, **oder** dessen
  Diff mindestens einen Spec-Pfad enthält.
- **Basis-CODEOWNERS:** die erste existierende Datei aus `CODEOWNERS`, `.github/CODEOWNERS`,
  `docs/CODEOWNERS` im Stand der Basis (`origin/<base>`), gelesen per `git show`, nicht aus dem
  Arbeitsbaum. Das ist die Reihenfolge, in der GitHub sucht.

## Anforderungen (EARS)

- **REQ-SPECGATE-1** *(event-driven)* — Wenn `verify-review` eine Spec-Änderung prüft, soll es
  sie unabhängig vom berechneten Tier behandeln: Die T0/T1-Freigabe ohne Approval
  (`verify-review.ts:42-46`) greift für sie nicht.
- **REQ-SPECGATE-2** *(unwanted)* — Wenn bei einer Spec-Änderung ein Spec-Pfad von keinem
  Eintrag der Basis-CODEOWNERS gedeckt ist, oder die Basis keine CODEOWNERS hat, soll
  `verify-review` mit `ok: false` und `reason` beginnend mit `spec-unguarded` fehlschlagen und
  die ungedeckten Pfade nennen.
- **REQ-SPECGATE-3** *(unwanted)* — Wenn eine Spec-Änderung auf einem Branch `devloop/spec/*`
  keinen einzigen Spec-Pfad enthält, soll `verify-review` mit `spec-unguarded` fehlschlagen und
  auf `.devloop/spec-globs.json` hinweisen. (Ein Spec-PR ohne erkennbare Spec-Datei lässt sich
  nicht an CODEOWNERS binden; fail-closed statt still durchwinken.)
- **REQ-SPECGATE-4** *(event-driven)* — Wenn eine Spec-Änderung REQ-SPECGATE-2/3 besteht, soll
  `verify-review` die Approval so bewerten wie ab T2: gültige menschliche Approval auf HEAD →
  `ok: true`; keine Approval → `ok: true, pending: true`; Approval vorhanden, aber nicht gültig
  (Bot, Autor, veraltet) → `ok: false`.
- **REQ-SPECGATE-5** *(unwanted)* — Wenn `.devloop/spec-globs.json` existiert, aber kein
  JSON-Array nicht-leerer Strings ist, soll `verify-review` mit `ok: false` fehlschlagen.
  Ein leeres Array `[]` gilt als ungültig (Nachtrag 2026-11-25): Es schaltete die
  Pfad-Erkennung ab, und ein Impl-PR, der die Spec mitändert, liefe wieder ohne Review.
  Die Config gilt unabhängig davon, ob der PR eine Spec-Änderung ist — ohne gültige Globs
  ist das nicht entscheidbar.
- **REQ-SPECGATE-6** *(ubiquitous)* — Ein PR, der keine Spec-Änderung ist, soll sich genau wie
  bisher verhalten (Gate-Tamper, Tier-Logik, Approval-Bewertung unverändert).
- **REQ-SPECGATE-7** *(ubiquitous)* — Die Basis-CODEOWNERS sollen aus dem Basis-Ref gelesen
  werden, nie aus dem PR-HEAD. Ein PR, der sich die Deckung für seine Spec-Pfade erst selbst in
  CODEOWNERS einträgt, soll REQ-SPECGATE-2 nicht bestehen.

## Umsetzung (Skizze, nicht bindend)

- Kern: `src/core/spec-change.ts` — `specGlobs(repo)`, `isSpecChange(headRef, diffPaths, globs)`,
  `readBaseCodeowners(repo, baseRef)`, `uncoveredSpecPaths(paths, ownedPatterns)` auf Basis von
  `parseCodeowners`/`codeownersCovers`.
- `verify-review` bekommt im stdin zusätzlich `headRef`, `baseRef`, `repo`. Fehlen `headRef` oder
  `baseRef`, wird nur noch der Pfad-Teil der Definition ausgewertet — außer es gibt Spec-Pfade,
  dann fail-closed (ohne `baseRef` keine Basis-CODEOWNERS).
- `action.yml` reicht `HEAD_REF`/`BASE` durch. Versionssprung **v0.10.0** (verschärft: bestehende
  Ziel-Repos ohne Spec-Deckung werden bei Spec-PRs rot).
- Doku: `USAGE.md` §1.5 und `skills/init/SKILL.md` — Spec-Deckung in CODEOWNERS ist jetzt Pflicht
  und wird erzwungen; `.devloop/spec-globs.json` beschreiben.

## Detektoren (Wirkung) und Mutationsproben

Alle als CLI-Tests gegen `dist/cli/verify-review.js` in einem temporären Git-Repo mit Basis-Branch
(echtes `git show`, keine Attrappe):

| Fall | Erwartung | tötet Mutation |
|---|---|---|
| T0, `devloop/spec/x`, Diff `specs/x/spec.md`, Basis ohne CODEOWNERS | `ok:false`, `spec-unguarded` | Spec-Prüfung entfernt; Branch-Bedingung entfernt *und* Pfad-Bedingung entfernt |
| T0, `devloop/x` (Impl-Branch), Diff `specs/x/spec.md` + `src/a.ts`, Basis-CODEOWNERS ohne `specs/` | `ok:false` | Pfad-Bedingung entfernt |
| T0, `devloop/spec/x`, Diff nur `test/a.test.ts` | `ok:false` (REQ-3) | Branch-Bedingung entfernt |
| T0, `devloop/spec/x`, Spec gedeckt, keine Reviews | `ok:true, pending:true` | — (Gegenprobe gegen harten Fail) |
| T0, `devloop/spec/x`, Spec gedeckt, Approval auf altem SHA | `ok:false` | T0/T1-Kurzschluss vor der Approval-Bewertung belassen |
| T0, `devloop/spec/x`, Spec gedeckt, Approval eines Bots auf HEAD | `ok:false` | dto. |
| T0, `devloop/spec/x`, Spec gedeckt, menschliche Approval auf HEAD | `ok:true` | — |
| Basis ohne `specs/`-Eintrag, HEAD-CODEOWNERS mit `specs/` | `ok:false` | CODEOWNERS aus HEAD/Arbeitsbaum statt Basis lesen |
| T0, `feature/y`, Diff `src/a.ts`, keine Reviews | `ok:true` (wie bisher) | Spec-Bedingung immer wahr |
| `.devloop/spec-globs.json` = `["docs/specs/*.md"]`, Diff `docs/specs/a.md` ungedeckt | `ok:false` | Config ignoriert |
| `.devloop/spec-globs.json` = `{}` | `ok:false` | Config-Fehler still auf Default |

Mutationen werden im Implementierungs-PR tatsächlich gefahren und mit Ergebnis (welcher Test rot)
in der PR-Beschreibung dokumentiert.

## Bekannte Grenzen (dokumentiert, keine eigene Runde)

- **Test-Änderungen auf Spec-Branches** sind nur dann serverseitig review-gebunden, wenn ihre
  Pfade in CODEOWNERS stehen — das will man nicht, weil sonst jeder T0-Impl-PR, der Tests
  ent-skippt, ein Review bräuchte. In der Praxis enthält ein Spec-PR die `spec.md`, das Review
  deckt den ganzen PR ab. Ein reiner Test-PR auf `devloop/spec/*` wird durch REQ-SPECGATE-3 rot.
  Ein umbenannter Branch verliert die Spec-Ausnahme von `verify-unskip`, Assertion-Änderungen
  werden dort also geblockt.
- **CODEOWNERS-Semantik „letzter Treffer gewinnt"**: Eine spätere Zeile ohne Owner, die einen
  Pfad wieder freigibt, erkennt `parseCodeowners` nicht (sie wird verworfen). Der Wächter hielte
  den Pfad dann für gedeckt. Selten, Folge eines bewussten Eingriffs eines Menschen in CODEOWNERS.
- **Branch-Protection selbst** (Require Code Owner Review) kann devloop nicht prüfen — der Token
  hat dafür keine Rechte. Bleibt Setup-Pflicht wie bisher.
- **`check-codeowners` liest weiter aus dem HEAD** (Ist-Punkt 6, gilt für T2/T3-Pfade). Gleiche
  Lücke, eigener Fix; hier nur notiert, nicht Teil dieses Docs.
- Fällt Issue #11 (Spec-Kritiker statt Menschen-Stopp) positiv aus, ist dieses Design neu zu
  bewerten.
