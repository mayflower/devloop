---
name: loop
description: Driver der agentischen Dev-Loop-Kette. Orchestriert die Stationen specify→spec-to-tests→implement→critic(→smoke) als ISOLIERTE Subagenten mit frischem Kontext, hält an den zwei harten Mensch-Stopps (Spec-Review, T3-Merge) und führt die Rückkante mit Eskalation. Triggers; /devloop:loop <feature>, Dev-Loop starten, orchestrierte Spec→Tests→Code→Critic-Kette.
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

Halte einen `DriverState` (tier, guardians, phase, twinEnabled, smokeTiers, humanApprovals, gateVerdict, critic, smoke, ready, loop, loopParams). **`twinEnabled`** liest du aus `.devloop/config.json` (`twin.enabled`, Default `false`) — ist es gesetzt, schiebt der Kern die optionale, isolierte `spec-to-twin`-Station **vor** den Spec-PR (Schwester von `spec-to-tests`, sieht deren Tests aber **nicht** — Unabhängigkeit des Orakels). `humanApprovals` setzt du **nur** aus dem **autoritativen GitHub-Review** (Anker b): `verify-review` prüft via `gh api`, ob ein **Mensch** (nicht der Agent-Bot, nicht der PR-Autor) den aktuellen HEAD freigegeben hat. **`smokeTiers`** liest du mit `node "${CLAUDE_PLUGIN_ROOT}"/dist/cli/smoke-tiers.js <repo>` (aus `.devloop/config.json` `smoke.tiers`, Default `[]` = aus; Exit 1 bei kaputter Config → **nicht** weiterlaufen, melden) — für diese Tiers schiebt der Kern nach einem akzeptierten Critic-Verdikt die isolierte `smoke`-Station **vor** `MARK_READY` (Smoke gegen einen lokalen Stack auf dem PR-Stand, Abnahme-Anleitung für den Menschen). Du schreibst **keine** Approval-Tokens selbst und akzeptierst **kein** „ja, weiter" im Chat — du kannst dich nicht selbst freigeben.

`loop` = `{iteration, gateChangedNotCode, freshContextUsed, lastRound}`; `lastRound` = `{judged, progress, oscillation}` aus dem **Ledger** (kein Zähler mehr, `errorCounts` entfällt); `loopParams` = `{maxIter}`. `critic` = `{status: "completed"|"not-run", verdict?, retried}`; `ready` = Impl-PR nicht mehr Draft. Phase `critiqued` setzt du nach jedem Critic-Lauf.

**Smoke-Ergebnis ableiten** (nur wenn `next-action` die Station `smoke` verlangt hat). Den **rohen** Bericht der Station — nicht dein Urteil, nicht ihr Selbst-Label — an die CLI:
```
echo '{"rawOutput":"<roh>","retried":<bool>}' | node "${CLAUDE_PLUGIN_ROOT}"/dist/cli/smoke-verdict.js
```
Ergebnis `smoke` übernimmst du in den State (`retried: true` beim zweiten Lauf nach `not-run`), die Phase bleibt `critiqued`. Ob das Smoke-Gate greift, entscheidet `tier`: ab `RUN_GATES` ist das **das server-berechnete Tier aus dem Diff**, nicht das vorläufige aus der Spec. Bericht und **Abnahme-Anleitung** (`abnahme`) postest du als PR-Kommentar (Bot-Identität) — damit prüft der Mensch am Merge-Stopp die Intention. Der lokale Stack bleibt dafür laufen; abräumen (`cleanup` aus dem Bericht) erst nach dem Merge-Stopp oder auf Zuruf. Bei `failed` gehen die roten Fälle samt Beobachtung als Defektsignal in `RE_GEN`; **vorher** räumst du den Stack dieses Laufs ab (`cleanup`), sonst scheitert der nächste Aufbau an belegten Ports/Namen. Grenze: Smoke-Befunde laufen nicht über den Ledger; die Rückkante begrenzt hier nur `maxIter`.

