---
name: init
description: Verdrahte den devloop-Bindungs-Anker (CI-Required-Check devloop-precondition-check) + Config-Skeleton in EINEM Schritt in ein Ziel-Repo, damit die Wächter-Vorbedingung erfüllbar wird. Triggers; /devloop:init, Repo dev-loop-fähig machen, CI-Anker einrichten.
---

# /devloop:init

Macht ein Ziel-Repo in einem Schritt devloop-fähig: legt den **CI-Required-Check** (`devloop-precondition-check`, der autoritative Bindungs-Anker, §5#1) und ein Config-Skeleton (`.devloop/tier-map.json`, `.devloop/protected-globs.json`) an. Idempotent — überschreibt nichts ohne Hinweis.

```
node "${CLAUDE_PLUGIN_ROOT}"/dist/cli/init.js <ziel-repo>
# Upgrade/Migration (z.B. v0.1 -> v0.2): vorhandenen Workflow überschreiben
node "${CLAUDE_PLUGIN_ROOT}"/dist/cli/init.js <ziel-repo> --force
```

> **Lies die `notes` im Output.** init überschreibt nichts still: ein vorhandener Workflow wird
> **nicht** aktualisiert (nur mit `--force`), und eine vorhandene tier-map (`tools/tier-map.json`)
> wird **nicht** von einer Default-Map beschattet — beides als laute `notes` gemeldet, statt nur „skipped".
>
> **Wichtig (by design):** Den **Workflow muss ein Mensch pushen** — eine Bot-GitHub-App ohne
> `workflows`-Permission wird beim Push auf `.github/workflows/**` abgelehnt (gutes Sicherheitsverhalten:
> der Agent darf die Gates nicht umschreiben). Der CI-verdrahtende Teil ist also nicht bot-automatisierbar.

Die erzeugten Workflows sind **token-frei & dependency-frei**: sie rufen nur öffentliche, gepinnte
devloop-Bausteine (Ziel-Repo nimmt devloop **nicht** als npm-Dependency auf; org-übergreifend ohne
PAT/Vendoring):
- `devloop-precondition-check.yml` → Action `mayflower/devloop/.github/actions/precondition-check@v<version>`.
- `auto-merge.yml` (optional, Variant B) → reusable Workflow `mayflower/devloop/.github/workflows/auto-merge.yml@v<version>`
  (`enable-auto-merge` + `update-behind`; `bot-login` aus `.devloop/bot-logins.json`). Löst das
  BEHIND-Stocken serieller T0/T1-PRs bei strikter Branch-Protection.

**Beide Workflow-Dateien muss ein Mensch pushen** (Bot ohne `workflows`-Permission). Version bumpen:
`/devloop:init --force` (re-pinnt) oder den `@v…`-Ref von Hand ändern.

Danach (Anker b — die Autorität sitzt serverseitig auf GitHub):
1. Den Workflow als **Required Status Check** auf dem geschützten Runner registrieren (Branch Protection).
2. **Branch Protection** für die zwei harten Stopps:
   - **Require a review from CODEOWNERS** (das ist der Spec-Review/T3-Merge-Mensch) + **dismiss stale approvals on push** (Content-Bindung).
   - Die **Agent-Identität von Approve/Merge ausschließen** (sie darf nur vorschlagen) und in `.devloop/bot-logins.json` eintragen → `verify-review` zählt ihre Reviews nie als Mensch-Approval.
3. **CODEOWNERS** ist das §9-Merge-Tor: `init` **scaffoldet** eine `.github/CODEOWNERS` für die T2/T3-tier-map-Pfade (mit `@OWNER`-Platzhalter — **ersetzen!**), wenn keine existiert; existiert eine, lässt `init` sie unberührt und **meldet** ungedeckte T2/T3-Pfade (`notes`). **`/.devloop/` muss von der CODEOWNERS gedeckt sein** (`init` scaffoldet `/.devloop/ @OWNER`, bei bestehender CODEOWNERS meldet es die Lücke in `notes`): Die Precondition-Action liest `tier-map`, `protected-globs` und `bot-logins` aus der **Basis**, und jede Config-Änderung (`.devloop/**`, tier-map) braucht ein Review, sonst `config-unguarded`. **Spec-Pfade (`/.specify/specs/` o.ä.) eintragen ist Pflicht und wird erzwungen:** `verify-review` prüft bei jeder Spec-Änderung (Branch `devloop/spec/*` oder Spec-Pfad im Diff), dass die CODEOWNERS der **Basis** (nicht des PR-HEAD) jeden geänderten Spec-Pfad decken, sonst `spec-unguarded`. Was als Spec-Pfad gilt, steht in `.devloop/spec-globs.json` (JSON-Array nicht-leerer Globs, gelesen aus der Basis (Änderung wirkt erst nach dem Merge), Default `["**/spec.md"]`; ungültig oder leeres Array = fail-closed). Der Drift-Wächter `check-codeowners` (und `init`) liest die wirksame CODEOWNERS in GitHubs Reihenfolge `.github/CODEOWNERS`, `CODEOWNERS`, `docs/CODEOWNERS` (erste gefundene, keine Vereinigung) und erzwingt die Deckung nur für die T2/T3-tier-map-Pfade, **nicht** für Spec-Pfade; die Spec-Deckung erzwingt `verify-review` bei Spec-Änderungen. **Zwei Prüfungen für T2/T3-Pfade (seit v0.13.0):** der Drift-Wächter prüft die tier-map-Pfade gegen die CODEOWNERS des **PR-HEAD**; zusätzlich prüft `verify-review` die **Wirksamkeit gegen die Basis**: Jeder im Diff berührte Pfad, der nach der **Basis**-tier-map T2/T3 ist, muss von der **Basis**-CODEOWNERS gedeckt sein, sonst `codeowners-unguarded` (hart, nie pending; ausgenommen sind die Erstaufnahme, eine Basis ohne tier-map (der PR, der sie hinzufügt, läuft durchs Config-Gate) und der lokale Aufruf ohne `baseRef`). Eine Deckung, die der PR sich selbst einträgt, zählt nicht; Reparatur über einen PR, der nur CODEOWNERS ändert.
4. `tier-map.json` und `protected-globs.json` ans Repo anpassen (Wirkung→Tier, geschützter Satz).
5. Sicherstellen, dass die übrigen Wächter stehen (Mutation-Ratchet, Semgrep-Fluchttür, geschützter Satz) — sonst verweigert `/devloop:loop` zu Recht den Auto-Loop.
