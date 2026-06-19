---
name: init
description: Verdrahte den devloop-Bindungs-Anker (CI-Required-Check devloop-precondition-check) + Config-Skeleton in EINEM Schritt in ein Ziel-Repo, damit die Wächter-Vorbedingung erfüllbar wird. Triggers; /devloop:init, Repo dev-loop-fähig machen, CI-Anker einrichten.
---

# /devloop:init

Macht ein Ziel-Repo in einem Schritt devloop-fähig: legt den **CI-Required-Check** (`devloop-precondition-check`, der autoritative Bindungs-Anker, §5#1) und ein Config-Skeleton (`.devloop/tier-map.json`, `.devloop/protected-globs.json`) an. Idempotent — überschreibt nichts ohne Hinweis.

```
node "${CLAUDE_PLUGIN_ROOT}"/dist/cli/init.js <ziel-repo>
```

Danach:
1. Den Workflow als **Required Status Check** auf dem geschützten Runner registrieren (Branch Protection).
2. `tier-map.json` und `protected-globs.json` an das Ziel-Repo anpassen (Wirkung→Tier, geschützter Satz).
3. Sicherstellen, dass die übrigen Wächter stehen (Mutation-Ratchet, Semgrep-Fluchttür, geschützter Satz) — sonst verweigert `/devloop:loop` zu Recht den Auto-Loop.
