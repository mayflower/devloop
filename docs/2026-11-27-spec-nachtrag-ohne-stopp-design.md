# Spec-Nachträge ohne Anforderungsänderung laufen ohne Stopp — Design

> devloop, Issue #27. Heute stoppt jede spätere Spec-Änderung die Kette, auch eine neue Zeile in
> „Bekannte Grenzen“. In den Ketten zu #4, #12, #19/#20, #23 und #13 waren genau diese Stopps die
> teuren. Status: **Entwurf**, zur Abnahme.

## Ist-Zustand (main, f0b0bc1)

- **Globale Regel** (`~/.claude/CLAUDE.md`, Abschnitt „Specs“): Jede spätere Spec-Änderung wird vor
  dem Weiterlaufen zur Abnahme vorgelegt, auch ein kleines Nachschärfen.
- **devloop-Kette:** Eine Spec-Änderung läuft über `specify` (Amend-Modus) → `spec-to-tests` →
  Spec-PR auf `devloop/spec/<slug>` → Spec-Review-Stopp (`skills/resume/SKILL.md`, „Changes
  requested“). Einen Weg für reine Doku-Nachträge gibt es nicht.
- **CI:** Berührt ein PR einen Spec-Pfad, umgeht `verify-review` die T0/T1-Abkürzung und verlangt
  CODEOWNER-Deckung in der Basis (REQ-SPECGATE, #4). Ohne menschliches Approval auf dem HEAD mergt
  der PR nicht. Das gilt auch für den Impl-PR, wenn er die Spec mitändert.
- **`req-delta`** (`src/core/req-delta.ts`) liefert `{added, changed, removed}` der REQ-IDs zwischen
  zwei Spec-Ständen, bisher nur für `spec-to-tests` und `spec-to-twin`.

## Entscheidung

Zwei Klassen, und eine deterministische CLI entscheidet die Klasse, nicht der Agent:

- **Anforderungsänderung:** stopppflichtig wie heute.
- **Doku-Nachtrag:** läuft ohne Stopp weiter. Er steht in einem eigenen, gekennzeichneten Commit und
  im PR-Body unter einer festen Überschrift. Der Mensch sieht ihn beim Merge, und den Merge-Blick
  erzwingt CI bereits: Ein PR mit Spec-Pfad im Diff braucht ein menschliches Approval (#4).

Der Detektor ist bewusst **konservativ**. Was er nicht sicher als Nachtrag erkennt, gilt als
Anforderungsänderung und stoppt. Ein Fehlalarm kostet einen Stopp wie heute; ein Durchrutscher
kostet ein aufgeweichtes REQ. Deshalb fällt jede Zeile, die ein REQ nennt, in die stopppflichtige
Klasse, auch wenn sie nur in „Bekannte Grenzen“ steht.

## Begriffe

- **Abgenommener Stand:** die Spec-Fassung, die der Mensch zuletzt freigegeben hat. In der
  devloop-Kette ist das die Spec auf der Basis des Impl-PR (der Spec-PR ist gemergt). In der
  manuellen Kette ist es der Commit, auf dem die Abnahme erfolgte.
- **Nachtrags-Abschnitt:** ein Abschnitt (`##` oder tiefer), dessen Überschrift mit „Bekannte
  Grenzen“ oder „Folge-Issues“ beginnt. Unterabschnitte erben die Zugehörigkeit.
- **Geänderte Zeile:** eine Zeile, die im zeilenweisen Diff zwischen abgenommenem Stand und neuem
  Stand hinzukommt oder wegfällt. Leerzeilen zählen nicht.
- **Doku-Nachtrag:** eine Spec-Änderung, bei der jede geänderte Zeile in einem Nachtrags-Abschnitt
  liegt (im alten Stand für weggefallene, im neuen für hinzugekommene Zeilen), keine geänderte Zeile
  `REQ-` enthält, keine Überschrift hinzukommt, wegfällt oder sich ändert und `req-delta` leer ist.
- **Anforderungsänderung:** jede andere Spec-Änderung.

## Anforderungen (EARS)

- **REQ-NACHTRAG-1** *(event-driven)* — Wenn `spec-amend-class <alt> <neu>` zwei Spec-Stände
  bekommt, soll es `{"klasse":"nachtrag"|"anforderung"|"unveraendert","gruende":[…]}` auf stdout
  ausgeben und mit Exit 0 enden. `gruende` nennt bei `anforderung` jede auslösende Zeile mit
  Zeilennummer und Regel.
- **REQ-NACHTRAG-2** *(ubiquitous)* — Die Klasse soll `nachtrag` genau dann sein, wenn die Änderung
  ein Doku-Nachtrag nach den Begriffen oben ist, und `unveraendert`, wenn es keine geänderte Zeile
  gibt.
- **REQ-NACHTRAG-3** *(unwanted)* — Wenn eine geänderte Zeile in einem Nachtrags-Abschnitt `REQ-`
  enthält, soll die Klasse `anforderung` sein (Gegenprobe gegen eine Grenze, die ein REQ aufweicht).
- **REQ-NACHTRAG-4** *(unwanted)* — Wenn eine Überschrift hinzukommt, wegfällt oder umbenannt wird,
  soll die Klasse `anforderung` sein (kein Verschieben von Inhalt in einen Nachtrags-Abschnitt per
  Umbenennung).
- **REQ-NACHTRAG-5** *(unwanted)* — Wenn eine Eingabedatei fehlt oder nicht lesbar ist, soll die CLI
  mit Exit 2 und einer Meldung auf stderr enden, ohne Klasse auf stdout.
- **REQ-NACHTRAG-6** *(event-driven)* — Wenn die Klasse `nachtrag` ist, soll die Ausgabe zusätzlich
  `prBody` enthalten: einen Markdown-Block mit der festen Überschrift `## Spec-Nachträge (ohne
  Stopp)` und jeder hinzugekommenen Zeile wörtlich.
- **REQ-NACHTRAG-7** *(ubiquitous)* — `skills/loop/SKILL.md`, `skills/resume/SKILL.md` und
  `agents/devloop-specify.md` sollen den Nachtragsweg beschreiben: Klasse per CLI bestimmen, bei
  `nachtrag` eigener Commit mit Präfix `docs(spec-nachtrag):` auf dem laufenden Branch und
  `prBody`-Block in den PR-Body, ohne Stopp; bei `anforderung` der bisherige Weg mit Spec-Review-
  Stopp. Die Klasse wählt nie der Agent selbst.
- **REQ-NACHTRAG-8** *(ubiquitous)* — Der Abschnitt „Specs“ in `~/.claude/CLAUDE.md` soll die zwei
  Klassen und den Verweis auf die CLI tragen. Diese Datei liegt außerhalb des Repos; die Änderung
  wird dem Menschen als eigener Diff vorgelegt und erst nach seinem Okay geschrieben.

## Umsetzung (Skizze, nicht bindend)

- Kern `src/core/spec-amend.ts`: Zeilen-Diff (LCS reicht, Specs sind klein), Abschnittszuordnung je
  Zeile über die letzte Überschrift, `reqDelta` wiederverwenden.
- CLI `src/cli/spec-amend-class.ts`, Muster wie `req-delta`.
- Versionssprung **v0.12.0** (neue CLI, neue Kettenregel).

## Detektoren (Wirkung) und Mutationsproben

CLI-Tests gegen `dist/` mit echten Spec-Dateien im Temp-Verzeichnis.

| Fall | Erwartung | tötet Mutation |
|---|---|---|
| neue Zeile unter „Bekannte Grenzen“ ohne `REQ-` | `nachtrag`, `prBody` enthält die Zeile wörtlich | Klasse immer `anforderung` |
| neue Zeile unter „Folge-Issues“ | `nachtrag` | nur „Bekannte Grenzen“ erlaubt |
| Zeile in Unterabschnitt `###` von „Bekannte Grenzen“ | `nachtrag` | Zuordnung nur über `##` |
| neue Grenze nennt `REQ-X-4` | `anforderung`, Grund nennt die Zeile | `REQ-`-Prüfung entfernt |
| Grenze gestrichen (Zeile weg, kein `REQ-`) | `nachtrag` | jede weggefallene Zeile gilt als Anforderungsänderung |
| Wortlaut eines REQ geändert | `anforderung` | `req-delta` nicht ausgewertet |
| Zeile in „Begriffe“ oder „Detektoren“ geändert | `anforderung` | Abschnittsprüfung entfernt |
| REQ-Zeile aus „Anforderungen“ nach „Bekannte Grenzen“ verschoben | `anforderung` | weggefallene Zeilen dem neuen Stand zugeordnet |
| Überschrift „Detektoren“ in „Bekannte Grenzen 2“ umbenannt | `anforderung` | Überschriften-Prüfung entfernt |
| nur Leerzeilen geändert | `unveraendert` | Leerzeilen zählen |
| identische Dateien | `unveraendert` | — |
| alte Datei fehlt | Exit 2, stdout leer | Fehler als `unveraendert` geschluckt |
| Realfall #13: Spec vor und nach dem F3-Nachtrag (nennt REQ-CFGBASE-4) | `anforderung` | — (der F3-Nachtrag hätte also weiter gestoppt) |

Mutationen werden im Implementierungs-PR gefahren und mit Ergebnis in der PR-Beschreibung
dokumentiert. REQ-NACHTRAG-7 und 8 sind Doku; ihr Detektor ist die Abnahme des Diffs durch den
Menschen, kein Quelltext-Wächter.

## Bekannte Grenzen (dokumentiert, keine eigene Runde)

- **Aufweichen ohne REQ-Nennung:** Eine Grenze wie „X wird nicht geprüft“ ohne `REQ-` läuft als
  Nachtrag durch. Gegenprobe ist der Merge-Blick: Die Zeile steht wörtlich unter der festen
  Überschrift, und CI verlangt für jeden PR mit Spec-Pfad ein menschliches Approval (#4).
- **Missbrauch als Ablage:** Ein Agent kann eine unbequeme Lücke als Grenze eintragen, statt sie zu
  beheben. Heute fängt das der Stopp, danach nur der Merge-Blick. Die Abbruchbedingung der
  Critic-Kette bleibt unverändert.
- **Kein CI-Zwang auf Klasse oder PR-Body:** CI prüft nicht, ob eine Spec-Änderung auf dem Impl-PR
  ein Nachtrag ist oder ob der `prBody`-Block im PR steht. Das Approval-Erfordernis aus #4 bleibt die
  harte Grenze. Ein CI-Check `spec-amend-class` auf `devloop/<slug>` wäre ein Folge-Issue.
- **Status- und Ist-Zustand-Zeilen** zählen nicht als Nachtrag. Ein nachgezogener Ist-Zustand stoppt
  weiter; das ist der konservative Teil der Entscheidung.
