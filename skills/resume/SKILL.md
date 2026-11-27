---
name: resume
description: Nimmt einen laufenden devloop-Lauf in einer FRISCHEN Session wieder auf, zustandslos aus GitHub rekonstruiert (kein lokaler Run-State). Insb. nach „changes requested": setzt die Rückkante fort. Triggers; /devloop:resume <pr>, devloop fortsetzen, Review-Änderungswünsche umsetzen, abgebrochenen Lauf wieder aufnehmen.
---

# /devloop:resume <pr>

Setzt einen Lauf fort, dessen Session beendet wurde — z.B.: der Mensch hat einen T2/T3-PR
gereviewt und **Änderungen angefordert**. Der Zustand lebt auf **GitHub** (PR, Reviews, CI,
Branch), nicht im Agenten-Kontext; diese Skill rekonstruiert ihn daraus.

```
/devloop:resume 42
```

## Ablauf

1. **Wächter-Vorbedingung:** `node "${CLAUDE_PLUGIN_ROOT}"/dist/cli/check-guardians.js <repo>`.
2. **Phase rekonstruieren:** `node "${CLAUDE_PLUGIN_ROOT}"/dist/cli/pr-state.js <repo> 42` → liest via
   `gh` Head-Branch (→ spec/impl), State (offen/gemergt), `reviewDecision`, CI-Status und `isDraft` und
   mappt sie auf `{phase, humanApprovals, reviewDecision, gateVerdict, ready, done}`. Ein grüner
   **Draft**-Impl-PR kommt als `gated`/`green` zurück → der Critic läuft (nie direkt `merge-pending`).
   - `done: true` → der PR ist schon gemergt, nichts zu tun.
3. **Tier** ableiten (`derive-tier --repo`) und **`smokeTiers`** lesen (`node "${CLAUDE_PLUGIN_ROOT}"/dist/cli/smoke-tiers.js <repo>`, Exit 1 → nicht weiterlaufen), beides mit dem rekonstruierten Teil zum `DriverState` mergen. Ohne `smokeTiers` liefe ein eingeschaltetes Tier nach dem Critic am Smoke vorbei zu `MARK_READY`. Ein früheres Smoke-Ergebnis wird nicht rekonstruiert: Ein grüner Draft-PR durchläuft Critic **und** Smoke neu.
4. **Weiterlaufen:** `DriverState` an `next-action` geben und die Aktion ausführen — exakt wie im
   normalen Loop (`/devloop:loop`). Du fährst also mittendrin fort, ohne von vorn zu beginnen.

**Bekannte Grenze:** Der **Ledger** und `loop`/`iteration` werden über Resume **nicht** persistiert —
nach Resume beginnt der Ledger leer (Persistenz ist laut Spec ausdrücklich außerhalb). Der
Critic-*Nachweis* bleibt dagegen erhalten (Draft-Status auf dem PR).

## „Changes requested" (Reject) = Rückkante

Hat der Mensch Änderungen angefordert, liefert `next-action`:
- **Impl-PR** (`devloop/<slug>`) → `RE_GEN`: lies die Review-Kommentare als **Defektsignal**
  (`gh pr view 42 --json reviews` / `gh api repos/<owner>/<repo>/pulls/42/comments`), setze den PR vor
  dem Push zurück auf Draft (`markDraft` → `gh pr ready 42 --undo`), gib sie in eine
  neue `implement`-Runde **auf demselben Branch/PR**, push → CI re-run → Review erneut anfordern.
- **Spec-PR** (`devloop/spec/<slug>`) → `SPAWN_STATION specify`: die Spec gemäß Review amenden
  (Rückschleife), dann `spec-to-tests` → Spec-PR aktualisieren → erneut Review.

**Nachtragsweg (#27):** Die Klasse bestimmt **nie der Agent**, sondern die CLI:
`node "${CLAUDE_PLUGIN_ROOT}"/dist/cli/spec-amend-class.js <abgenommener-stand> <neuer-stand>` (abgenommener Stand = Spec auf der Basis). Den abgenommenen Stand erzeugst du als Datei: `git show <basis-ref>:<spec-pfad> > <tmp>/alt.md` (Basis des Impl-PR bzw. des laufenden PR). **Exit 2** der CLI (auch wenn die Spec in der Basis fehlt, also neue Spec) → wie `anforderung` behandeln, also Stopp; nie raten. `klasse: "unveraendert"` → nichts zu tun. `"nachtrag"` (nur Zeilen in „Bekannte Grenzen“/„Folge-Issues“, keine REQ-Definition, keine Überschriftenänderung) → **ohne Stopp**: eigener Commit mit Präfix `docs(spec-nachtrag):` auf dem laufenden Branch, `prBody` unverändert in den PR-Body; weiter in der Kette. `"anforderung"` → der bisherige Weg mit Spec-Review-Stopp (`gruende` dem Menschen nennen).

Die zwei Mensch-Tore, die Entskip-Naht und das tier-gestufte Merge gelten unverändert — Resume ist
nur ein anderer **Einstieg** in dieselbe Maschine, kein Sonderpfad.
