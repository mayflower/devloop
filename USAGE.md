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
     **Wichtig (Spec-PR-Flow):** **nicht** die Per-Feature-Specs schützen (nur Governance wie
     `constitution.md`), sonst trippt jeder Spec-PR „protected-set-touched" und bräuchte einen
     Admin-Override statt eines normalen Reviews.
   - `.devloop/bot-logins.json` — die GitHub-Login(s) **deines Agenten** (damit seine
     „Approvals" nie als Mensch zählen).
5. **CODEOWNERS = das §9-Merge-Tor (wichtig).** CODEOWNERS muss decken:
   - das **Spec-Verzeichnis** (z.B. `/.specify/specs/`) → erzwingt den Spec-Review-Stopp, tier-unabhängig;
   - **alle T2/T3-Pfade aus deiner `tier-map`** (auth, migrations, contracts, `src/**`, …).
   So funktioniert §9 serverseitig: **T0/T1 berührt keine CODEOWNER-Pfade → kein Review nötig → Auto-Merge;
   T2/T3 berührt CODEOWNER-Pfade → required Review.** `verify-review` failt **nicht** auf „noch nicht
   approved" (sonst hinge ein veralteter FAILURE-Lauf, s. v0.2.4) — der T2/T3-Block kommt aus CODEOWNERS.
   > **Drift-Achtung:** Die **tier-map-T2/T3-Pfade müssen ⊆ CODEOWNER-Pfade** sein. Klafft das auseinander,
   > kann ein T2/T3-PR ohne Review auto-mergen. `verify-review` ist tier-bewusst (T0/T1 grün, Gate-Tamper +
   > Approval-Gültigkeit immer), erzwingt das „muss approved sein" aber **nicht** selbst — das tut CODEOWNERS.
   > **Erzwungen** wird die Alignment-Pflicht vom **Drift-Wächter** `check-codeowners` (Required Check, im
   > CI-Template): er failt, wenn ein T2/T3-tier-map-Pfad nicht von CODEOWNERS gedeckt ist (oder CODEOWNERS fehlt).
6. **Trace-/Coverage-Gate muss `.skip`'te Tests als Abdeckung zählen** (Regex über Quelltext).
   Davon hängt ab, dass der Spec-PR `main` grün hält. Wer das weghärtet, bricht das Spec-PR-Modell still.
7. Sicherstellen, dass die **anderen drei Wächter** stehen: Mutation-Ratchet (Stryker),
   Semgrep-Fluchttür-Regeln, geschützter Satz (CODEOWNERS). Fehlt einer, **verweigert
   `/devloop:loop` zu Recht** den Auto-Loop (`check-guardians`).
8. **`verify-unskip`** als Required Check auf dem Implementierungs-PR wiren (im CI-Template enthalten) —
   erzwingt, dass `implement` an Tests nur `.skip` entfernt.

> Prüfen, ob alle Wächter stehen: `devloop check-guardians <repo>` (exit 0 = bereit).

**Upgrade/Migration (z.B. v0.1 → v0.2):** `init` überschreibt **nichts** still. Den veralteten
Workflow zieht nur `init <repo> --force` nach; eine vorhandene `tools/tier-map.json` wird **nicht**
von einer Default-Map beschattet. **Lies die `notes` im init-Output.** Den Workflow selbst muss ein
**Mensch pushen** — eine Bot-GitHub-App ohne `workflows`-Permission wird beim Push auf
`.github/workflows/**` abgelehnt (gewolltes Sicherheitsverhalten: der Agent darf die Gates nicht ändern).

---

## 2. Ein Feature durchlaufen

```
/devloop:loop <feature-beschreibung>
```

Was passiert (Spec-PR-zuerst; der Driver gehorcht dem getesteten Kern, trifft nichts selbst):

1. **Wächter-Vorbedingung** — fehlt ein Wächter → Stopp + Meldung (kein Auto-Loop).
2. **specify** (Subagent) → `spec.md` (User Story, EARS-Kriterien mit `REQ-`-IDs, vorläufiges Tier).
3. **spec-to-tests** (eigener Subagent) → zu jeder `REQ-`-ID **vollständige, aber `.skip`'te** Tests
   (nach EARS-Typ). `main` bleibt grün (Trace zählt Skips, Vitest rötet nicht).
4. **Spec-PR öffnen** (`OPEN_SPEC_PR`) → Spec + geskippte Tests als eigener PR gegen `main`.
5. **▣ STOPP: Spec-Review** — der Driver beendet den Turn. **Du/ein zweiter Mensch** reviewst
   den Spec-PR (Spec *und* Tests zusammen) und gibst ihn per **GitHub-CODEOWNER-Review** frei (§3).
6. **Spec mergen** (`MERGE_SPEC_PR`) → Spec-PR nach `main`, `git pull`. `implement` baut auf `main`.
7. **implement** (eigener, isolierter Subagent) → entfernt **nur** das `.skip` und schreibt den
   Code (nie Tests ändern — `verify-unskip` prüft das). Voller Gate-Satz lokal advisorisch, öffnet
   den **Implementierungs-PR**.
8. **Gates auf CI** (autoritativ) — typecheck/lint/test, Mutation-Ratchet, Semgrep,
   `devloop-precondition-check`, `verify-unskip`, Tier aus dem Diff. Rot → Defektsignal über
   `gh`-Rückkanal → neue `implement`-Runde (Rückkante, Max-Iter + Eskalation).
9. **critic** (eigener Subagent, adversarial) → strukturiertes Verdikt.
10. **Merge je Tier:** T0/T1 Auto-Merge bei grün · T2 required Reviewer · **▣ STOPP: T3-Merge**.

> **Zwei PRs, zwei Mensch-Tore:** der **Spec-PR** (Schritt 5, Spec-Review §5.1) und der
> **Implementierungs-PR** (Schritt 10, Merge-Stopp §9). Beide sind echte CODEOWNER-Reviews (Anker b).

### Eine Spec ändern (Rückschleife)

SDD: **erst die Spec ändern, dann den Code regenerieren.** Läuft als *dieselbe* Kette auf einem
*bestehenden* Feature — die Stationen arbeiten amend-fähig:

1. `specify` lädt die `spec.md` und ändert gezielt die betroffenen `REQ-`-Kriterien (IDs **stabil** halten).
2. `spec-to-tests` fasst per `req-delta` **genau** die geänderten REQs an: neu → `.skip`'t; **geändert →
   Test ändern + wieder `.skip`'en** (sonst rötet der jetzt-aktive Test `main`); entfernt → Test weg.
3. Spec-PR auf `devloop/spec/<slug>` → Review → Merge.
4. `implement` entskippt die neuen + geänderten Tests, zieht den **Code** nach und entfernt **toten
   Code** für entfernte REQs. An Tests weiterhin nur `.skip` entfernen.

Die **Tests sind die Change-Propagation:** geänderte Tests röten genau den betroffenen Code; `implement`
macht sie grün. Beide Mensch-Tore + die Entskip-Naht gelten unverändert.

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
