# Befund: `verify-unskip` blockiert jede gewöhnliche neue Testdatei (v0.8.0) — Fix in v0.8.1

## Der Fehlalarm, live aufgelaufen

`src/cli/verify-unskip.ts` lief auf **jedem** PR des Ziel-Repos; die einzige Ausnahme war
`isSpecBranch(headBranch)` (`devloop/spec/*` → No-op). `TEST_FILE = /\.(test|spec)\.[jt]sx?$/`
erfasste **jede** Testdatei im Repo, und für neue Dateien gilt
`isAllowedTestEdit("", neu) === !hasActiveTest(neu)`.

Folge: **außerhalb eines `devloop/spec/*`-Branches konnte niemand eine gewöhnliche, aktive
Testdatei hinzufügen.** Aufgelaufen am bsk-PR #157, der ein reines Entwickler-Werkzeug
(`tools/dead-members`) mit 32 eigenen `node:test`-Tests beisteuert — mit devloop hat das nichts
zu tun. Verdikt: 5 × `"new test file contains an active (non-.skip) test"`, während der
Freigabe-Teil sauber `{"ok":true,"tier":"T1"}` meldete.

Die Ursache ist eine **Annahme**, keine Regel: der Wächter unterstellte, dass *alle* Tests im
Repo devloop-verwaltet sind. Die Naht (§11, Anti-Kollusion Test↔Code) soll aber nur die aus der
Spec abgeleiteten Tests schützen — die, die `spec-to-tests` geschrieben hat und `implement`
weder autoren noch ändern darf.

## Der Fix: verwaltete vs. gewöhnliche Testpfade

Neu: `.devloop/managed-tests.json` im Ziel-Repo — eine **Glob-Liste** der devloop-verwalteten
Testpfade. Nur für Treffer gilt die Naht; alles andere ist eine gewöhnliche Testdatei und wird
durchgelassen.

```jsonc
// .devloop/managed-tests.json — bare array oder { "globs": [...] }
["services/*/src/**/*.test.ts", "services/*/twin/**/*.test.ts"]
```

Drei Eigenschaften, die den Fix tragen:

1. **Konfigurationsdatei, nicht Branch-Name.** Ein Agent wählt seinen Branch-Namen selbst; eine
   branchnamen-gekoppelte Ausnahme wäre Selbstbedienung (dieselbe Schwäche hat die
   Semgrep-Fluchttür des Pilot-Repos an `devloop/spec/*`). `.devloop/**` steht dagegen im
   **geschützten Satz** (`protected-globs.json`) — `verify-review` failt bei jeder Berührung,
   **tier-unabhängig und vor** dem Unskip-Schritt.
2. **Basis-Ref entscheidet.** Die Liste wird zuerst aus `<base>:.devloop/managed-tests.json`
   gelesen: der auf dem geschützten Branch bereits gelandete Umfang gilt, ein PR kann die Naht
   also nicht für sich selbst lockern. Nur wenn die Datei auf `base` **nicht existiert**, zählt
   der Checkout (Adoptions-PR — und der berührt zwangsläufig den geschützten Satz).
3. **Fail-closed & rückwärtskompatibel.** Datei fehlt, ist leer, kein gültiges JSON, falsch
   geformt oder enthält Nicht-Strings → **jede** Testdatei ist verwaltet, also exakt das
   Verhalten vor v0.8.1. Kein bestehendes Ziel-Repo wird durch den Bump still lockerer. Eine
   **explizit leere** Liste (`[]`) wird respektiert — das ist eine bewusste Aussage in einer
   geschützten Datei.

`init` legt das Skeleton mit `globs: ["**"]` an (= heutiges Verhalten) und **notiert laut**,
dass es einzuengen ist. Der Ausgabe-JSON von `verify-unskip` nennt jetzt `managed` und
`managedSource` — ein grüner Lauf ist damit nie still ein entwaffneter.

## Was NICHT geändert wurde

Das bestehende `isSpecBranch`-No-op bleibt. Es ist dieselbe Schwäche (branchnamen-gekoppelt),
aber ein eigener Befund — hier zu ändern hieße, zwei Dinge in einem Diff zu vermischen.
