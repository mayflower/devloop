# CODEOWNERS-Deckung gegen die Basis prüfen — Design

> devloop, Issue #14. Der Drift-Wächter `check-codeowners` liest CODEOWNERS und tier-map aus dem
> PR-HEAD. GitHub verlangt das CODEOWNER-Review aber nach der CODEOWNERS der **Basis**. Ein PR,
> der sich die Deckung selbst einträgt, besteht den Wächter, ohne dass GitHub ein Review eines
> Owners verlangt. Status: **Entwurf**, zur Abnahme.

## Ist-Zustand (main, 2ae0a1f)

- `check-codeowners .` (Action-Schritt „Drift guard“) prüft: Jeder T2/T3-Glob der HEAD-tier-map ist
  von der HEAD-CODEOWNERS gedeckt, sonst Exit 1.
- `verify-review` verlangt für T2/T3 ein menschliches Approval auf dem HEAD. **Jeder** Mensch zählt
  (nicht Bot, nicht Autor); die Action setzt keine Owner-Liste (`humanReviewers`).
- Das Tier kommt seit #13 aus der Basis-tier-map. Spec- und Config-Änderungen prüfen ihre Pfade
  schon gegen die Basis-CODEOWNERS (`spec-unguarded`, `config-unguarded`).
- `**/CODEOWNERS` steht im Protected-Skeleton. Hat das Ziel-Repo es übernommen, fängt der
  Gate-Tamper-Check eine CODEOWNERS-Änderung ab.

Realer Pfad der Lücke: Die Basis deckt `services/**` (T2) nicht. Ein PR ändert `services/a.ts` und
trägt `services/** @x` in die CODEOWNERS ein. Der Drift-Wächter ist grün. GitHub verlangt kein
Owner-Review, `verify-review` nur irgendein menschliches Approval. Ein beliebiger Mensch mit
Schreibrecht kann den T2-PR freigeben.

## Entscheidung

Das Issue schlägt vor, `check-codeowners` ganz auf die Basis umzustellen. Das hat zwei Preise:

1. **Drift kommt unbemerkt nach `main`:** Ein PR, der der tier-map einen T2-Pfad hinzufügt, ohne
   CODEOWNERS nachzuziehen, ist gegen die Basis grün (dort gibt es den Pfad noch nicht). Nach dem
   Merge ist jeder folgende PR rot.
2. **Reparatur sperrt sich selbst:** Hat die Basis schon eine Lücke, ist auch der PR rot, der sie
   schließt. Er kommt nur per Admin-Override nach `main`.

**Vorschlag: zwei Prüfungen statt einer.**

- **(A) Drift-Wächter bleibt auf dem HEAD**, wie heute: Er schützt `main` vor einer Lücke nach dem
  Merge.
- **(B) Neu: Wirksamkeit gegen die Basis.** Berührt ein PR einen Pfad, dessen Tier nach der
  Basis-tier-map T2 oder T3 ist, muss die Basis-CODEOWNERS genau diesen Pfad decken, sonst
  `codeowners-unguarded`. Das ist die Frage, die für **diesen** PR zählt: Verlangt GitHub ein
  Owner-Review? Ein Reparatur-PR, der nur CODEOWNERS ändert, berührt keinen T2/T3-Pfad und bleibt
  frei.

(B) gehört nach `verify-review`, neben das Spec- und das Config-Gate. Dort liegen Diff-Pfade, Basis
und Basis-CODEOWNERS schon vor.

## Begriffe

- **Basis-tier-map, Basis-CODEOWNERS, Erstaufnahme:** wie in #13 und #4.
- **Pfad-Tier:** das Tier eines einzelnen Pfads nach der Basis-tier-map (`deriveTier([pfad], …)`,
  ungematchte Pfade bekommen den Default der Map).
- **Review-pflichtiger Pfad:** ein Pfad im Diff des PR (Diff wie in REQ-SPECGATE-9) mit Pfad-Tier T2
  oder T3.

## Anforderungen (EARS)

- **REQ-COBASE-1** *(unwanted)* — Wenn ein PR einen review-pflichtigen Pfad berührt, den die
  Basis-CODEOWNERS nicht deckt, und keine Erstaufnahme vorliegt, soll `verify-review` mit
  `ok:false` und einem Grund mit Präfix `codeowners-unguarded:` enden, der jeden ungedeckten Pfad
  nennt.
- **REQ-COBASE-2** *(ubiquitous)* — Für REQ-COBASE-1 soll `verify-review` tier-map und CODEOWNERS
  ausschließlich aus der Basis lesen, nie aus dem PR-HEAD oder dem Arbeitsbaum. Eine Deckung, die
  nur im HEAD steht, zählt nicht.
- **REQ-COBASE-3** *(unwanted)* — Wenn die Basis-CODEOWNERS fehlt oder unlesbar ist und der PR einen
  review-pflichtigen Pfad berührt (keine Erstaufnahme), soll `verify-review` mit
  `codeowners-unguarded:` enden.
- **REQ-COBASE-4** *(state-driven)* — Solange eine Erstaufnahme vorliegt, soll REQ-COBASE-1 nicht
  greifen.
