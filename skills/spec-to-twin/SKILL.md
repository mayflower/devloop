---
name: spec-to-twin
description: Erzeuge zu einer reviewten spec.md ein unabhängiges Verhaltens-Orakel (triviales Referenzmodell + REQ-getaggte Invarianten + Adapter + fast-check model-based Harness), .skip't, im geschützten Twin-Pfad — aus Domänen-Wahrheiten abgeleitet, NICHT aus den EARS-Kriterien abgeschrieben. Einzelaufruf-Form; im orchestrierten Lauf spawnt /devloop:loop dies als EIGENEN isolierten Subagenten, getrennt von spec-to-tests UND implement (Anti-Kollusion, eine Ebene höher). Optional (nur bei .devloop twin.enabled). Triggers; /devloop:spec-to-twin, Twin/Orakel aus Spec ableiten, Referenzmodell + Invarianten erzeugen.
---

# /devloop:spec-to-twin (Einzelaufruf)

Standalone-Form. Im orchestrierten Lauf (**`/devloop:loop`**) läuft dies als **eigener** Subagent — getrennt von `spec-to-tests` (sieht dessen Tests **nicht**) und von `implement`, damit das Korrektheits-**Orakel** nicht aus derselben Instanz stammt wie Tests oder Code (§11, eine Ebene höher).

Folge `agents/devloop-spec-to-twin.md`: nur gegen die **reviewte** `spec.md` (+ Contract), Output `.skip't` im geschützten Twin-Pfad (`<area>/twin/` aus `.devloop` `twin.area`) — Referenzmodell + REQ-getaggte Invarianten + Adapter (gegen den Contract) + fast-check `commands`/`modelRun` mit Randwert-Argumenten. **Aus Domänen-Wahrheiten abgeleitet, nicht aus den EARS-Kriterien abgeschrieben** (Anti-Re-Anchor). **Kein Produktcode.** Optional: läuft nur, wenn `.devloop` `twin.enabled`.