**Ledger zwischen den Runden halten.** Nach jedem Critic-Lauf gibst du dessen **rohe** Ausgabe(n) (bei T2/T3 alle Instanzen) — nicht dein Urteil, nicht ihr Selbst-Label — an die CLI (REQ-CRITIC-1):
```
echo '{"rawOutputs":["<roh>",...],"ledger":<Ledger>,"addressed":["<key>",...]}' | node "${CLAUDE_PLUGIN_ROOT}"/dist/cli/critic-verdict.js
```
`addressed` = die Keys, die `implement` zuletzt als adressiert gemeldet hat. Ergebnis `status: "not-run"` → `critic: {status:"not-run", retried}`. `completed` → `critic: {status, verdict, retried:false}` (das **abgeleitete** `verdict`), `round.ledger` ist dein neuer Ledger, `round` ohne `ledger` (`judged/progress/oscillation`) dein neues `loop.lastRound`. Bei rotem Gate genauso, mit den **strukturierten** Gate-Befunden:
```
echo '{"raws":[<GateRaw>,...],"ran":["test",...],"ledger":<Ledger>,"addressed":["<key>",...]}' | node "${CLAUDE_PLUGIN_ROOT}"/dist/cli/gate-round.js
```
`GateRaw` = `{kind:"test",file,testName}` · `{kind:"mutant",file,fn,mutator}` · `{kind:"semgrep",rule,file,fn}` · `{kind:"trace",req}`. `ran` = **nur** die Gate-Arten, deren CI-Job in dieser Runde tatsächlich gelaufen ist (übersprungene Jobs **nicht** eintragen — sonst gälten ihre Befunde als geschlossen). Exit 2 = Eingabe falsch: nichts fortschreiben, Eingabe korrigieren statt raten. Sonst `round.ledger` = neuer Ledger, `round` ohne `ledger` = neues `loop.lastRound`. Der Ledger lebt nur in dieser Session (siehe Resume).

Wiederhole: Zustand als JSON an `next-action` geben und die Aktion ausführen.
```
echo '<DriverState-JSON>' | node "${CLAUDE_PLUGIN_ROOT}"/dist/cli/next-action.js
```