- **REQ-COBASE-5** *(ubiquitous)* — Ein PR, der nur T0/T1-Pfade berührt, soll sich nicht anders
  verhalten als bisher, auch wenn die Basis-CODEOWNERS Lücken hat (Reparatur-PR bleibt möglich).
- **REQ-COBASE-6** *(ubiquitous)* — Der Drift-Wächter `check-codeowners` soll weiter tier-map und
  CODEOWNERS des PR-HEAD prüfen; sein Verhalten ändert sich nicht.
- **REQ-COBASE-7** *(ubiquitous)* — Die Reihenfolge in `verify-review` soll sein: Tamper →
  Spec-Gate → Config-Gate → CODEOWNERS-Gate (REQ-COBASE-1) → Tier/Approval. Ein
  `codeowners-unguarded` endet hart (`ok:false`), nie als `pending`.
- **REQ-COBASE-8** *(ubiquitous)* — `USAGE.md` und `skills/init/SKILL.md` sollen beide Prüfungen
  beschreiben: der Drift-Wächter auf dem HEAD, die Wirksamkeit gegen die Basis.

## Umsetzung (Skizze, nicht bindend)

- Basis-tier-map über dieselbe Kandidatensuche wie `derive-tier` mit `baseRef` (#13), als Kern-
  funktion geteilt statt dupliziert.
- Deckung über `uncoveredByCodeowners(paths, readBaseCodeowners(repo, baseRef))`.
- Ohne `baseRef` (lokaler Aufruf) greift REQ-COBASE-1 nicht; die Action übergibt `baseRef` immer.
- Versionssprung **v0.13.0** (verschärft: T2/T3-PRs brauchen Basis-Deckung).

## Detektoren (Wirkung) und Mutationsproben

CLI-Tests gegen `dist/` in temporären Git-Repos mit echter Basis, Action-Tests im Clone wie
`actions/checkout` (detached, nur `origin/<base>`).

| Fall | Erwartung | tötet Mutation |
|---|---|---|
| Basis deckt `services/**` nicht, PR ändert `services/a.ts` (T2) und trägt die Deckung in HEAD-CODEOWNERS ein | `codeowners-unguarded`, nennt `services/a.ts` | CODEOWNERS aus HEAD |
| dto., Basis deckt `services/**` | weiter zu Tier/Approval (`pending` ohne Review) | Gate immer rot |
| Basis-tier-map: `services/**` T2; HEAD-tier-map stuft auf T1 herab; Basis ohne Deckung | `codeowners-unguarded` | tier-map aus HEAD |
| PR ändert nur T1-Pfade, Basis-CODEOWNERS deckt T2-Pfade nicht | Verhalten wie bisher (`ok:true` bei T1) | Gate prüft tier-map-Globs statt Diff-Pfade |
| Reparatur-PR: ändert nur `.github/CODEOWNERS`, Basis hat Lücke | kein `codeowners-unguarded` | dto. |
| ungematchter Pfad, Default der Basis-tier-map T2, Basis ohne Deckung | `codeowners-unguarded` | Default-Tier ignoriert |
| Basis ohne CODEOWNERS, PR berührt T2-Pfad, keine Erstaufnahme | `codeowners-unguarded` | fehlende CODEOWNERS als „gedeckt“ |
| Erstaufnahme, PR berührt T2-Pfad, Basis ohne CODEOWNERS | kein `codeowners-unguarded` | Erstaufnahme nicht ausgenommen |
| T2-Pfad ungedeckt, kein Review | `ok:false` (nicht `pending`) | Gate hinter die Approval-Bewertung gezogen |
| Action: Fall 1 im checkout-artigen Clone | Schritt rot | `baseRef` nicht übergeben |
| `check-codeowners` HEAD-tier-map mit ungedecktem T2-Glob | Exit 1 wie bisher | — (REQ-COBASE-6) |

Mutationen werden im Implementierungs-PR gefahren und mit Ergebnis in der PR-Beschreibung
dokumentiert.

## Bekannte Grenzen (dokumentiert, keine eigene Runde)

- **Owner-Liste beim Approval:** `verify-review` prüft weiter nicht, ob der Approver ein Owner ist.
  Das erzwingt GitHub über die Basis-CODEOWNERS, sobald (B) die Deckung sichert, vorausgesetzt die
  Branch-Protection verlangt CODEOWNER-Reviews (wie in #4).
- **Nach dem Update auf v0.13.0** ist jeder T2/T3-PR rot, dessen Pfade die Basis-CODEOWNERS nicht
  decken. Der Drift-Wächter verhindert solche Lücken seit jeher auf dem HEAD; rot wird es nur in
  Repos, die schon mit Lücke auf `main` stehen. Reparatur über einen PR, der nur CODEOWNERS ändert. Steht `**/CODEOWNERS` im Protected-Set des
  Repos, scheitert dieser PR wie bisher am Gate-Tamper-Check; das ändert #14 nicht.
- **CODEOWNERS-Matching** (großzügig, Owner ohne Schreibrecht, `@OWNER`-Platzhalter) gilt wie in #4.
