# Obol-Befund: v0.7.0 precondition-check composite action lädt nicht (Manifest-Bug)

**Datum:** 2026-06-22 · **Melder:** Obol-Referenz-Repo (erster PR nach Migration auf `@v0.7.0`, Obol-PR #49) · **Schwere:** blockierend für alle Consumer.

## Symptom

Nach Migration des Obol-`devloop-precondition-check`-Workflows auf die reusable composite action
`@v0.7.0` scheitert **jeder** PR am Required Check `devloop-precondition-check`. Der Fehler kommt
**beim Laden der Action**, noch vor jedem Step:

```
mayflower/devloop/v0.7.0/.github/actions/precondition-check/action.yml (Line: 12, Col: 18):
Unrecognized named-value: 'github'. Located at position 1 within expression: github.token
→ Failed to load mayflower/devloop/v0.7.0/.github/actions/precondition-check/action.yml
GitHub.DistributedTask.ObjectTemplating.TemplateValidationException: The template is not valid.
```

Die Action wird also gar nicht ausgeführt — sie lädt nicht. Der Required Check ist damit rot,
kein PR mergebar. (Beleg: Obol-PR #50, CI-Run 27949083689 — alle 11 Gates grün, nur
`devloop-precondition-check` rot.)

## Root Cause

`.github/actions/precondition-check/action.yml`, **Zeile 12**: Das `${{ github.token }}` steht als
*Beispieltext* in der `description` des Inputs `github-token`:

```yaml
inputs:
  github-token:
    description: Token for `gh` (pass ${{ github.token }}). Reads the caller's own PR only.
    required: true
```

GitHub wertet `${{ }}`-Ausdrücke **auch in Input-`description`-Feldern** beim Laden des
Action-Manifests aus. Im Composite-Action-Manifest-Kontext ist der `github`-Context aber **nicht**
verfügbar (gültig sind dort nur `inputs`, `env`, `steps` …) → Template-Validation schlägt fehl →
die Action lädt nicht.

Die *funktionale* Nutzung (Zeile 46, `GH_TOKEN: ${{ inputs.github-token }}`) ist korrekt und **nicht**
betroffen.

## Fix (eine Zeile)

Zeile 12 — die Ausdruck-Syntax aus dem reinen Doku-Text entfernen:

```yaml
    description: Token for `gh` (pass `github.token`). Reads the caller's own PR only.
```

Also `${{ github.token }}` → `` `github.token` `` (ohne `${{ }}`). Kein Verhalten ändert sich, nur die
Beschreibung wird wieder ladbar.

## Blast Radius

- v0.7.0 ist für **alle** Consumer der composite action kaputt — sie lädt nie.
- Betrifft jedes Repo mit `uses: mayflower/devloop/.github/actions/precondition-check@v0.7.0`.
- Obols Merge-Käfig ist seit der Migration (#49 auf main) faktisch down: jeder PR blockiert am
  precondition-check. (Dass #49 selbst durchkam: dort lief noch der alte Inline-Check, die
  Workflow-Änderung greift erst nach dem Merge.)

## Geprüft — nur dieses eine Vorkommen

`grep -rnE 'description:.*\$\{\{' .github/actions .github/workflows templates` → ausschließlich
`action.yml:12`. Die `${{ github.token }}` in `.github/workflows/auto-merge.yml` (Z. 36/59) stehen
in `env:`/`run:` einer **reusable workflow** (dort ist der `github`-Context gültig) → kein Problem.

## Release + Verifikation

1. Fix → **v0.7.1** taggen (committed `dist/` unverändert nötig, nur Manifest).
2. Verifikation: ein trivialer PR in einem Consumer-Repo auf `@v0.7.1` lädt die Action und durchläuft
   die vier Steps (`derive-tier` / `check-codeowners` / `verify-review` / `verify-unskip`) ohne
   Manifest-Fehler.
3. Obol repinnt danach von `@v0.7.0` auf `@v0.7.1` (eine Zeile im Workflow) → PR #50 + Folge-PRs grün.

## Vorsorge (optional, aber passend zur „Wächter der Wächter"-Linie)

Ein Lint/CI-Check für devloop selbst, der `${{` in `description:`-Feldern von Action-Manifesten
verbietet, fängt genau diese Fehlerklasse fail-closed — sonst kann sie bei der nächsten
Manifest-Bearbeitung stumm wiederkehren.
