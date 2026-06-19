---
name: spec-to-tests
description: Erzeuge zu jeder REQ-ID einer reviewten spec.md mindestens ein getaggtes Test-Skeleton, geroutet nach EARS-Typ. Einzelaufruf-Form; im orchestrierten Lauf spawnt /devloop:loop dies als EIGENEN isolierten Subagenten (Anti-Kollusion). Triggers; /devloop:spec-to-tests, Tests aus Spec ableiten, EARS zu Tests.
---

# /devloop:spec-to-tests (Einzelaufruf)

Standalone-Form. Im orchestrierten Lauf (**`/devloop:loop`**) läuft dies als **eigener** Subagent — getrennt von `implement`, damit Tests und Code nicht aus derselben Instanz stammen (§11 #3).

Folge `agents/devloop-spec-to-tests.md`: nur gegen die **reviewte** `spec.md`, je `REQ-`-ID ≥1 getaggtes Skeleton, geroutet nach EARS-Typ (When/If/While→Vitest/fast-check · Performance→bench · Architektur→ArchUnitTS · Contract→AsyncAPI/PACT). **Kein Produktcode.**
