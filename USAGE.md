# devloop — Benutzungsanleitung

Wie du die agentische Dev-Loop-Kette in einem Ziel-Repo einsetzt. Voraussetzung: Plugin
installiert (siehe [README](./README.md)).

## Mentales Modell (in einem Absatz)

Eine lineare Kette `specify → spec-to-tests → implement → critic`, dirigiert vom Driver
`/devloop:loop`. Jede Station ist ein **isolierter Subagent mit frischem Kontext** (damit
z.B. der, der Tests schreibt, nicht der ist, der den Code schreibt). Der Driver hält an
**zwei harten Mensch-Stopps** an — **Spec-Review** und **T3-Merge** — und läuft dort nicht
durch, sondern übergibt an dich. Die Freigabe ist **server-autoritativ**: ein **Mensch per
GitHub-PR-Review** (CODEOWNERS), den der Agent technisch nicht fälschen kann. Lokal läuft die
innere Schleife schnell (Lichter aus, Gates advisorisch); die **Autorität** sitzt außen auf
CI + Branch-Protection.

---

## 1. Einmalig pro Ziel-Repo (Setup)

```
/devloop:init <pfad-zum-repo>
```

Das legt an: den CI-Workflow `devloop-precondition-check.yml` und das Config-Skeleton
`.devloop/{tier-map,protected-globs,bot-logins}.json`.

Danach **von Hand** (das ist der Anker, der Selbst-Freigabe verhindert):

1. **`devloop-precondition-check` als Required Status Check** in der Branch-Protection von
   `main` aktivieren.
2. **Branch Protection** für die Stopps:
   - *Require a review from Code Owners* (= der Spec-Review-/T3-Merge-Mensch).
   - *Dismiss stale pull request approvals when new commits are pushed* (= Content-Bindung:
     neuer Commit verwirft die Freigabe).
   - Den **Agenten von Approve/Merge ausschließen** (er darf nur vorschlagen).
3. **CODEOWNERS** für die Spec-Pfade setzen (der unabhängige Intent-Halter, §5.1).
4. Config ans Repo anpassen:
   - `.devloop/tier-map.json` — Wirkung→Tier (welche Pfade sind T3/T2/T1).
   - `.devloop/protected-globs.json` — der geschützte Satz (Gate-Configs, Thresholds, …).
   - `.devloop/bot-logins.json` — die GitHub-Login(s) **deines Agenten** (damit seine
     „Approvals" nie als Mensch zählen).
5. Sicherstellen, dass die **anderen drei Wächter** stehen: Mutation-Ratchet (Stryker),
   Semgrep-Fluchttür-Regeln, geschützter Satz (CODEOWNERS). Fehlt einer, **verweigert
   `/devloop:loop` zu Recht** den Auto-Loop (`check-guardians`).

> Prüfen, ob alle Wächter stehen: `devloop check-guardians <repo>` (exit 0 = bereit).

---

## 2. Ein Feature durchlaufen

```
/devloop:loop <feature-beschreibung>
```

Was passiert (der Driver gehorcht dabei dem getesteten Kern, trifft nichts selbst):

1. **Wächter-Vorbedingung** — fehlt ein Wächter → Stopp + Meldung (kein Auto-Loop).
2. **specify** (Subagent) → schreibt `spec.md` (User Story, EARS-Kriterien mit `REQ-`-IDs,
   vorläufiges Tier).
3. **▣ STOPP: Spec-Review** — der Driver beendet den Turn. **Du** (oder ein zweiter Mensch)
   reviewst die Spec und gibst sie per **GitHub-PR-Review** frei (s. §3).
4. **spec-to-tests** (eigener Subagent) → Test-Skeletons je `REQ-`-ID, nach EARS-Typ.
5. **implement** (eigener Subagent) → implementiert in der Sandbox gegen Spec+Tests, voller
   Gate-Satz läuft lokal **advisorisch**, öffnet einen **PR** auf den Feature-Branch.
6. **Gates auf CI** (autoritativ) — typecheck/lint/test, Mutation-Ratchet, Semgrep,
   `devloop-precondition-check`, Tier aus dem Diff. Rot → Defektsignal über `gh`-Rückkanal →
   neue `implement`-Runde (Rückkante, mit Max-Iter + Eskalation).
7. **critic** (eigener Subagent, adversarial) → strukturiertes Verdikt.
8. **Merge je Tier:** T0/T1 Auto-Merge bei grün · T2 required Reviewer · **▣ STOPP: T3-Merge**
   (Mensch + bewachte Aktion).

---

## 3. Die zwei Stopps — wie du freigibst (Anker b)

Der Driver kann sich **nicht selbst** freigeben. Eine Freigabe ist gültig nur als
**GitHub-PR-Review durch einen Menschen** (CODEOWNER), und nur auf den **aktuellen** Commit.

- **Spec-Review:** Die Spec liegt im PR (unter CODEOWNERS). Du prüfst sie und klickst auf
  GitHub **Approve**. `verify-review` auf CI bestätigt: ein Mensch (nicht Autor, nicht
  Agent-Bot) hat den aktuellen HEAD approved → der Driver darf weiter zu `spec-to-tests`.
- **T3-Merge:** Branch-Protection verlangt den CODEOWNER-Approve + grüne Checks; der Agent
  ist vom Merge ausgeschlossen. Du gibst frei → Merge.

Wird nach der Freigabe noch etwas geändert (neuer Commit), **verwirft GitHub die Freigabe**
(„dismiss stale approvals") → der Stopp greift erneut. So ist die Freigabe an den exakten
Stand gebunden.

> Das lokale `.devloop/*.approved`-Token + der lokale Merge-Hook sind nur **advisorische
> Schnellspur** für die innere Schleife — **nicht** die Autorität. Maßgeblich ist immer der
> GitHub-Review + die CI-Checks.

---

## 4. Einzelne Stationen ohne Orchestrierung

Jede Station gibt es auch als Einzel-Skill (ohne die harten Stopps), z.B. zum Üben:
`/devloop:specify`, `/devloop:spec-to-tests`, `/devloop:implement`, `/devloop:critic`.
Für den echten, abgesicherten Lauf nimm `/devloop:loop`.

---

## 5. Wenn der Driver verweigert oder eskaliert

- **„REFUSE_GUARDIANS"** — ein Wächter fehlt im Repo. Das ist kein Bug, sondern die
  eingebaute Sicherheit: ohne die Wächter wäre „mach das Gate grün" ein Gaming-Beschleuniger.
  Wächter nachrüsten (§1), dann erneut.
- **Eskalation** (Max-Iter / Stagnation / Gate-Tamper) — der Driver stoppt sauber und
  übergibt an den benannten Owner. Ein wiederholt rotes Gate ist selbst ein Signal (meist
  Spec-Unklarheit) — nicht endlos würgen lassen.
- **„Agent ändert das Gate statt den Code"** — ein Diff am geschützten Satz wird als
  Reward-Hacking-Alarm gewertet (`verify-review` / Protected-Set), nicht als Fortschritt.
