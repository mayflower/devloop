# CODEOWNERS-Reihenfolge wie GitHub — Design

> devloop, Issue #32. Der Drift-Wächter `check-codeowners` und `init` suchen die CODEOWNERS in der
> Reihenfolge Root → `.github/` → `docs/`. GitHub nimmt `.github/` → Root → `docs/`; die erste
> gefundene gilt. Liegen zwei Dateien vor, prüft devloop eine andere Datei als die, nach der GitHub
> das Owner-Review verlangt. Status: **abgenommen** (2026-11-27).

## Ist-Zustand (main, 968c2f2)

- `src/core/spec-change.ts` exportiert `CODEOWNERS_PATHS = [".github/CODEOWNERS", "CODEOWNERS",
  "docs/CODEOWNERS"]` (GitHubs Reihenfolge). `readBaseCodeowners` nutzt sie; damit lesen Spec-,
  Config- und CODEOWNERS-Gate in `verify-review` schon die richtige Datei.
- `src/cli/check-codeowners.ts` (Drift-Wächter, Action-Schritt „Drift guard“) sucht mit einer
  eigenen Liste `["CODEOWNERS", ".github/CODEOWNERS", "docs/CODEOWNERS"]`.
- `src/core/init.ts` sucht mit derselben falschen Liste die bestehende CODEOWNERS, meldet deren
  Lücken in `notes` und führt sie in `skipped`.

Realer Pfad der Lücke (gemessen im Kritiker zu #14, A3b/A3c): Die Root-CODEOWNERS deckt
`services/**` (T2). Ein PR legt eine `.github/CODEOWNERS` ohne diese Deckung an. Der Drift-Wächter
liest weiter die Root-Datei und ist grün. Nach dem Merge gilt für GitHub die `.github/`-Datei, die
Lücke steht auf `main`. Das CODEOWNERS-Gate aus #14 fängt das erst beim nächsten T2/T3-PR.

## Entscheidung

Eine Quelle für die Reihenfolge: `check-codeowners` und `init` nutzen `CODEOWNERS_PATHS`. Keine
zweite Liste im Code.

## Begriffe

- **Wirksame CODEOWNERS:** die erste existierende Datei in der Reihenfolge `.github/CODEOWNERS`,
  `CODEOWNERS`, `docs/CODEOWNERS`.

## Anforderungen (EARS)

- **REQ-COORDER-1** *(ubiquitous)* — `check-codeowners` soll die wirksame CODEOWNERS des
  geprüften Baums lesen und ihren Pfad in `codeownersPath` ausgeben.
- **REQ-COORDER-2** *(unwanted)* — Wenn `.github/CODEOWNERS` existiert und einen T2/T3-Glob der
  tier-map nicht deckt, soll `check-codeowners` mit Exit 1 enden, auch wenn die Root- oder
  `docs/`-CODEOWNERS ihn deckt.
- **REQ-COORDER-3** *(ubiquitous)* — `init` soll für Meldungen zu einer bestehenden CODEOWNERS
  (`skipped`, Lücken in `notes`) die wirksame CODEOWNERS des Ziel-Repos verwenden.
- **REQ-COORDER-4** *(ubiquitous)* — Liegt nur eine CODEOWNERS vor, soll sich das Verhalten von
  `check-codeowners` und `init` nicht ändern.
- **REQ-COORDER-5** *(ubiquitous)* — `USAGE.md` soll beim Drift-Wächter die Suchreihenfolge nennen.

## Umsetzung (Skizze, nicht bindend)

- `CODEOWNERS_PATHS` in `check-codeowners.ts` und `init.ts` importieren, eigene Listen streichen.
- Versionssprung **v0.14.0** (verschärft: Repos mit zwei CODEOWNERS-Dateien können rot werden).

## Detektoren (Wirkung) und Mutationsproben

CLI-Tests gegen `dist/` in temporären Verzeichnissen, `init` über seine bestehende Testform.

| Fall | Erwartung | tötet Mutation |
|---|---|---|
| Root deckt `services/**` (T2), `.github/CODEOWNERS` ohne Deckung | `check-codeowners` Exit 1, `codeownersPath` endet auf `.github/CODEOWNERS`, `uncovered` nennt den Glob | alte Reihenfolge (Root zuerst) |
| `.github/CODEOWNERS` deckt, Root ohne Deckung | Exit 0, `codeownersPath` `.github/CODEOWNERS` | Root vor `.github/`; „alle Dateien vereinigen“ besteht, deshalb zusätzlich nächste Zeile |
| `.github/CODEOWNERS` ohne Deckung, `docs/CODEOWNERS` deckt | Exit 1 | „irgendeine Datei deckt“ (Vereinigung) |
| Root deckt, `docs/CODEOWNERS` ohne Deckung, kein `.github/` | Exit 0, `codeownersPath` `CODEOWNERS` | `docs/` vor Root |
| nur Root-CODEOWNERS (deckt / deckt nicht) | Exit 0 / Exit 1 wie bisher | — (REQ-COORDER-4) |
| `init` auf Repo mit Root-CODEOWNERS (deckt) und `.github/CODEOWNERS` (Lücke) | `skipped` enthält `.github/CODEOWNERS`, `notes` meldet die Lücke | alte Reihenfolge in `init` |
| `init` auf Repo nur mit Root-CODEOWNERS | `skipped` `CODEOWNERS`, keine neue Datei | — (REQ-COORDER-4) |

Mutationen werden im Implementierungs-PR gefahren und mit Ergebnis in der PR-Beschreibung
dokumentiert.

## Bekannte Grenzen (dokumentiert, keine eigene Runde)

- **Nach dem Update auf v0.14.0** ist der Drift-Wächter rot in Repos, die mehrere CODEOWNERS
  haben und deren `.github/`-Datei T2/T3-Pfade nicht deckt. Das ist genau die Lücke, die GitHub
  dort schon heute hat. Reparatur: die `.github/`-Datei ergänzen oder die überzählige löschen.
- **Was GitHub als existierende Datei zählt** (Symlink, Verzeichnis, leere Datei, Dateigröße) bildet
  devloop nicht nach; maßgeblich bleibt „existiert im Baum“.
