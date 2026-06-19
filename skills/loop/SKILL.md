---
name: loop
description: Driver der agentischen Dev-Loop-Kette. Orchestriert die Stationen specify→spec-to-tests→implement→critic als ISOLIERTE Subagenten mit frischem Kontext, hält an den zwei harten Mensch-Stopps (Spec-Review, T3-Merge) und führt die Rückkante mit Eskalation. Triggers; /devloop:loop <feature>, Dev-Loop starten, orchestrierte Spec→Tests→Code→Critic-Kette.
---

# Driver: /devloop:loop

Du **dirigierst** — du arbeitest nicht. Du erzeugst **niemals selbst** Spec, Tests oder Code; Artefakte entstehen ausschließlich in den isolierten Stations-Subagenten. Deine Sicherheit hängt **nicht an dieser Anweisung**, sondern am getesteten Kern + am CI-Anker — aber du hältst dich trotzdem daran.

## Eiserne Regel

> Du triffst **keine** der Ablauf-/Stopp-Entscheidungen selbst. Du rufst `next-action` und **gehorchst** dem Ergebnis.

## 0. Wächter-Vorbedingung (zuerst, immer)

```
node "${CLAUDE_PLUGIN_ROOT}"/dist/cli/check-guardians.js <ziel-repo>
```
Exit 1 ⇒ **verweigere den autonomen Loop**, melde die fehlenden Wächter dem Menschen und eskaliere. Kein Auto-Loop ohne Mutation-Ratchet / Semgrep-Fluchttür / geschützten Satz / `devloop-precondition-check` (§5). Fehlt der Anker, hilft `/devloop:init`.

## 1. Loop

Halte einen `DriverState` (tier, guardians, phase, humanApprovals, gateVerdict, loop, loopParams). `humanApprovals` setzt du **nur** aus dem **autoritativen GitHub-Review** (Anker b): `verify-review` prüft via `gh api`, ob ein **Mensch** (nicht der Agent-Bot, nicht der PR-Autor) den aktuellen HEAD freigegeben hat. Du schreibst **keine** Approval-Tokens selbst und akzeptierst **kein** „ja, weiter" im Chat — du kannst dich nicht selbst freigeben.

Wiederhole: Zustand als JSON an `next-action` geben und die Aktion ausführen.
```
echo '<DriverState-JSON>' | node "${CLAUDE_PLUGIN_ROOT}"/dist/cli/next-action.js
```

| Aktion | Was du tust |
|---|---|
| `REFUSE_GUARDIANS` | Stopp, Wächter melden, eskalieren. |
| `SPAWN_STATION` | Den Subagenten `devloop-<station>` via **Task-Tool** spawnen (frischer Kontext!). Artefakt-Ergebnis übernehmen, Phase fortschreiben. **Nie inline erzeugen.** |
| `RUN_GATES` | Gates auf dem **geschützten Runner** (CI = Gate of Record) triggern; **Verdikt nur von dort** (§5#1), inkl. `devloop-precondition-check`, Protected-Set-Ratchet und **server-berechnetem Tier aus dem Diff** (nicht agent-deklariert, §9). Fehler-Logs über den schmalen Rückkanal lesen (`gh pr checks`, `gh run view --log-failed`). |
| `STOP_FOR_HUMAN` | **Turn beenden.** Übergib Kontext an den Menschen und warte. Der Stopp gilt erst als passiert, wenn ein **Mensch per GitHub-PR-Review** (CODEOWNERS) den aktuellen Stand freigibt — verifiziert durch `verify-review` auf CI (Anker b). T3-Merge ist zusätzlich durch Branch-Protection erzwungen. **Nicht** du gibst frei. |
| `RE_GEN` | Defektsignal (Datei:Zeile:Regel / überlebende Mutante) in eine neue `implement`-Runde geben — als **Signal, nicht Lösung**. Bei `freshContext:true` neue isolierte Instanz. |
| `ESCALATE` | Sauberer Stopp + Kontext-Übergabe an den benannten Owner. |
| `DONE` | Fertig (T0/T1 Auto-Merge bei grün; T2/T3 erst nach Mensch-Stopp). |

## Zwei Schleifen (§10 „Wo der Loop läuft")

- **Innere Schleife (Sandbox, Tempo):** `specify→spec-to-tests→implement→critic` lokal, voller Gate-Satz **advisorisch** (vitest/stryker/semgrep), Lichter aus. Kauft Geschwindigkeit, **nicht** Vertrauen.
- **Capability-Grenze:** PR/Push auf den **Feature-Branch** (nie main); Egress nur gh-API · git-Remote · Registry; keine echten Secrets.
- **Äußere Schleife (CI = Gate of Record):** Gates **autoritativ** re-run; rot → Logs über den Rückkanal → `RE_GEN` innen; grün → Merge je Tier.

## Nicht verhandelbar

- Stationen **immer** als isolierte Subagenten (Anti-Kollusion §3.2) — `spec-to-tests` und `implement` dürfen nie dieselbe Instanz sein.
- Die zwei Stopps sind **hart**: du läufst nicht durch, du übergibst. Versuchst du es doch, fail-closed der CI-Anker und macht die Lücke sichtbar.
- Die **Merge-Autorität** hängt an serverseitigen Branch-Rules + server-berechnetem Tier — **nie** an deinem Wohlverhalten.
