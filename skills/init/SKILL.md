---
name: init
description: Verdrahte den devloop-Bindungs-Anker (CI-Required-Check devloop-precondition-check) + Config-Skeleton in EINEM Schritt in ein Ziel-Repo, damit die Wächter-Vorbedingung erfüllbar wird. Triggers; /devloop:init, Repo dev-loop-fähig machen, CI-Anker einrichten.
---

# /devloop:init

Macht ein Ziel-Repo in einem Schritt devloop-fähig: legt den **CI-Required-Check** (`devloop-precondition-check`, der autoritative Bindungs-Anker, §5#1) und ein Config-Skeleton (`.devloop/tier-map.json`, `.devloop/protected-globs.json`) an. Idempotent — überschreibt nichts ohne Hinweis.

```
node "${CLAUDE_PLUGIN_ROOT}"/dist/cli/init.js <ziel-repo>
```

Danach (Anker b — die Autorität sitzt serverseitig auf GitHub):
1. Den Workflow als **Required Status Check** auf dem geschützten Runner registrieren (Branch Protection).
2. **Branch Protection** für die zwei harten Stopps:
   - **Require a review from CODEOWNERS** (das ist der Spec-Review/T3-Merge-Mensch) + **dismiss stale approvals on push** (Content-Bindung).
   - Die **Agent-Identität von Approve/Merge ausschließen** (sie darf nur vorschlagen) und in `.devloop/bot-logins.json` eintragen → `verify-review` zählt ihre Reviews nie als Mensch-Approval.
3. **CODEOWNERS** für die Spec-Pfade (`spec.md` / Bounded-Context) setzen — das ist der unabhängige Intent-Halter (§5.1/§10.1).
4. `tier-map.json` und `protected-globs.json` ans Repo anpassen (Wirkung→Tier, geschützter Satz).
5. Sicherstellen, dass die übrigen Wächter stehen (Mutation-Ratchet, Semgrep-Fluchttür, geschützter Satz) — sonst verweigert `/devloop:loop` zu Recht den Auto-Loop.
