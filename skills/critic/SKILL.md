---
name: critic
description: Adversarialer Review mit frischem Kontext, geprimt auf Widerlegung; liefert ein strukturiertes Verdikt (bei T3 zusätzlich Proposal-Prüfung). Einzelaufruf-Form; im orchestrierten Lauf spawnt /devloop:loop dies als isolierten Subagenten. Triggers; /devloop:critic, adversarialer Review, Verdikt gegen die Spec.
---

# /devloop:critic (Einzelaufruf)

Standalone-Form. Im orchestrierten Lauf nutze **`/devloop:loop`**.

Folge `agents/devloop-critic.md`: widerlege, dass die Arbeit fertig ist — nicht abgedeckte `REQ-`-IDs, Happy-Path-only, semantische Drift, überlebende Mutanten. Nur lesen. Bei T3 Security/Threat-Lens **und** Proposal-Prüfung (§6.6b). Output: strukturiertes Verdikt, im Zweifel `rejected` mit konkretem Befund.
