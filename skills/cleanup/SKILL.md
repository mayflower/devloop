---
name: cleanup
description: Räumt lokale Branches (und ihre Worktrees) auf, deren Arbeit im Remote-Default-Branch gemergt ist — sicher (nie unmerged, nie main, nie der aktuelle Branch). Triggers; /devloop:cleanup, gemergte Branches aufräumen, Worktrees prunen, stale branches entfernen.
---

# /devloop:cleanup

Entfernt lokale Branches, deren PR im Remote gemergt wurde, plus die zugehörigen Worktrees —
die Hygiene-Kehrseite der Worktree-pro-Lauf-Isolation (parallele Sessions sammeln sonst stale
Branches/Worktrees an, §10.1/§10.2).

**Erst Dry-Run** (zeigt nur an, löscht nichts):
```
node "${CLAUDE_PLUGIN_ROOT}"/dist/cli/cleanup.js <repo>
```
Prüfe die `plan.delete`-Liste. **Dann anwenden:**
```
node "${CLAUDE_PLUGIN_ROOT}"/dist/cli/cleanup.js <repo> --apply
```

## Sicherheit (kein Datenverlust)

- Löscht **nur** Branches, die in den Default-Branch (`origin/<default>`) gemergt sind.
- **Nie** den geschützten Satz (`main`/`master`), **nie** den aktuellen Branch, **nie** unmerged Arbeit.
- Verwendet `git branch -d` (nicht `-D`) als zweites Netz — git verweigert selbst, wenn ein
  Branch doch nicht gemergt ist.
- **Berichtet**, was gelöscht wird (kein stilles Aufräumen). Worktrees werden via
  `git worktree remove` + `prune` mitentfernt.
