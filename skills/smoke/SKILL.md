---
name: smoke
description: Smoke gegen einen lokalen Stack auf dem PR-Stand — Konsumenten des geänderten Pfads ermitteln, passenden Modus wählen (Browser/API/CLI), Wirkung vorher/nachher messen, Abnahme-Anleitung für den Menschen schreiben. Einzelaufruf-Form; im orchestrierten Lauf spawnt /devloop:loop dies als isolierten Subagenten. Triggers; /devloop:smoke, Smoke-Test, lokale Abnahme vorbereiten, Klicktest.
---

# /devloop:smoke (Einzelaufruf)

Standalone-Form. Im orchestrierten Lauf nutze **`/devloop:loop`**.

Folge `agents/devloop-smoke.md`: erst die Konsumenten des geänderten Pfads mit `datei:zeile` belegen, daraus den Modus je Fall ableiten, den lokalen Stack nach `.devloop/config.json` → `smoke.setup` auf dem PR-Stand aufbauen, je Fall Zustand vorher/nachher messen. Nur lokal, kein Repo-Inhalt wird geändert. Output: JSON-Bericht nach dem Schema in `agents/devloop-smoke.md`; das Ergebnis leitet

```
echo '{"rawOutput": "<bericht>"}' | node "${CLAUDE_PLUGIN_ROOT}"/dist/cli/smoke-verdict.js
```

ab — ein Selbst-Label zählt nicht. Die Abnahme-Anleitung (`abnahme`) geht an den Menschen; der Stack bleibt für seine Abnahme laufen.
