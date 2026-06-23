# devloop

Generische, projektübergreifende agentische Dev-Loop-Kette als Claude-Code-Plugin.

Operationalisiert das Design `2026-06-19-workflow-orchestration-design.md`: eine Kette
spezialisierter Subagenten (`specify → spec-to-tests → implement → critic`) mit einem
**Driver** (`/devloop:loop`), zwei harten Mensch-Stopps, einer Rückkante mit Eskalation
und einer **Wächter-Vorbedingung** (Auto-Loop nur, wo die nicht-korrumpierbaren Wächter
stehen).

Die Sicherheit hängt **nicht** am Driver-Prompt, sondern an einem deterministischen,
getesteten TypeScript-Kern (Zustandsmaschine + Approval-Verifikation) plus einem
fail-closed CI-Required-Check und GitHub-Branch-Protection.

➡️ **Benutzung (End-to-End): siehe [USAGE.md](./USAGE.md).**

## Stationen (Skills)

- `/devloop:specify` — führt zur `spec.md` (EARS + `REQ-`-IDs + deterministisch abgeleitetes Tier)
- `/devloop:spec-to-tests` — Test-Skeletons je `REQ-`-ID, geroutet nach EARS-Typ
- `/devloop:spec-to-twin` — *(optional, `.devloop` `twin.enabled`)* unabhängiges Verhaltens-Orakel (triviales Referenzmodell + REQ-getaggte Invarianten + fast-check model-based) aus Domänen-Wahrheiten — Korrektheit statt nur Spec-Treue
- `/devloop:implement` — konsumiert Spec+Tests, öffnet PR (schreibt Spec/Tests nicht selbst)
- `/devloop:critic` — adversarial, frischer Kontext, strukturiertes Verdikt
- `/devloop:loop` — der Driver (orchestriert die Stationen als isolierte Subagenten)
- `/devloop:init` — verdrahtet den CI-Bindungs-Anker in ein Ziel-Repo
- `/devloop:cleanup` — räumt lokale, im Remote gemergte Branches + ihre Worktrees sicher auf

## Installation (Kollegen)

```
/plugin marketplace add mayflowergmbh/devloop
/plugin install devloop@devloop
# Updates:
/plugin marketplace update devloop
```

> Veröffentlichung als Public-OSS unter der GitHub-Org `mayflower` erfolgt nach grünem Pilot.

## Entwicklung

```
npm install
npm test          # Vitest gegen den Kern + Struktur-Tests
npm run build     # tsc src -> dist (dist ist Liefer-Artefakt)
npm run check:dist  # verifiziert: eingechecktes dist == src
```

Dev-Install ohne Publish (lokaler Marketplace — kein git-Remote/Push nötig):

```
/plugin marketplace add ~/Code/devloop
/plugin install devloop@devloop
```

`devloop@devloop` = `pluginName@marketplaceName` (beide aus den Feldern `name` in
`.claude-plugin/plugin.json` bzw. `marketplace.json`, nicht aus dem Pfad).

**Achtung Cache:** Beim Installieren wird das Plugin nach `~/.claude/plugins/cache`
**kopiert** (kein Symlink, kein Hot-Reload). Nach jeder Code-Änderung also neu bauen
**und** neu installieren — sonst testest du gegen den alten Cache:

```
npm run build
/plugin uninstall devloop@devloop
/plugin install devloop@devloop
/reload-plugins
```

(`/plugin marketplace update devloop` aktualisiert nur den Katalog, nicht den gecachten Code.)

## Lizenz

MIT — siehe [LICENSE](./LICENSE). © 2026 Mayflower GmbH.
