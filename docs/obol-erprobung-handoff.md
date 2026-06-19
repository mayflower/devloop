# Übergabe-Notiz: devloop-Erprobung gegen Obol

> Von der devloop-Session (`~/Code/devloop`) an den Obol-Agenten. Stand 2026-06-19.
> **Zweck:** koordinieren, wer wann was in `~/Code/obol` schreibt — Obol hat geteilten Zustand,
> devloop fasst Obol **nicht eigenmächtig** an.

## Worum es geht

devloop ist das gebaute, generische Plugin der agentischen Dev-Loop-Kette (`/devloop:specify
→ spec-to-tests → implement → critic` + Driver `/devloop:loop`, zwei harte Mensch-Stopps,
Rückkante, Wächter-Vorbedingung). Phasen A–D fertig, 80 Tests grün, lokal als Plugin
installiert. Wir wollen es jetzt **gegen Obol pilotieren** (Phase E). Quelle/Anleitung:
`~/Code/devloop` + `USAGE.md`.

## Befund: Obol ist fast bereit (read-only geprüft, nichts geschrieben)

`devloop check-guardians ~/Code/obol` → **3 von 4 Wächtern erkannt**, nur einer fehlt:

| Wächter | Status in Obol |
|---|---|
| mutation-ratchet | ✅ `stryker.config.json` |
| semgrep-escape-hatch | ✅ `tools/semgrep-escape-hatches.yml` (CI-Job `escape-hatches`) |
| protected-set | ✅ `.github/CODEOWNERS` |
| **precondition-check** | ❌ **fehlt** — der eine Anker, den devloop hinzufügt |

Obol ist darüber hinaus framework-nah: eigene `tier`- und `trace`-Jobs, Agent-GitHub-App-
Identität dokumentiert (PR #4), Branch-Protection-Setup vorhanden. Das passt gut zu **Anker
(b)** (server-autoritative Freigabe via Mensch-GitHub-Review; der Agent kann sich nicht selbst
freigeben).

> Hinweis: devloops Semgrep-Detektor wurde **an Obols realem Layout kalibriert** (er suchte
> vorher nur `.semgrep/`; jetzt erkennt er `tools/semgrep-*.yml` + CI-Aufruf). Das ist bereits
> im devloop-Repo committet — keine Obol-Änderung.

## Was devloop von Obol braucht (Anker b)

1. **Den `precondition-check`-CI-Job** (`verify-review`): prüft per `gh api`, ob ein **Mensch**
   (nicht der Agent-Bot, nicht der PR-Autor) den aktuellen HEAD approved hat, + Protected-Set-
   Check. Template: `~/Code/devloop/templates/ci-precondition-check.yml`. Wird von
   `/devloop:init` gelegt. Der Workflow muss die Zeichenkette `devloop-precondition-check`
   tragen (das macht ihn selbst zum erkennbaren Wächter).
2. **Branch-Protection** (großteils schon da — bitte bestätigen): Require CODEOWNER-Review +
   „dismiss stale approvals on push" + **Agent-Identität von Approve/Merge ausgeschlossen**.
3. **CODEOWNERS deckt die Spec-Pfade** (`**/spec.md` / Bounded-Context) — der unabhängige
   Intent-Halter für den Spec-Review-Stopp (§5.1).

## Zwei Integrationspunkte (bitte entscheiden)

1. **Tier-Map nicht duplizieren.** Obol hat `tools/tier-map.json` + `tools/derive-tier.ts`;
   devloops Template erwartet `.devloop/tier-map.json`. → Template auf Obols vorhandenes
   `tools/tier-map.json` zeigen lassen (wiederverwenden), statt eine zweite Quelle anzulegen.
2. **bot-logins.** Obols Agent-GitHub-App-Login (aus PR #4) gehört in
   `.devloop/bot-logins.json`, damit `verify-review` seine Reviews nie als Mensch zählt.

## Offene Integrationsfrage: wie kommt devloop in Obols CI?

devloop ist **noch nicht veröffentlicht** (Public-Push unter `mayflower` ist bewusst nach
grünem Pilot). Für die Pilot-CI braucht Obol die devloop-CLIs (`derive-tier`,
`verify-review`) — Optionen: als **git-Dependency** pinnen, das vorgebaute `dist/` **vendoren**,
oder einen Tarball pinnen. Das Template referenziert aktuell `node_modules/devloop/dist/...`.
→ Bitte wählen, was zu Obols pnpm/Corepack-Setup passt.

## Konkreter Ablauf (koordiniert)

1. **Abstimmen:** Wer fährt es, wann? Kein nebenläufiges Schreiben in Obol während des Laufs.
2. Auf einem **Feature-Branch** in Obol: `/devloop:init .` ausführen; das Template an Obols
   pnpm + vorhandenes `tools/tier-map.json` anpassen; `bot-logins.json` mit dem Agent-Login
   füllen; precondition-check als Required Check registrieren.
3. **PR öffnen**, CODEOWNER (Mensch) reviewt — das ist zugleich der erste echte Test des
   Spec-Review-/Merge-Stopps unter Anker (b).
4. Dann ein kleines, **reversibles** Feature durch `/devloop:loop` schicken.

## Was der Pilot misst (§1.1/§12 — nicht freihändig setzen)

- **Max-Iterationen** bis Eskalation und das **Fortschritts-Kriterium** der Rückkante (in
  devloop `loop.ts` als *injizierte* Parameter, kein Code-Default — der Pilot liefert die
  Zahlen).
- Greifen die zwei Stopps? Spawnt der Driver isolierte Subagenten? Erzeugt er nichts inline?
  Verweigert er bei (künstlich) entferntem Wächter?

## Grenzen / Zusicherung der devloop-Seite

- Die devloop-Session schreibt **nicht** in `~/Code/obol` ohne dein Go.
- Befunde fließen zurück: Detektor-Kalibrierung + Pilot-Schwellen → devloop-Repo + Design-Doc
  (`2026-06-19-workflow-orchestration-design.md`, §9 „Pilot-Messung").
