# `.devloop/`-Config: Die Basis entscheidet, Änderungen brauchen ein Review — Design

> devloop, Issue #13. Die Precondition-Action liest `tier-map.json`, `protected-globs.json` und
> `bot-logins.json` aus dem PR-HEAD. Ein Bot-PR kann sich damit die Regeln, nach denen er geprüft
> wird, selbst setzen. `init.ts` behauptet im Kommentar, `.devloop/` sei geschützt; das stimmt nicht.
> Status: **abgenommen** (2026-11-27), inklusive Review-Pflicht für Config-Änderungen über reines (b) hinaus.

## Ist-Zustand (main, d251efb)

Wer liest welche Config in der Precondition-Action (`.github/actions/precondition-check/action.yml`):

| Datei | gelesen aus | Stelle |
|---|---|---|
| `tier-map.json` (`.devloop/` → `tools/` → Root) | PR-HEAD | `derive-tier` mit `repo:"."` (Schritt „Compute the AUTHORITATIVE tier“) |
| `.devloop/protected-globs.json` | PR-HEAD | `cat` im Schritt „Verify HUMAN approval“ |
| `.devloop/bot-logins.json` | PR-HEAD | `cat` im selben Schritt |
| `.devloop/spec-globs.json` | Basis | `specGlobs` (REQ-SPECGATE-8, #4) |
| `.devloop/managed-tests.json` | Basis, nur bei Fehlen in der Basis aus dem Arbeitsbaum | `verify-unskip` |
| `tier-map.json` + CODEOWNERS im Drift-Wächter | PR-HEAD | `check-codeowners` (#14, nicht hier) |

Realer Pfad in jedem per `/devloop:init` eingerichteten Repo (Skeletons aus `src/core/init.ts`):

1. Ein Bot-PR leert `.devloop/protected-globs.json` und ändert `stryker.conf.json`.
2. Der Gate-Tamper-Check sieht die leere HEAD-Liste und schlägt nicht an.
3. `stryker.conf.json` fällt in der Skeleton-tier-map nur unter `**` → T1. `verify-review` gibt T1
   ohne Approval frei.
4. Die von `init` angelegte CODEOWNERS deckt nur T2/T3-Pfade. GitHub verlangt kein Review.
5. Der PR mergt per Auto-Merge. Der Mutations-Gate ist ohne Mensch abgeschwächt.

Gleiches Muster: tier-map im PR herabstufen (eigener PR wird T1); Bot-Login aus `bot-logins.json`
entfernen (Bot-Approval zählt als menschlich).

## Entscheidung zu den Varianten aus dem Issue

- **(a) `.devloop/**` ins Protected-Skeleton:** Jede Config-Änderung scheitert am Gate-Tamper-Check
  und braucht einen Admin-Override. Nicht bedienbar.
- **(b) alles aus der Basis lesen:** schließt die Selbstanwendung im **eigenen** Lauf. Reicht allein
  aber nicht: Ein T1-PR, der nur `.devloop/protected-globs.json` leert, mergt ohne Review, und **der
  nächste** PR läuft schon mit der leeren Liste.

**Vorschlag: (b) plus Review-Pflicht für Config-Änderungen**, nach dem Muster der Spec-Änderungen aus
#4. Eine Config-Änderung umgeht die T0/T1-Abkürzung, und die CODEOWNERS der Basis müssen jeden
geänderten Config-Pfad decken. Dann verlangt GitHub serverseitig das Review eines Menschen. Kein
Admin-Override, kein harter Fail ohne Approval (kein v0.2.4-Effekt, siehe #4).

## Begriffe

- **Config-Pfad:** ein Pfad unter `.devloop/` oder einer der tier-map-Kandidaten außerhalb davon
  (`tools/tier-map.json`, `tier-map.json`).
- **Config-Änderung:** ein PR, dessen Diff mindestens einen Config-Pfad enthält (hinzugefügt,
  geändert, gelöscht, Rename-Quelle oder -Ziel; Diff wie in REQ-SPECGATE-9).
- **Erstaufnahme:** Die Basis enthält keinen einzigen Config-Pfad. Das ist der PR, der devloop
  einrichtet; in der Basis gibt es dann nichts, was geschützt werden könnte.
- **Basis-Config:** der Inhalt einer Config-Datei im Basis-Ref (`origin/<base>`), gelesen per
  `git show`, nie aus dem Arbeitsbaum.
- **Basis-CODEOWNERS:** wie in #4 (`.github/CODEOWNERS`, `CODEOWNERS`, `docs/CODEOWNERS` der Basis,
  erste gefundene gilt).

## Anforderungen (EARS)

- **REQ-CFGBASE-1** *(ubiquitous)* — Die Precondition-Action soll das Tier mit der tier-map der
  Basis berechnen (Suchreihenfolge `.devloop/` → `tools/` → Root, angewandt auf die Basis). Ein PR,
  der die tier-map ändert, soll mit der tier-map der Basis eingestuft werden.
- **REQ-CFGBASE-2** *(ubiquitous)* — `verify-review` soll in der Action die Protected-Globs und die
  Bot-Logins der Basis verwenden. Ein PR, der `protected-globs.json` leert oder `bot-logins.json`
  ändert, soll in seinem eigenen Lauf nach den Basis-Listen geprüft werden.
- **REQ-CFGBASE-3** *(unwanted)* — Wenn eine Basis-Config-Datei existiert, aber unlesbar ist (kein
  gültiges JSON, falsche Form, kein reguläres Blob), soll der Check fehlschlagen (fail-closed). Es
  gibt keinen Rückfall auf den PR-HEAD.
- **REQ-CFGBASE-4** *(state-driven)* — Solange die Basis eine einzelne Config-Datei nicht enthält,
  soll die Action sie aus dem PR-HEAD lesen (wie heute; bei der tier-map: Kandidat aus dem HEAD,
  wenn die Basis keinen hat). Ein solcher PR fügt die Datei hinzu und ist damit eine
  Config-Änderung (REQ-CFGBASE-5), außer bei Erstaufnahme.
- **REQ-CFGBASE-5** *(event-driven)* — Wenn ein PR eine Config-Änderung ist und keine Erstaufnahme,
  soll `verify-review` die T0/T1-Abkürzung nicht anwenden und die Approval wie ab T2 bewerten
  (gültige menschliche Approval auf HEAD → `ok:true`; keine → `ok:true, pending:true`; ungültige →
  `ok:false`).
- **REQ-CFGBASE-6** *(unwanted)* — Wenn bei einer Config-Änderung (keine Erstaufnahme) ein
  Config-Pfad von keinem Eintrag der Basis-CODEOWNERS gedeckt ist oder die Basis keine CODEOWNERS
  hat, soll `verify-review` mit `ok:false` und `reason` beginnend mit `config-unguarded`
  fehlschlagen und die ungedeckten Pfade nennen.
- **REQ-CFGBASE-7** *(ubiquitous)* — Ein PR ohne Config-Änderung soll sich bis auf REQ-CFGBASE-1/2
  (Quelle der Config) genau wie bisher verhalten.
- **REQ-CFGBASE-8** *(event-driven)* — Wenn `/devloop:init` eine CODEOWNERS anlegt, soll sie
  `/.devloop/` (und einen tier-map-Pfad außerhalb von `.devloop/`, falls die tier-map dort liegt)
  mit dem Platzhalter-Owner enthalten. Existiert eine CODEOWNERS, die diese Pfade nicht deckt, soll
  `init` das in `notes` melden.
- **REQ-CFGBASE-9** *(ubiquitous)* — Kommentare, die `.devloop/` als geschützt bezeichnen
  (`src/core/init.ts`, `src/core/managed-tests.ts`, `src/cli/verify-unskip.ts`), sollen den
  tatsächlichen Mechanismus beschreiben (Basis liest, CODEOWNERS-Review).

## Umsetzung (Skizze, nicht bindend)

- Kern: `src/core/config-change.ts` mit `CONFIG_GLOBS`, `isConfigChange(diffPaths)`,
  `isInitialAdoption(repo, baseRef)`; Basis-Lesen über `readBaseFile` aus `spec-change.ts`.
- `derive-tier` bekommt optional `baseRef` und sucht die tier-map in der Basis.
- `verify-review` liest `protectedGlobs`/`botLogins` selbst aus der Basis, wenn `baseRef` gesetzt
  ist; die stdin-Werte bleiben für den lokalen Aufruf ohne `baseRef`.
- `action.yml`: die beiden `cat` entfallen; `derive-tier` bekommt `baseRef`.
- Versionssprung **v0.11.0** (verschärft: Config-Änderungen brauchen Basis-CODEOWNERS-Deckung).
- Doku: `USAGE.md` und `skills/init/SKILL.md` — `/.devloop/` in CODEOWNERS eintragen.

## Detektoren (Wirkung) und Mutationsproben

CLI-Tests gegen `dist/` in temporären Git-Repos mit echter Basis (`git show`, keine Attrappe). Die
Action-Tests bauen den Clone **wie `actions/checkout`**: detached auf HEAD, kein lokaler `main`, nur
`origin/<base>` (vgl. #17), damit ein `baseRef` ohne `origin/` rot wird.

| Fall | Erwartung | tötet Mutation |
|---|---|---|
| Action: Basis-tier-map `src/** → T3`, PR stuft in HEAD auf T1 und ändert `src/a.ts` | Tier T3 | tier-map aus HEAD |
| Action: Basis-tier-map nur unter `tools/`, HEAD legt `.devloop/tier-map.json` mit T1 an | Tier aus `tools/` der Basis | Suchreihenfolge im HEAD statt in der Basis |
| Action: Basis-protected-globs enthält `**/stryker.conf.*`, PR leert die Liste und ändert `stryker.conf.json` | rot, `protected-set-touched` | protected-globs aus HEAD |
| Action: Basis-bot-logins `["bot"]`, PR leert die Liste, Approval von `bot` auf HEAD, Tier T2 | rot | bot-logins aus HEAD |
| Basis-`protected-globs.json` = `{` | rot | Parse-Fehler still auf HEAD/leer |
| T1, PR ändert nur `.devloop/protected-globs.json`, Basis-CODEOWNERS ohne `/.devloop/` | `config-unguarded` | Config-Erkennung entfernt |
| dto. mit Deckung, keine Reviews | `ok:true, pending:true` | — (Gegenprobe gegen harten Fail) |
| dto. mit Deckung, Approval auf altem SHA | `ok:false` | T0/T1-Abkürzung vor der Approval-Bewertung belassen |
| T1, PR legt `tools/tier-map.json` an, Basis hat `.devloop/tier-map.json` | Config-Änderung | Config-Pfade nur unter `.devloop/` |
| T1, PR legt `.devloop/spec-globs.json` neu an, Basis hat andere `.devloop/`-Dateien | Config-Änderung (`config-unguarded` ohne Deckung) | nur geänderte, nicht hinzugefügte Dateien zählen |
| Erstaufnahme: Basis ohne jeden Config-Pfad, PR legt Skeletons an | kein `config-unguarded`, Tier aus HEAD-tier-map | Erstaufnahme nicht erkannt |
| Basis hat `.devloop/`, aber keine `bot-logins.json`; PR fügt sie hinzu | Liste aus HEAD, Config-Änderung | — |
| T1, `src/a.ts`, keine Config-Pfade | `ok:true` wie bisher | Config-Bedingung immer wahr |
| Basis-CODEOWNERS ohne `/.devloop/`, HEAD-CODEOWNERS mit | `config-unguarded` | CODEOWNERS aus HEAD |
| `init` ohne CODEOWNERS | angelegte Datei enthält `/.devloop/` | — |
| `init` mit CODEOWNERS ohne `/.devloop/` | Hinweis in `notes` | — |

Mutationen werden im Implementierungs-PR gefahren und mit Ergebnis in der PR-Beschreibung dokumentiert.

## Bekannte Grenzen (dokumentiert, keine eigene Runde)

- **Lokale Leser bleiben beim Arbeitsbaum:** `smoke-tiers`, der PreToolUse-Hook und `/devloop:loop`
  lesen `.devloop/config.json` lokal. Das ist der Orchestrator selbst, kein Prüfpunkt gegen ihn;
  die CI-Kette entscheidet.
- **`check-codeowners`** liest tier-map und CODEOWNERS weiter aus dem HEAD (#14).
- **Nach dem Update auf v0.11.0 ist die erste Config-Änderung rot**, bis `/.devloop/` in der
  CODEOWNERS der Basis steht. Fail-closed und dokumentiert, `init` meldet die Lücke.
- **`managed-tests.json` fehlt in der Basis:** Der Rückfall auf den Arbeitsbaum in `verify-unskip`
  bleibt. Der PR, der sie hinzufügt, ist jetzt eine Config-Änderung und braucht ein Review.
- **Owner ohne Schreibrecht, `@OWNER`-Platzhalter, großzügiges CODEOWNERS-Matching und
  Branch-Protection** gelten wie in #4 dokumentiert.
- **`.devloop` als Symlink in der Basis:** Ersetzt ein PR `.devloop/` durch einen Symlink, ist das
  eine Config-Änderung und braucht ein CODEOWNER-Review. Ist er gemergt, gibt es in der Basis keinen
  Config-Pfad mehr als Blob unter `.devloop/`. Jeder spätere PR gilt dann als Erstaufnahme
  (REQ-CFGBASE-4), und der Config-Gate greift nicht mehr. Voraussetzung ist ein menschlich
  approvter Merge. Es ist also kein Umgehungspfad ohne Review, sondern ein Rückbau, den der Owner
  mitträgt. Ein eigenes REQ dafür (`.devloop` in der Basis kein Verzeichnis → `config-invalid`)
  wäre möglich, ist aber bewusst zurückgestellt.
