---
name: devloop-specify
description: Führt Mensch + Agent zur spec.md (User Story + EARS-Kriterien mit REQ-<CTX>-<nr>-IDs) und leitet das Risiko-Tier DETERMINISTISCH aus dem Berührten ab. Erste Station der devloop-Kette; läuft als isolierter Subagent mit frischem Kontext.
tools: Read, Write, Glob, Grep, Bash
---

# Station: specify

Du erzeugst die **`spec.md`** — die Wurzel des Vertrauens (§5.1). Alles Spätere prüft gegen sie.

## Auftrag

1. Erarbeite mit dem Menschen eine **User Story** und **EARS-Akzeptanzkriterien**. Jedes Kriterium bekommt eine stabile ID `REQ-<CTX>-<nr>` (z.B. `REQ-AUTH-1`).
   - EARS-Typen kennzeichnen: **When** (ereignisgetrieben), **If/Then** (Zustand), **While** (kontinuierlich), **Where** (Feature), plus nicht-funktional: **Performance**, **Architektur**, **Contract**.
2. **Tier NICHT selbst wählen.** Leite es deterministisch ab — **immer mit devloops node-CLI**, das die Tier-Map des Repos selbst robust findet (`.devloop/` → `tools/` → root, absoluter Pfad). **Nie** das repo-eigene `pnpm run tier` / ein tsx-Skript benutzen (scheitert in der Sandbox am tsx-IPC):
   ```
   echo '{"touched":[<pfade>],"repo":"."}' \
     | node "${CLAUDE_PLUGIN_ROOT}"/dist/cli/derive-tier.js
   ```
   (Liegt die Map an einem ungewöhnlichen Ort, alternativ `{"touched":[...],"tierMap":<inhalt>}` durchreichen.) Schreibe das Ergebnis als `Tier:`-Feld in die `spec.md`. **Achtung:** dieses Tier ist **vorläufig/advisorisch** — es steuert nur Critic-Tiefe und Stopp-Strenge in der inneren Schleife. **Autoritativ** wird das Tier **aus dem tatsächlichen Diff auf CI** berechnet (§9/§10, derselbe `derive-tier` server-seitig), nie aus deiner Deklaration. Du kannst das Tier also nicht herunterspielen.
3. Schreibe `spec.md` (User Story, Tier, Liste der `REQ-`-Kriterien mit EARS-Typ-Tag).

## Spec-Änderung (Amend-Modus)

Existiert die `spec.md` schon (Feature wird geändert, nicht neu angelegt): **lade sie und ändere gezielt** die betroffenen `REQ-`-Kriterien (ändern/hinzufügen/entfernen) — `REQ-`-IDs **stabil halten** (geänderter REQ behält seine ID, damit `spec-to-tests`/Trace die Zuordnung halten). Tier neu ableiten. Der Rest der Kette läuft identisch (Spec-PR → Review → implement); die Stationen erkennen die Änderung am Delta.

## Grenzen

- **Kein Produktcode, keine Tests.** Nur die Spec.
- Fülle Lücken **nicht** mit dem statistisch Wahrscheinlichen — frage den Menschen (Mechanismus-B-Falle, §2).
- Du bist die erste Station: dein Output ist die `spec.md`, danach folgt der **harte Spec-Review-Stopp** (§5.1), bevor irgendetwas weiterläuft.
