import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { reqDelta } from "../../src/core/req-delta.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p: string): string => readFileSync(resolve(root, p), "utf8");
const EMPTY = { added: [], changed: [], removed: [] };

// ---- REQ-REQDEF-3 / REQ-REQDEF-1: Nachtrag aus #13 (Fixture aus #27)

test("[REQ-REQDEF-3] reiner Nachtrag aus #13 (Grenze nennt REQ-CFGBASE-4) -> leeres Delta", () => {
  const alt = read("test/fixtures/spec-nachtrag/config-aus-basis-alt.md");
  const neu = read("test/fixtures/spec-nachtrag/config-aus-basis-neu.md");
  expect(reqDelta(alt, neu)).toEqual(EMPTY);
});

// ---- REQ-REQDEF-2: Fortsetzungszeilen gehoeren zum Kriterium

const LIST_EM = (cont: string): string => `# Spec

- **REQ-X-1** *(When)* — Wenn der Nutzer sendet, soll das System
  speichern und ${cont}.
- **REQ-X-2** *(ubiquitous)* — Das System soll loggen.
`;

test("[REQ-REQDEF-2] geaenderte Fortsetzungszeile (fett, Liste, *(When)* —) -> changed", () => {
  expect(reqDelta(LIST_EM("bestaetigen"), LIST_EM("ablehnen"))).toEqual({
    added: [],
    changed: ["REQ-X-1"],
    removed: [],
  });
});

const LIST_BRACKET = (cont: string): string => `# Spec

- **REQ-X-1 [When]:** Wenn der Nutzer sendet, soll das System
  speichern,
  ${cont}.
- **REQ-X-2 [If]:** Wenn leer, soll das System ablehnen.
`;

test("[REQ-REQDEF-2] geaenderte dritte Zeile (fett, Liste, [When]:**) -> changed", () => {
  expect(reqDelta(LIST_BRACKET("bestaetigen"), LIST_BRACKET("ablehnen"))).toEqual({
    added: [],
    changed: ["REQ-X-1"],
    removed: [],
  });
});

test("[REQ-REQDEF-2] nur Whitespace in Fortsetzungszeilen geaendert -> leeres Delta", () => {
  const a = LIST_EM("bestaetigen");
  const b = a.replace("  speichern und", "      speichern   und");
  expect(reqDelta(a, b)).toEqual(EMPTY);
});

const PARA = (text: string): string => `# Spec

**REQ-X-1** *(Contract)*
Das Event \`order.created\` ${text}.

**REQ-X-2** *(Contract)*
Das Event \`order.paid\` hat ein Feld id.
`;

test("[REQ-REQDEF-2] Absatzform: Text in der Folgezeile geaendert -> changed", () => {
  expect(reqDelta(PARA("hat ein Feld id"), PARA("hat ein Feld orderId"))).toEqual({
    added: [],
    changed: ["REQ-X-1"],
    removed: [],
  });
});

test("[REQ-REQDEF-2] Absatzform: neues Kriterium -> added, entferntes -> removed", () => {
  const a = PARA("hat ein Feld id");
  const b = a.replace(/\*\*REQ-X-2\*\*[\s\S]*$/, "**REQ-X-3** *(Contract)*\nNeues Event.\n");
  expect(reqDelta(a, b)).toEqual({ added: ["REQ-X-3"], changed: [], removed: ["REQ-X-2"] });
});

// ---- REQ-REQDEF-3: Nennungen sind keine Definitionen

const WITH_REF = (ref: string, x5: string): string => `# Spec

- **REQ-X-1** *(When)* — Wenn A, dann B,
  ${ref}
- **REQ-X-5** *(ubiquitous)* — ${x5}
`;

test("[REQ-REQDEF-3] Fortsetzungszeile nennt REQ-X-5 mit anderem Text, X-5 unveraendert -> X-5 nicht changed", () => {
  const a = WITH_REF("REQ-X-5 gilt fuer den Inhalt in der Basis.", "Das System soll loggen.");
  const b = WITH_REF("REQ-X-5 gilt fuer den Inhalt im Head.", "Das System soll loggen.");
  const d = reqDelta(a, b);
  expect(d.changed).toEqual(["REQ-X-1"]); // Fortsetzung von X-1 hat sich geaendert
  expect(d.added).toEqual([]);
  expect(d.removed).toEqual([]);
});

