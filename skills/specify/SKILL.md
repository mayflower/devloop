---
name: specify
description: Erzeuge eine spec.md (User Story + EARS-Kriterien mit REQ-IDs + deterministisch abgeleitetem Tier). Einzelaufruf-Form der Station; im orchestrierten Lauf spawnt /devloop:loop dies als isolierten Subagenten. Triggers; /devloop:specify, Spec schreiben, EARS-Kriterien erarbeiten.
---

# /devloop:specify (Einzelaufruf)

Dies ist die **Standalone-Form** der specify-Station. Für orchestrierte Läufe mit den harten Stopps nutze **`/devloop:loop`** — dort läuft specify als isolierter Subagent mit frischem Kontext.

Folge der Stations-Definition `agents/devloop-specify.md`: User Story + EARS-Kriterien mit `REQ-<CTX>-<nr>`-IDs, **Tier deterministisch** via
`node "${CLAUDE_PLUGIN_ROOT}"/dist/cli/derive-tier.js` ableiten (nie selbst wählen), `spec.md` schreiben. Keinen Code, keine Tests.

Danach folgt der **harte Spec-Review-Stopp** (§5.1): ein unabhängiger Intent-Halter muss die Spec freigeben, bevor sie zu Tests/Code wird.
