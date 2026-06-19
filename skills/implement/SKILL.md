---
name: implement
description: Implementiere gegen vorgegebene spec.md + Tests (erfinde sie nicht), im eigenen Worktree, öffne einen PR. Einzelaufruf-Form; im orchestrierten Lauf spawnt /devloop:loop dies als isolierten Subagenten. Triggers; /devloop:implement, gegen Spec implementieren, PR öffnen.
---

# /devloop:implement (Einzelaufruf)

Standalone-Form. Im orchestrierten Lauf nutze **`/devloop:loop`**.

Folge `agents/devloop-implement.md`: `spec.md` + Tests sind **Vorgabe** — nicht ändern. Geschützten Satz **nie** anfassen. Eigener Worktree/Identität, minimal implementieren, **PR** öffnen; Verdikt vom geschützten Runner. Rotes Verdikt = Defektsignal → Defekt beheben, nicht das Signal.