test("[REQ-REQDEF-3] Fortsetzungszeile mit Nennung: X-5 selbst geaendert -> nur X-5 changed", () => {
  const a = WITH_REF("REQ-X-5 gilt fuer den Inhalt.", "Das System soll loggen.");
  const b = WITH_REF("REQ-X-5 gilt fuer den Inhalt.", "Das System soll alles loggen.");
  expect(reqDelta(a, b)).toEqual({ added: [], changed: ["REQ-X-5"], removed: [] });
});

const MENTION_FIRST = (mention: string): string => `# Spec

- REQ-X-12 ${mention}
- **REQ-X-12** *(ubiquitous)* — Die Tool-Grenze soll gelten.
- **REQ-X-13** *(ubiquitous)* — Etwas anderes.
`;

test("[REQ-REQDEF-3] Listenpunkt-Nennung vor der fetten Definition, nur die Nennung aendert sich -> leeres Delta", () => {
  expect(reqDelta(MENTION_FIRST("macht die Tool-Grenze laut A."), MENTION_FIRST("macht die Tool-Grenze laut B."))).toEqual(EMPTY);
});

test("[REQ-REQDEF-3] schlichte Zeile in Spec mit fetter Form: neu hinzugefuegt -> kein added", () => {
  const a = MENTION_FIRST("macht das laut A.");
  const b = a + "- REQ-X-99 [When]: Eine schlichte Zeile.\n";
  expect(reqDelta(a, b)).toEqual(EMPTY);
});

test("[REQ-REQDEF-3] Nennung im Code (`REQ-X-5-….json`, `- **`REQ-X-11` (e)**`) ist keine Definition", () => {
  const a = `# Spec

- **REQ-X-1** *(When)* — Wenn A, dann B.
`;
  const b = a + `- **\`REQ-X-11\` (e)** erwaehnt etwas.
\`REQ-X-5-topic-abc.json\` liegt im Ordner.
`;
  expect(reqDelta(a, b)).toEqual(EMPTY);
});

test("[REQ-REQDEF-3] ID mit Folgezeichen (REQ-X-5-topic.json) am Zeilenanfang ist keine Definition (schlichte Spec)", () => {
  const a = `- REQ-X-1 [When]: Wenn A, dann B.\n`;
  const b = a + `- REQ-X-5-topic.json liegt im Ordner.\nREQ-X-6abc ist keine ID.\n`;
  expect(reqDelta(a, b)).toEqual(EMPTY);
});

test("[REQ-REQDEF-3] Fliesstext-Nennung mitten in der Zeile (neu) -> kein added", () => {
  const a = `# Spec\n\n- **REQ-X-1** *(When)* — Wenn A, dann B.\n`;
  const b = a + `\nSiehe auch REQ-X-7 im Nachbar-Dokument.\n`;
  expect(reqDelta(a, b)).toEqual(EMPTY);
});

// ---- REQ-REQDEF-1: Nachtrags-Abschnitte

const BASE = `# Spec

- **REQ-X-1** *(When)* — Wenn A, dann B.

`;

test("[REQ-REQDEF-1] REQ als fette Zeile in 'Bekannte Grenzen' neu -> kein added", () => {
  const b = BASE + `## Bekannte Grenzen\n\n- **REQ-X-9** *(When)* — Das ist eine Grenze.\n`;
  expect(reqDelta(BASE, b)).toEqual(EMPTY);
});

test("[REQ-REQDEF-1] fette Zeile in Unterabschnitt von 'Folge-Issues' -> kein added", () => {
  const b = BASE + `## Folge-Issues\n\n### Offen\n\n- **REQ-X-9** *(When)* — Folge.\n`;
  expect(reqDelta(BASE, b)).toEqual(EMPTY);
});

test("[REQ-REQDEF-1] Definition nach dem Nachtrags-Abschnitt (neue Ueberschrift) zaehlt wieder", () => {
  const b = BASE + `## Bekannte Grenzen\n\n- nix\n\n## Anforderungen\n\n- **REQ-X-2** *(When)* — Neu.\n`;
  expect(reqDelta(BASE, b)).toEqual({ added: ["REQ-X-2"], changed: [], removed: [] });
});

test("[REQ-REQDEF-1] Definition, die in einen Nachtrags-Abschnitt verschoben wird -> removed", () => {
  const a = BASE + `- **REQ-X-2** *(When)* — Zwei.\n`;
  const b = BASE + `## Bekannte Grenzen\n\n- **REQ-X-2** *(When)* — Zwei.\n`;
  expect(reqDelta(a, b)).toEqual({ added: [], changed: [], removed: ["REQ-X-2"] });
});

// ---- REQ-REQDEF-1: schlichte Form