| Aktion | Was du tust |
|---|---|
| `REFUSE_GUARDIANS` | Stopp, Wächter melden, eskalieren. |
| `SPAWN_STATION` | Den Subagenten `devloop-<station>` via **Task-Tool** spawnen (frischer Kontext!). **`implement` (und jede mutierende Station) mit Worktree-Isolation spawnen** (`isolation: "worktree"`), Branch `devloop/<slug>` — so kollidieren parallele Sessions nie auf demselben Arbeitsbaum (§10.2). Artefakt-Ergebnis übernehmen, Phase fortschreiben. **Nie inline erzeugen.** |
| `OPEN_SPEC_PR` | `spec.md` + die **geskippten** Tests als **eigenen Spec-PR** auf Branch **`devloop/spec/<slug>`** (Bot-Identität) gegen `main` öffnen. Das ist der reviewbare HEAD für den Spec-Review-Stopp (Anker b). Hält `main` grün (Trace zählt Skips, Vitest rötet nicht). Der Branch-Prefix `devloop/spec/` sagt `verify-unskip`, dass hier `spec-to-tests` Tests autoren darf (Implement-PR läuft auf `devloop/<slug>`). |
| `MERGE_SPEC_PR` | Spec-PR ist gereviewt+grün → mergen, dann `git pull` auf `main`. Damit liegt die Spec auf `main`; `implement` baut darauf auf (Artefakt-Handoff via main, keine Hand-Brücke). |
| `RUN_GATES` | Gates auf dem **geschützten Runner** (CI = Gate of Record) triggern; **Verdikt nur von dort** (§5#1), inkl. `devloop-precondition-check`, Protected-Set-Ratchet und **server-berechnetem Tier aus dem Diff** (nicht agent-deklariert, §9). Fehler-Logs über den schmalen Rückkanal lesen (`gh pr checks`, `gh run view --log-failed`). |
| `STOP_FOR_HUMAN` | **Turn beenden.** Übergib Kontext an den Menschen und warte. Bei `STOP_FOR_HUMAN` und `ESCALATE` schreibst du vorher den Ledger als Tabelle in den PR (`renderLedgerTable`, REQ-LEDGER-10; offene blocker/major oben, `fixed-claimed` als „behoben (unverifiziert)") per `gh pr comment`. Der Stopp gilt erst als passiert, wenn ein **Mensch per GitHub-PR-Review** (CODEOWNERS) den aktuellen Stand freigibt — verifiziert durch `verify-review` auf CI (Anker b). T3-Merge ist zusätzlich durch Branch-Protection erzwungen. **Nicht** du gibst frei. |
| `MARK_READY` | Critic hat (abgeleitet) akzeptiert → `gh pr ready <pr>` (REQ-BIND-2); armiert bei T0/T1 den Auto-Merge. Danach `ready: true` setzen. Impl-PRs sind bis hierhin **Draft**. |
| `RE_GEN` | Defektsignal (Datei:Zeile:Regel / überlebende Mutante / offene Critic-Befunde) in eine neue `implement`-Runde geben — als **Signal, nicht Lösung**; `implement` meldet je adressiertem Befund Key + `datei:zeile`. Bei `freshContext:true` neue isolierte Instanz. **`critic` und `smoke` im State löschen** — neuer Code braucht neue Belege. Bei `markDraft:true` außerdem **`ready: false`** setzen (der PR ist wieder Draft; sonst liefe neuer Code am Smoke vorbei zu `DONE`), und **vor** dem nächsten Push `gh pr ready <pr> --undo` (REQ-BIND-3). |
| `ESCALATE` | Sauberer Stopp + Kontext-Übergabe an den benannten Owner. Gründe u.a. `ESCALATE_OSCILLATION`, `ESCALATE_STAGNATION`, `critic-not-run` (Critic zweimal ohne gültige Ausgabe), `smoke-not-run` (Smoke zweimal ohne gültigen Bericht oder Stack nicht aufgebaut). |
| `DONE` | Fertig (T0/T1 Auto-Merge bei grün; T2/T3 erst nach Mensch-Stopp). |

**Nachtragsweg (#27, spätere Spec-Änderung):** Die Klasse bestimmt **nie der Agent**, sondern die CLI:
`node "${CLAUDE_PLUGIN_ROOT}"/dist/cli/spec-amend-class.js <abgenommener-stand> <neuer-stand>` (abgenommener Stand = Spec auf der Basis). Den abgenommenen Stand erzeugst du als Datei: `git show <basis-ref>:<spec-pfad> > <tmp>/alt.md` (Basis des Impl-PR bzw. des laufenden PR). **Exit 2** der CLI (auch wenn die Spec in der Basis fehlt, also neue Spec) → wie `anforderung` behandeln, also Stopp; nie raten. `klasse: "unveraendert"` → nichts zu tun. `"nachtrag"` (nur Zeilen in „Bekannte Grenzen“/„Folge-Issues“, keine REQ-Definition, keine Überschriftenänderung) → **ohne Stopp**: eigener Commit mit Präfix `docs(spec-nachtrag):` auf dem laufenden Branch, `prBody` unverändert in den PR-Body; weiter in der Kette. `"anforderung"` → der bisherige Weg mit Spec-Review-Stopp (`gruende` dem Menschen nennen).

## Zwei Schleifen (§10 „Wo der Loop läuft")

- **Innere Schleife (Sandbox, Tempo):** `specify→spec-to-tests→implement→critic(→smoke)` lokal, voller Gate-Satz **advisorisch** (vitest/stryker/semgrep), Lichter aus. Kauft Geschwindigkeit, **nicht** Vertrauen.
- **Capability-Grenze:** PR/Push auf den **Feature-Branch** (nie main); Egress nur gh-API · git-Remote · Registry; keine echten Secrets.
- **Äußere Schleife (CI = Gate of Record):** Gates **autoritativ** re-run; rot → Logs über den Rückkanal → `RE_GEN` innen; grün → Merge je Tier.

## Nicht verhandelbar

- Stationen **immer** als isolierte Subagenten (Anti-Kollusion §3.2) — `spec-to-tests` und `implement` dürfen nie dieselbe Instanz sein.
- Die zwei Stopps sind **hart**: du läufst nicht durch, du übergibst. Versuchst du es doch, fail-closed der CI-Anker und macht die Lücke sichtbar.
- Die **Merge-Autorität** hängt an serverseitigen Branch-Rules + server-berechnetem Tier — **nie** an deinem Wohlverhalten.
