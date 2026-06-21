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

Der erzeugte Workflow ist **token-frei & dependency-frei**: er ruft nur die öffentliche reusable
Action `mayflower/devloop/.github/actions/precondition-check@v<version>` (von init auf die aktuelle
Version gepinnt). Das Ziel-Repo nimmt devloop **nicht** als npm-Dependency auf — funktioniert
org-übergreifend ohne PAT/Vendoring. Version bumpen: `/devloop:init --force` (re-pinnt) oder den
`@v…`-Ref von Hand ändern.

Danach (Anker b — die Autorität sitzt serverseitig auf GitHub):
1. Den Workflow als **Required Status Check** auf dem geschützten Runner registrieren (Branch Protection).
2. **Branch Protection** für die zwei harten Stopps:
   - **Require a review from CODEOWNERS** (das ist der Spec-Review/T3-Merge-Mensch) + **dismiss stale approvals on push** (Content-Bindung).
   - Die **Agent-Identität von Approve/Merge ausschließen** (sie darf nur vorschlagen) und in `.devloop/bot-logins.json` eintragen → `verify-review` zählt ihre Reviews nie als Mensch-Approval.
3. **CODEOWNERS** ist das §9-Merge-Tor: `init` **scaffoldet** eine `.github/CODEOWNERS` für die T2/T3-tier-map-Pfade (mit `@OWNER`-Platzhalter — **ersetzen!**), wenn keine existiert; existiert eine, lässt `init` sie unberührt und **meldet** ungedeckte T2/T3-Pfade (`notes`). Spec-Pfade (`/.specify/specs/` o.ä.) ebenfalls eintragen. Der Drift-Wächter `check-codeowners` erzwingt die Deckung.
4. `tier-map.json` und `protected-globs.json` ans Repo anpassen (Wirkung→Tier, geschützter Satz).
5. Sicherstellen, dass die übrigen Wächter stehen (Mutation-Ratchet, Semgrep-Fluchttür, geschützter Satz) — sonst verweigert `/devloop:loop` zu Recht den Auto-Loop.