const PLAIN = (x1: string, extra = ""): string => `# Spec

- REQ-X-1 [When]: ${x1}
- REQ-X-2 [If]: Wenn leer, soll das System ablehnen.
${extra}`;

test("[REQ-REQDEF-1] nur schlichte Form: Text geaendert -> changed", () => {
  expect(reqDelta(PLAIN("Wenn A, dann B."), PLAIN("Wenn A, dann C."))).toEqual({
    added: [],
    changed: ["REQ-X-1"],
    removed: [],
  });
});

test("[REQ-REQDEF-1] nur schlichte Form: REQ entfernt -> removed", () => {
  const a = PLAIN("Wenn A, dann B.");
  const b = a.replace(/- REQ-X-2.*\n/, "");
  expect(reqDelta(a, b)).toEqual({ added: [], changed: [], removed: ["REQ-X-2"] });
});

test("[REQ-REQDEF-1] nur schlichte Form: REQ neu -> added", () => {
  const a = PLAIN("Wenn A, dann B.");
  const b = PLAIN("Wenn A, dann B.", "- REQ-X-3 [While]: Solange X, soll Y.\n");
  expect(reqDelta(a, b)).toEqual({ added: ["REQ-X-3"], changed: [], removed: [] });
});

test("[REQ-REQDEF-2] schlichte Form: Fortsetzungszeile geaendert -> changed", () => {
  const a = `- REQ-X-1 [When]: Wenn A,\n  dann B.\n- REQ-X-2 [If]: Zwei.\n`;
  const b = `- REQ-X-1 [When]: Wenn A,\n  dann C.\n- REQ-X-2 [If]: Zwei.\n`;
  expect(reqDelta(a, b)).toEqual({ added: [], changed: ["REQ-X-1"], removed: [] });
});

test("[REQ-REQDEF-1] schlichte Ueberschrift-Definition (## REQ-X-1 — …) in schlichter Spec -> changed", () => {
  const a = `## REQ-X-1 — tut etwas\n\nText.\n`;
  const b = `## REQ-X-1 — tut etwas anderes\n\nText.\n`;
  expect(reqDelta(a, b)).toEqual({ added: [], changed: ["REQ-X-1"], removed: [] });
});

// ---- REQ-REQDEF-4: erste Definition gilt

const DUP = (first: string, second: string): string => `# Spec

- **REQ-X-1** *(When)* — ${first}
- **REQ-X-2** *(When)* — Zwei.

## Anhang

- **REQ-X-1** *(When)* — ${second}
`;

test("[REQ-REQDEF-4] dieselbe ID zweimal fett, nur die zweite aendert sich -> leeres Delta", () => {
  expect(reqDelta(DUP("Eins.", "Alt."), DUP("Eins.", "Neu."))).toEqual(EMPTY);
});

test("[REQ-REQDEF-4] dieselbe ID zweimal fett, die erste aendert sich -> changed", () => {
  expect(reqDelta(DUP("Eins.", "Zweit."), DUP("Eins neu.", "Zweit."))).toEqual({
    added: [],
    changed: ["REQ-X-1"],
    removed: [],
  });
});

// ---- Echte Spec-Staende aus diesem Repo

const REAL = "docs/2026-11-25-spec-pr-freigabe-design.md";

test("[REQ-REQDEF-3] echte devloop-Spec gegen sich selbst -> leeres Delta", () => {
  const s = read(REAL);
  expect(reqDelta(s, s)).toEqual(EMPTY);
});

test("[REQ-REQDEF-2] echte Spec: geaenderte Fortsetzungszeile von REQ-SPECGATE-5 -> genau diese ID changed", () => {
  const s = read(REAL);
  const line = "  Ein leeres Array `[]` gilt als ungültig (Nachtrag 2026-11-25)";
  expect(s).toContain(line);
  const neu = s.replace(line, line + " und sonst auch");
  expect(reqDelta(s, neu)).toEqual({ added: [], changed: ["REQ-SPECGATE-5"], removed: [] });
});

test("[REQ-REQDEF-3] echte Spec: Fortsetzungszeile von REQ-SPECGATE-8 nennt REQ-SPECGATE-5 -> nur SPECGATE-8 changed", () => {
  const s = read(REAL);
  const line = "  REQ-SPECGATE-5 gilt für den Inhalt in der Basis.";
  expect(s).toContain(line);
  const neu = s.replace(line, "  REQ-SPECGATE-5 gilt für den Inhalt im Head.");
  expect(reqDelta(s, neu)).toEqual({ added: [], changed: ["REQ-SPECGATE-8"], removed: [] });
});
