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
   `gh` Head-Branch (→ spec/impl), State (offen/gemergt), `reviewDecision`, CI-Status und mappt sie
   auf `{phase, humanApprovals, reviewDecision, gateVerdict, done}`.
   - `done: true` → der PR ist schon gemergt, nichts zu tun.
3. **Tier** ableiten (`derive-tier --repo`) und mit dem rekonstruierten Teil zum `DriverState` mergen.
4. **Weiterlaufen:** `DriverState` an `next-action` geben und die Aktion ausführen — exakt wie im
   normalen Loop (`/devloop:loop`). Du fährst also mittendrin fort, ohne von vorn zu beginnen.

## „Changes requested" (Reject) = Rückkante

Hat der Mensch Änderungen angefordert, liefert `next-action`:
- **Impl-PR** (`devloop/<slug>`) → `RE_GEN`: lies die Review-Kommentare als **Defektsignal**
  (`gh pr view 42 --json reviews` / `gh api repos/<owner>/<repo>/pulls/42/comments`), gib sie in eine
  neue `implement`-Runde **auf demselben Branch/PR**, push → CI re-run → Review erneut anfordern.
- **Spec-PR** (`devloop/spec/<slug>`) → `SPAWN_STATION specify`: die Spec gemäß Review amenden
  (Rückschleife), dann `spec-to-tests` → Spec-PR aktualisieren → erneut Review.

Die zwei Mensch-Tore, die Entskip-Naht und das tier-gestufte Merge gelten unverändert — Resume ist
nur ein anderer **Einstieg** in dieselbe Maschine, kein Sonderpfad.
