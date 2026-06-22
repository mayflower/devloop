# Obol-Befund: v0.7.1 precondition-check composite action — `dist/` am falschen Pfad

**Datum:** 2026-06-22 · **Melder:** Obol-Referenz-Repo · **Schwere:** blockierend · **Bezug:** Folgebefund nach
`obol-befund-v0.7.0-precondition-action-manifest.md` (anderer Fehler, gleiche Action).

## Symptom

Mit `@v0.7.1` **lädt** das Manifest jetzt (der v0.7.0-Fix griff), aber der Check failt zur **Laufzeit** im
ersten Step. Job-Log (Obol-PR #51, CI-Run 27952317410):

```
node "$GITHUB_ACTION_PATH/dist/cli/derive-tier.js" > tier.json
Error: Cannot find module
  '/home/runner/work/_actions/mayflower/devloop/v0.7.1/.github/actions/precondition-check/dist/cli/derive-tier.js'
##[error]Process completed with exit code 1.
```

Jeder Consumer-PR scheitert damit am `devloop-precondition-check` — Obols Käfig ist nach dem Repin auf
`@v0.7.1` erneut down.

## Root Cause

Die `action.yml` referenziert die vier CLIs über `$GITHUB_ACTION_PATH/dist/cli/*.js` (`derive-tier`,
`check-codeowners`, `verify-review`, `verify-unskip`). `$GITHUB_ACTION_PATH` ist der **Action-Ordner**
`.github/actions/precondition-check/` — und der enthält **nur `action.yml`**, kein `dist/`. Die gebauten
CLIs liegen im **Repo-Root** unter `dist/cli/`.

Geprüft gegen den v0.7.1-Tag:
- `grep GITHUB_ACTION_PATH action.yml` → 4× `…/dist/cli/…`.
- `ls .github/actions/precondition-check/` → nur `action.yml`.
- `git ls-tree -r v0.7.1` → `dist/cli/derive-tier.js` liegt im **Root**, es gibt **kein**
  `.github/actions/precondition-check/dist/`.

→ Der Pfad `$GITHUB_ACTION_PATH/dist/cli/…` zeigt ins Leere.

## Fix (→ v0.7.2), zwei Wege

- **Pfad korrigieren:** die vier `$GITHUB_ACTION_PATH/dist/cli/X.js` → `$GITHUB_ACTION_PATH/../../../dist/cli/X.js`
  (der Action-Ordner liegt drei Ebenen unter dem Repo-Root: `precondition-check → actions → .github → root`).
- **Oder `dist/` in den Action-Ordner ausliefern:** Build/Release kopiert `dist/` nach
  `.github/actions/precondition-check/dist/` — dann stimmt der jetzige Pfad. Je nachdem, welches Layout
  beabsichtigt war.

## Blast Radius

v0.7.1 ist für **alle** Consumer der composite action zur Laufzeit kaputt (Manifest lädt, aber die CLIs
fehlen am erwarteten Pfad). Betrifft jedes Repo mit
`uses: mayflower/devloop/.github/actions/precondition-check@v0.7.1`.

## Meta — die eigentliche Lehre (Release-Prozess)

**Zwei kaputte Releases in Folge** (v0.7.0 = Manifest-Load, v0.7.1 = dist-Pfad). **Beide** hätte **ein
einziger End-to-End-Lauf gegen ein echtes Consumer-Repo** vor dem Taggen gefangen. Empfehlung: ein
Consumer-Smoke-Test im devloop-Release-Prozess — ein Wegwerf-Repo referenziert
`uses: …/precondition-check@<candidate>` auf einem trivialen PR und **muss grün durchlaufen**, bevor der
Tag gesetzt wird. Das ist „Wächter der Wächter" auf der Release-Ebene; bisher prüft devloop seine eigene
Action nicht so, wie ein Fremd-Repo sie konsumiert.

## Release + Verifikation

1. Fix → **v0.7.2** taggen (mit am erwarteten Pfad erreichbarem `dist/`).
2. Verifikation: ein Consumer-PR auf `@v0.7.2` lädt die Action **und** durchläuft die vier Steps grün.
3. Obol repinnt `@v0.7.1` → `@v0.7.2`.
