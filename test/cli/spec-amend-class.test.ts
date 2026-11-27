// [REQ-NACHTRAG-1..6] spec-amend-class (#27). CLI-Tests gegen dist/ mit echten Spec-Dateien im
// Temp-Verzeichnis. Keine Attrappen, keine Quelltext-Wächter: geprüft wird die Wirkung (Klasse,
// Gründe, prBody, Exit-Code, stdout/stderr).
import { test, expect, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const cli = join(root, "dist/cli/spec-amend-class.js");
const fixtures = join(root, "test/fixtures/spec-nachtrag");

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

interface Grund {
  stand: "alt" | "neu";
  zeile: number;
  regel: "abschnitt" | "req-definition" | "ueberschrift";
  text: string;
}
interface Ausgabe {
  klasse: "nachtrag" | "anforderung" | "unveraendert";
  gruende: Grund[];
  prBody?: string;
}
interface Lauf {
  status: number | null;
  stdout: string;
  stderr: string;
  json: Ausgabe;
}

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "spec-amend-"));
  dirs.push(d);
  return d;
}

function runPaths(...args: string[]): Lauf {
  const r = spawnSync("node", [cli, ...args], { encoding: "utf8" });
  let json = undefined as unknown as Ausgabe;
  if (r.status === 0) json = JSON.parse(r.stdout) as Ausgabe;
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json };
}

function run(alt: string, neu: string): Lauf {
  const d = tmp();
  writeFileSync(join(d, "alt.md"), alt);
  writeFileSync(join(d, "neu.md"), neu);
  return runPaths(join(d, "alt.md"), join(d, "neu.md"));
}

// Basis-Spec mit allen Abschnittsarten. Zeilen sind eindeutig, damit der Diff nicht ratet.
const BASIS = [
  "Vorspann vor der ersten Überschrift.",
  "",
  "# Titel",
  "",
  "## Begriffe",
  "",
  "- Begriff A ist so.",
  "",
  "## Anforderungen (EARS)",
  "",
  "- **REQ-X-1** *(event-driven)* — Wortlaut eins.",
  "- **REQ-X-4** *(ubiquitous)* — Wortlaut vier.",
  "",
  "## Detektoren",
  "",
  "| Fall | Erwartung |",
  "",
  "## Bekannte Grenzen (dokumentiert)",
  "",
  "- Grenze eins.",
  "- Grenze zwei.",
  "",
  "### Unterabschnitt",
  "",
  "- Unter eins.",
  "",
  "#### Tiefer Unterabschnitt",
  "",
  "- Tief eins.",
  "",
  "## Folge-Issues",
  "",
  "- Issue eins.",
  "",
  "## Umsetzung",
  "",
  "- Umsetzung eins.",
  "",
].join("\n");

// Setzt `neu` aus BASIS: hinter der Zeile `nach` kommen `zeilen`.
function einfuegen(text: string, nach: string, ...zeilen: string[]): string {
  const l = text.split("\n");
  const i = l.indexOf(nach);
  if (i < 0) throw new Error(`Ankerzeile fehlt: ${nach}`);
  l.splice(i + 1, 0, ...zeilen);
  return l.join("\n");
}
function ersetzen(text: string, von: string, nach: string): string {
  const l = text.split("\n");
  const i = l.indexOf(von);
  if (i < 0) throw new Error(`Zeile fehlt: ${von}`);
  l[i] = nach;
  return l.join("\n");
}
function entfernen(text: string, zeile: string): string {
  const l = text.split("\n");
  const i = l.indexOf(zeile);
  if (i < 0) throw new Error(`Zeile fehlt: ${zeile}`);
  l.splice(i, 1);
  return l.join("\n");
}
// 1-basierte Zeilennummer der ersten Zeile `zeile` in `text`.
function nr(text: string, zeile: string): number {
  const i = text.split("\n").indexOf(zeile);
  if (i < 0) throw new Error(`Zeile fehlt: ${zeile}`);
  return i + 1;
}

const PR_UEBERSCHRIFT = "## Spec-Nachträge (ohne Stopp)";

// ---------------------------------------------------------------------------------------------
// REQ-NACHTRAG-1: Ausgabeformat, Exit 0, gruende mit Zeilennummer und Regel
// ---------------------------------------------------------------------------------------------

test("[REQ-NACHTRAG-1] Exit 0 und genau ein JSON-Objekt auf stdout mit Feld klasse und gruende", () => {
  const neu = einfuegen(BASIS, "- Grenze zwei.", "- Grenze drei.");
  const r = run(BASIS, neu);
  expect(r.status).toBe(0);
  // Genau ein JSON-Objekt (Format frei, auch eingerückt), kein Array, nicht null, nichts sonst auf stdout.
  const roh: unknown = JSON.parse(r.stdout);
  expect(roh).not.toBeNull();
  expect(Array.isArray(roh)).toBe(false);
  expect(typeof roh).toBe("object");
  expect(JSON.stringify(JSON.parse(r.stdout))).toBe(JSON.stringify(roh));
  expect(Object.keys(r.json).sort()).toEqual(["gruende", "klasse", "prBody"]);
  expect(Array.isArray(r.json.gruende)).toBe(true);
});

test("[REQ-NACHTRAG-1] bei anforderung nennt gruende stand, zeile (1-basiert), regel und text wörtlich", () => {
  const alt = BASIS;
  const neu = ersetzen(BASIS, "- Begriff A ist so.", "- Begriff A ist anders.");
  const r = run(alt, neu);
  expect(r.status).toBe(0);
  expect(r.json.klasse).toBe("anforderung");
  expect(r.json.gruende).toContainEqual({
    stand: "alt",
    zeile: nr(alt, "- Begriff A ist so."),
    regel: "abschnitt",
    text: "- Begriff A ist so.",
  });
  expect(r.json.gruende).toContainEqual({
    stand: "neu",
    zeile: nr(neu, "- Begriff A ist anders."),
    regel: "abschnitt",
    text: "- Begriff A ist anders.",
  });
  expect(r.json.gruende).toHaveLength(2);
});

test("[REQ-NACHTRAG-1] Zeilennummern zählen Leerzeilen mit und beziehen sich auf den jeweiligen Stand", () => {
  // Vorn kommen im neuen Stand zwei Leerzeilen dazu: die Nummern von alt und neu laufen auseinander.
  const alt = BASIS;
  const neu = "\n\n" + ersetzen(BASIS, "- Umsetzung eins.", "- Umsetzung geändert.");
  const r = run(alt, neu);
  expect(r.json.klasse).toBe("anforderung");
  const a = r.json.gruende.find((g) => g.stand === "alt")!;
  const n = r.json.gruende.find((g) => g.stand === "neu")!;
  expect(a.zeile).toBe(nr(alt, "- Umsetzung eins."));
  expect(n.zeile).toBe(nr(neu, "- Umsetzung geändert."));
  expect(n.zeile).toBe(a.zeile + 2);
});

test("[REQ-NACHTRAG-1] hinzugekommene REQ-Definition in Anforderungen löst abschnitt UND req-definition aus (zwei Einträge)", () => {
  const zeile = "- **REQ-X-9** *(ubiquitous)* — Neu.";
  const neu = einfuegen(BASIS, "- **REQ-X-4** *(ubiquitous)* — Wortlaut vier.", zeile);
  const r = run(BASIS, neu);
  expect(r.json.klasse).toBe("anforderung");
  const z = nr(neu, zeile);
  expect(r.json.gruende).toContainEqual({ stand: "neu", zeile: z, regel: "abschnitt", text: zeile });
  expect(r.json.gruende).toContainEqual({ stand: "neu", zeile: z, regel: "req-definition", text: zeile });
  expect(r.json.gruende).toHaveLength(2);
});

test("[REQ-NACHTRAG-1] bei nachtrag und unveraendert ist gruende leer, bei anforderung nicht", () => {
  const nachtrag = run(BASIS, einfuegen(BASIS, "- Grenze zwei.", "- Grenze drei."));
  const gleich = run(BASIS, BASIS);
  const anf = run(BASIS, ersetzen(BASIS, "- Umsetzung eins.", "- Umsetzung X."));
  expect(nachtrag.json.klasse).toBe("nachtrag");
  expect(nachtrag.json.gruende).toEqual([]);
  expect(gleich.json.klasse).toBe("unveraendert");
  expect(gleich.json.gruende).toEqual([]);
  expect(anf.json.klasse).toBe("anforderung");
  expect(anf.json.gruende.length).toBeGreaterThan(0);
});

test("[REQ-NACHTRAG-1] mehrere auslösende Zeilen ergeben je Zeile einen Eintrag; die unkritische Zeile fehlt in gruende", () => {
  let neu = einfuegen(BASIS, "- Grenze zwei.", "- Grenze drei.");
  neu = einfuegen(neu, "- Umsetzung eins.", "- Umsetzung zwei.");
  neu = einfuegen(neu, "- Begriff A ist so.", "- Begriff B.");
  const r = run(BASIS, neu);
  expect(r.json.klasse).toBe("anforderung");
  expect(r.json.gruende.map((g) => g.text).sort()).toEqual(["- Begriff B.", "- Umsetzung zwei."]);
  expect(r.json.gruende.every((g) => g.stand === "neu" && g.regel === "abschnitt")).toBe(true);
});

// ---------------------------------------------------------------------------------------------
// REQ-NACHTRAG-2: Klasse genau dann nachtrag, wenn Doku-Nachtrag; unveraendert ohne geänderte Zeile
// ---------------------------------------------------------------------------------------------

test("[REQ-NACHTRAG-2] neue Zeile unter Bekannte Grenzen ohne REQ- -> nachtrag, prBody enthält die Zeile wörtlich", () => {
  const zeile = "- Neue Grenze: X wird nicht geprüft.";
  const r = run(BASIS, einfuegen(BASIS, "- Grenze zwei.", zeile));
  expect(r.status).toBe(0);
  expect(r.json.klasse).toBe("nachtrag");
  expect(r.json.gruende).toEqual([]);
  expect(r.json.prBody).toContain(zeile);
});

test("[REQ-NACHTRAG-2] neue Zeile unter Folge-Issues -> nachtrag", () => {
  const zeile = "- Issue zwei: später.";
  const r = run(BASIS, einfuegen(BASIS, "- Issue eins.", zeile));
  expect(r.json.klasse).toBe("nachtrag");
  expect(r.json.prBody).toContain(zeile);
});

test("[REQ-NACHTRAG-2] neue Zeile im Unterabschnitt ### und #### von Bekannte Grenzen -> nachtrag (Zuordnung erbt)", () => {
  const z3 = "- Unter zwei.";
  const z4 = "- Tief zwei.";
  const r3 = run(BASIS, einfuegen(BASIS, "- Unter eins.", z3));
  const r4 = run(BASIS, einfuegen(BASIS, "- Tief eins.", z4));
  expect(r3.json.klasse).toBe("nachtrag");
  expect(r3.json.prBody).toContain(z3);
  expect(r4.json.klasse).toBe("nachtrag");
  expect(r4.json.prBody).toContain(z4);
});

test("[REQ-NACHTRAG-2] Unterabschnitt-Vererbung endet bei Überschrift gleicher oder höherer Ebene (## Umsetzung nach #### -> anforderung)", () => {
  // Die Zeile steht nach dem tiefsten Unterabschnitt, aber hinter "## Umsetzung": kein Nachtrags-Abschnitt.
  const zeile = "- Umsetzung zwei.";
  const neu = einfuegen(BASIS, "- Umsetzung eins.", zeile);
  const r = run(BASIS, neu);
  expect(r.json.klasse).toBe("anforderung");
  expect(r.json.gruende).toEqual([{ stand: "neu", zeile: nr(neu, zeile), regel: "abschnitt", text: zeile }]);
});

test("[REQ-NACHTRAG-2] Vererbung endet bei Überschrift GLEICHER Ebene: ### Bekannte Grenzen x unter ## Anforderungen, danach ### Weiter", () => {
  const alt = [
    "# T",
    "## Anforderungen (EARS)",
    "### Bekannte Grenzen innen",
    "- g1",
    "### Weiter",
    "- w1",
    "",
  ].join("\n");
  const imAbschnitt = run(alt, einfuegen(alt, "- g1", "- g2"));
  const nachEnde = run(alt, einfuegen(alt, "- w1", "- w2"));
  expect(imAbschnitt.json.klasse).toBe("nachtrag");
  expect(nachEnde.json.klasse).toBe("anforderung");
  expect(nachEnde.json.gruende.map((g) => g.regel)).toEqual(["abschnitt"]);
});

test("[REQ-NACHTRAG-2] nach einem Nachtrags-Abschnitt folgender ##-Abschnitt erbt nicht (Zeile unter Detektoren -> anforderung)", () => {
  const r = run(BASIS, einfuegen(BASIS, "| Fall | Erwartung |", "| a | b |"));
  expect(r.json.klasse).toBe("anforderung");
});

test("[REQ-NACHTRAG-2] Grenze gestrichen (Zeile weg, kein REQ-) -> nachtrag", () => {
  const r = run(BASIS, entfernen(BASIS, "- Grenze zwei."));
  expect(r.json.klasse).toBe("nachtrag");
  expect(r.json.gruende).toEqual([]);
});

test("[REQ-NACHTRAG-2] Wortlaut eines REQ geändert -> anforderung (Anforderungen ist kein Nachtrags-Abschnitt)", () => {
  const alt = BASIS;
  const neu = ersetzen(BASIS, "- **REQ-X-1** *(event-driven)* — Wortlaut eins.", "- **REQ-X-1** *(event-driven)* — Wortlaut eins, aber weicher.");
  const r = run(alt, neu);
  expect(r.json.klasse).toBe("anforderung");
  expect(r.json.gruende.some((g) => g.regel === "abschnitt" && g.stand === "alt")).toBe(true);
  expect(r.json.gruende.some((g) => g.regel === "abschnitt" && g.stand === "neu")).toBe(true);
});

test("[REQ-NACHTRAG-2] Zeile in Begriffe oder Detektoren geändert -> anforderung (Abschnittsprüfung)", () => {
  const b = run(BASIS, ersetzen(BASIS, "- Begriff A ist so.", "- Begriff A ist so, ergänzt."));
  const d = run(BASIS, ersetzen(BASIS, "| Fall | Erwartung |", "| Fall | Erwartung | tötet |"));
  expect(b.json.klasse).toBe("anforderung");
  expect(d.json.klasse).toBe("anforderung");
});

test("[REQ-NACHTRAG-2] REQ-Zeile aus Anforderungen nach Bekannte Grenzen verschoben -> anforderung, weggefallene Zeile zählt im alten Stand", () => {
  const req = "- **REQ-X-4** *(ubiquitous)* — Wortlaut vier.";
  const alt = BASIS;
  const neu = einfuegen(entfernen(BASIS, req), "- Grenze zwei.", req);
  const r = run(alt, neu);
  expect(r.json.klasse).toBe("anforderung");
  expect(r.json.gruende).toContainEqual({ stand: "alt", zeile: nr(alt, req), regel: "abschnitt", text: req });
  expect(r.json.gruende).toContainEqual({ stand: "neu", zeile: nr(neu, req), regel: "req-definition", text: req });
});

test("[REQ-NACHTRAG-2] REQ-Zeile aus Bekannte Grenzen nach Anforderungen verschoben (umgekehrt) -> anforderung", () => {
  const req = "- Grenze zwei.";
  const neu = einfuegen(entfernen(BASIS, req), "- **REQ-X-4** *(ubiquitous)* — Wortlaut vier.", req);
  const r = run(BASIS, neu);
  expect(r.json.klasse).toBe("anforderung");
  expect(r.json.gruende).toContainEqual({ stand: "neu", zeile: nr(neu, req), regel: "abschnitt", text: req });
});

test("[REQ-NACHTRAG-2] nur Leerzeilen geändert (auch whitespace-only, auch in Anforderungen) -> unveraendert", () => {
  let neu = BASIS.replace("## Anforderungen (EARS)\n\n", "## Anforderungen (EARS)\n\n\n   \n\t\n");
  neu = neu.replace("- Begriff A ist so.\n\n", "- Begriff A ist so.\n");
  const r = run(BASIS, neu);
  expect(r.status).toBe(0);
  expect(r.json.klasse).toBe("unveraendert");
  expect(r.json.gruende).toEqual([]);
});

test("[REQ-NACHTRAG-2] identische Dateien -> unveraendert, ohne prBody", () => {
  const r = run(BASIS, BASIS);
  expect(r.status).toBe(0);
  expect(r.json.klasse).toBe("unveraendert");
  expect(r.json.gruende).toEqual([]);
  expect(r.json).not.toHaveProperty("prBody");
});

test("[REQ-NACHTRAG-2] Zeilen vor der ersten Überschrift liegen in keinem Nachtrags-Abschnitt -> anforderung", () => {
  const alt = BASIS;
  const neu = einfuegen(BASIS, "Vorspann vor der ersten Überschrift.", "Noch ein Vorspann.");
  const r = run(alt, neu);
  expect(r.json.klasse).toBe("anforderung");
  expect(r.json.gruende).toEqual([{ stand: "neu", zeile: 2, regel: "abschnitt", text: "Noch ein Vorspann." }]);
  // auch bei einer Datei ganz ohne Überschrift
  const o = run("a\nb\n", "a\nb\nc\n");
  expect(o.json.klasse).toBe("anforderung");
  expect(o.json.gruende[0].regel).toBe("abschnitt");
});

test("[REQ-NACHTRAG-2] Zeile direkt unter Folge-Issues-Überschrift ohne Leerzeile, am Dateiende ohne Zeilenumbruch -> nachtrag", () => {
  const alt = "# T\n## Folge-Issues\n- a";
  const neu = "# T\n## Folge-Issues\n- a\n- b";
  const r = run(alt, neu);
  expect(r.json.klasse).toBe("nachtrag");
  expect(r.json.prBody).toContain("- b");
});

test("[REQ-NACHTRAG-2] Nachtrag und Anforderungsänderung zugleich -> anforderung (eine fremde Zeile genügt)", () => {
  let neu = einfuegen(BASIS, "- Grenze zwei.", "- Grenze drei.");
  neu = einfuegen(neu, "- Umsetzung eins.", "- Umsetzung zwei.");
  expect(run(BASIS, neu).json.klasse).toBe("anforderung");
});

test("[REQ-NACHTRAG-2] CRLF wie LF: identische Fassung mit \\r\\n -> unveraendert; gemischte Zeilenenden ebenso", () => {
  const crlf = BASIS.replace(/\n/g, "\r\n");
  expect(run(BASIS, crlf).json.klasse).toBe("unveraendert");
  expect(run(crlf, BASIS).json.klasse).toBe("unveraendert");
  expect(run(crlf, crlf).json.klasse).toBe("unveraendert");
});

test("[REQ-NACHTRAG-2] CRLF-Eingabe: neue Grenze -> nachtrag, Überschriften und REQ-Definition werden trotz \\r erkannt", () => {
  const alt = BASIS.replace(/\n/g, "\r\n");
  const grenze = einfuegen(BASIS, "- Grenze zwei.", "- Grenze drei.").replace(/\n/g, "\r\n");
  expect(run(alt, grenze).json.klasse).toBe("nachtrag");
  // REQ-Definition mit \r am Zeilenende wird weiterhin erkannt
  const req = einfuegen(BASIS, "- Grenze zwei.", "- **REQ-X-9** — neu.").replace(/\n/g, "\r\n");
  const rr = run(alt, req);
  expect(rr.json.klasse).toBe("anforderung");
  expect(rr.json.gruende.map((g) => g.regel)).toEqual(["req-definition"]);
  // Überschrift mit \r am Ende: Abschnittszuordnung funktioniert (Umsetzung ist kein Nachtrag)
  const um = einfuegen(BASIS, "- Umsetzung eins.", "- Umsetzung zwei.").replace(/\n/g, "\r\n");
  expect(run(alt, um).json.klasse).toBe("anforderung");
});

// ---------------------------------------------------------------------------------------------
// REQ-NACHTRAG-3: REQ-Definition in Nachtrags-Abschnitt -> anforderung; bloße Nennung bleibt nachtrag
// ---------------------------------------------------------------------------------------------

test("[REQ-NACHTRAG-3] neue Zeile '- **REQ-X-9** …' unter Bekannte Grenzen -> anforderung, Grund nennt die Zeile mit regel req-definition", () => {
  const zeile = "- **REQ-X-9** *(ubiquitous)* — Neues Kriterium im Grenzen-Abschnitt.";
  const neu = einfuegen(BASIS, "- Grenze zwei.", zeile);
  const r = run(BASIS, neu);
  expect(r.json.klasse).toBe("anforderung");
  expect(r.json.gruende).toEqual([{ stand: "neu", zeile: nr(neu, zeile), regel: "req-definition", text: zeile }]);
});

test("[REQ-NACHTRAG-3] gestrichene REQ-Definition in Bekannte Grenzen -> anforderung, Grund im alten Stand", () => {
  const zeile = "- **REQ-X-8** *(ubiquitous)* — Alt-Kriterium in Grenzen.";
  const alt = einfuegen(BASIS, "- Grenze zwei.", zeile);
  const r = run(alt, BASIS);
  expect(r.json.klasse).toBe("anforderung");
  expect(r.json.gruende).toEqual([{ stand: "alt", zeile: nr(alt, zeile), regel: "req-definition", text: zeile }]);
});

test("[REQ-NACHTRAG-3] REQ-Definition mit führenden Leerzeichen und in Folge-Issues/Unterabschnitt wird erkannt", () => {
  const eingerueckt = "  - **REQ-ABC1-12** — eingerückt.";
  for (const anker of ["- Issue eins.", "- Unter eins.", "- Tief eins."]) {
    const r = run(BASIS, einfuegen(BASIS, anker, eingerueckt));
    expect(r.json.klasse, anker).toBe("anforderung");
    expect(r.json.gruende.map((g) => g.regel), anker).toEqual(["req-definition"]);
  }
});

test("[REQ-NACHTRAG-3] neue Grenze nennt REQ-X-4 im Fließtext -> nachtrag (Nennung ist keine Definition)", () => {
  const zeile = "- Gilt dann als Erstaufnahme (REQ-X-4); Details dort.";
  const r = run(BASIS, einfuegen(BASIS, "- Grenze zwei.", zeile));
  expect(r.json.klasse).toBe("nachtrag");
  expect(r.json.gruende).toEqual([]);
  expect(r.json.prBody).toContain(zeile);
});

test("[REQ-NACHTRAG-3] fett gesetzte REQ-Nennung mitten in der Zeile oder Aufzählung ohne Bold gilt nicht als Definition -> nachtrag", () => {
  for (const zeile of [
    "- Siehe **REQ-X-4** im Text.",
    "- REQ-X-4 gilt nicht.",
    "**REQ-X-4** am Zeilenanfang ohne Aufzählungszeichen.",
  ]) {
    const r = run(BASIS, einfuegen(BASIS, "- Grenze zwei.", zeile));
    expect(r.json.klasse, zeile).toBe("nachtrag");
  }
});

// ---------------------------------------------------------------------------------------------
// REQ-NACHTRAG-4: Überschrift hinzu/weg/umbenannt -> anforderung
// ---------------------------------------------------------------------------------------------

test("[REQ-NACHTRAG-4] Überschrift 'Detektoren' in 'Bekannte Grenzen 2' umbenannt -> anforderung, regel ueberschrift in alt und neu", () => {
  const alt = BASIS;
  const neu = ersetzen(BASIS, "## Detektoren", "## Bekannte Grenzen 2");
  const r = run(alt, neu);
  expect(r.json.klasse).toBe("anforderung");
  expect(r.json.gruende).toContainEqual({ stand: "alt", zeile: nr(alt, "## Detektoren"), regel: "ueberschrift", text: "## Detektoren" });
  expect(r.json.gruende).toContainEqual({ stand: "neu", zeile: nr(neu, "## Bekannte Grenzen 2"), regel: "ueberschrift", text: "## Bekannte Grenzen 2" });
});

test("[REQ-NACHTRAG-4] neue Überschrift unter Bekannte Grenzen (###) -> anforderung mit regel ueberschrift", () => {
  const h = "### Neuer Unterabschnitt";
  const neu = einfuegen(BASIS, "- Grenze zwei.", h);
  const r = run(BASIS, neu);
  expect(r.json.klasse).toBe("anforderung");
  expect(r.json.gruende).toContainEqual({ stand: "neu", zeile: nr(neu, h), regel: "ueberschrift", text: h });
});

test("[REQ-NACHTRAG-4] weggefallene Überschrift im Nachtrags-Abschnitt (### Unterabschnitt) -> anforderung", () => {
  const alt = BASIS;
  const neu = entfernen(BASIS, "### Unterabschnitt");
  const r = run(alt, neu);
  expect(r.json.klasse).toBe("anforderung");
  expect(r.json.gruende).toContainEqual({ stand: "alt", zeile: nr(alt, "### Unterabschnitt"), regel: "ueberschrift", text: "### Unterabschnitt" });
});

test("[REQ-NACHTRAG-4] Überschriftsebene geändert (## Folge-Issues -> ### Folge-Issues) -> anforderung", () => {
  const r = run(BASIS, ersetzen(BASIS, "## Folge-Issues", "### Folge-Issues"));
  expect(r.json.klasse).toBe("anforderung");
  expect(r.json.gruende.some((g) => g.regel === "ueberschrift")).toBe(true);
});

test("[REQ-NACHTRAG-4] Verschieben von Inhalt per Umbenennen der Überschrift in einen Nachtrags-Abschnitt -> anforderung", () => {
  // Der Inhalt von 'Umsetzung' bleibt Zeile für Zeile gleich; nur die Überschrift heißt jetzt Folge-Issues 2.
  // Zugehörigkeitsregel: Eine Überschriftenzeile gehört zu dem Abschnitt, den sie eröffnet. Die alte
  // Zeile eröffnet "Umsetzung" (kein Nachtrag) -> ueberschrift + abschnitt; die neue eröffnet einen
  // Nachtrags-Abschnitt -> nur ueberschrift. Reihenfolge: erst alt, dann neu.
  const r = run(BASIS, ersetzen(BASIS, "## Umsetzung", "## Folge-Issues 2"));
  expect(r.json.klasse).toBe("anforderung");
  expect(r.json.gruende.map((g) => `${g.stand}:${g.regel}`)).toEqual(["alt:ueberschrift", "alt:abschnitt", "neu:ueberschrift"]);
});

// ---------------------------------------------------------------------------------------------
// REQ-NACHTRAG-5: Fehlende/nicht lesbare Eingabe -> Exit 2, stderr, stdout leer
// ---------------------------------------------------------------------------------------------

test("[REQ-NACHTRAG-5] alte Datei fehlt -> Exit 2, Meldung auf stderr, stdout leer (kein unveraendert)", () => {
  const d = tmp();
  writeFileSync(join(d, "neu.md"), BASIS);
  const r = runPaths(join(d, "gibt-es-nicht.md"), join(d, "neu.md"));
  expect(r.status).toBe(2);
  expect(r.stdout).toBe("");
  expect(r.stderr.trim().length).toBeGreaterThan(0);
});

test("[REQ-NACHTRAG-5] neue Datei fehlt -> Exit 2, stdout leer", () => {
  const d = tmp();
  writeFileSync(join(d, "alt.md"), BASIS);
  const r = runPaths(join(d, "alt.md"), join(d, "gibt-es-nicht.md"));
  expect(r.status).toBe(2);
  expect(r.stdout).toBe("");
  expect(r.stderr.trim().length).toBeGreaterThan(0);
});

test("[REQ-NACHTRAG-5] beide Dateien fehlen -> Exit 2, stdout leer", () => {
  const d = tmp();
  const r = runPaths(join(d, "a.md"), join(d, "b.md"));
  expect(r.status).toBe(2);
  expect(r.stdout).toBe("");
});

test("[REQ-NACHTRAG-5] Pfad ist ein Verzeichnis (nicht lesbar) -> Exit 2, stdout leer", () => {
  const d = tmp();
  mkdirSync(join(d, "verz"));
  writeFileSync(join(d, "neu.md"), BASIS);
  const r = runPaths(join(d, "verz"), join(d, "neu.md"));
  expect(r.status).toBe(2);
  expect(r.stdout).toBe("");
  expect(r.stderr.trim().length).toBeGreaterThan(0);
});

test("[REQ-NACHTRAG-5] fehlendes Argument (keins oder eins) -> Exit 2, stdout leer", () => {
  const d = tmp();
  writeFileSync(join(d, "alt.md"), BASIS);
  const keins = runPaths();
  const eins = runPaths(join(d, "alt.md"));
  for (const r of [keins, eins]) {
    expect(r.status).toBe(2);
    expect(r.stdout).toBe("");
    expect(r.stderr.trim().length).toBeGreaterThan(0);
  }
});

test("[REQ-NACHTRAG-5] leere, aber vorhandene Dateien sind kein Fehler -> Exit 0, unveraendert", () => {
  const r = run("", "");
  expect(r.status).toBe(0);
  expect(r.json.klasse).toBe("unveraendert");
});

// ---------------------------------------------------------------------------------------------
// REQ-NACHTRAG-6: prBody bei nachtrag
// ---------------------------------------------------------------------------------------------

test("[REQ-NACHTRAG-6] prBody beginnt mit der festen Überschrift, dann eine Leerzeile, dann die hinzugekommenen Zeilen wörtlich in Reihenfolge", () => {
  const z1 = "- Erste neue Grenze mit `Code` und *Betonung*.";
  const z2 = "  Fortsetzungszeile, eingerückt.";
  const z3 = "- Folge-Issue neu.";
  let neu = einfuegen(BASIS, "- Grenze zwei.", z1, z2);
  neu = einfuegen(neu, "- Issue eins.", z3);
  const r = run(BASIS, neu);
  expect(r.json.klasse).toBe("nachtrag");
  const body = r.json.prBody!;
  expect(body.startsWith(`${PR_UEBERSCHRIFT}\n\n`)).toBe(true);
  const i1 = body.indexOf(z1);
  const i2 = body.indexOf(z2);
  const i3 = body.indexOf(z3);
  expect(i1).toBeGreaterThan(0);
  expect(i2).toBeGreaterThan(i1);
  expect(i3).toBeGreaterThan(i2);
  // Zeilen wörtlich als ganze Zeilen
  const zeilen = body.split("\n");
  expect(zeilen).toContain(z1);
  expect(zeilen).toContain(z2);
  expect(zeilen).toContain(z3);
});

test("[REQ-NACHTRAG-6] prBody enthält keine Leerzeilen-Einträge der Änderung und keine unveränderten Zeilen", () => {
  const neu = einfuegen(BASIS, "- Grenze zwei.", "", "- Grenze drei.", "   ");
  const r = run(BASIS, neu);
  expect(r.json.klasse).toBe("nachtrag");
  const rest = r.json.prBody!.split("\n").slice(2);
  expect(rest).toEqual(["- Grenze drei."]);
  expect(r.json.prBody).not.toContain("Grenze eins");
});

test("[REQ-NACHTRAG-6] weggefallene Zeile erscheint als eigene Zeile 'Gestrichen: <Zeile wörtlich>'", () => {
  const r = run(BASIS, entfernen(BASIS, "- Grenze zwei."));
  expect(r.json.klasse).toBe("nachtrag");
  const body = r.json.prBody!;
  expect(body.startsWith(`${PR_UEBERSCHRIFT}\n\n`)).toBe(true);
  expect(body.split("\n")).toContain("Gestrichen: - Grenze zwei.");
});

test("[REQ-NACHTRAG-6] hinzugekommene Zeilen stehen vor den Gestrichen-Zeilen", () => {
  let neu = entfernen(BASIS, "- Grenze zwei.");
  neu = einfuegen(neu, "- Issue eins.", "- Issue neu.");
  const r = run(BASIS, neu);
  expect(r.json.klasse).toBe("nachtrag");
  const body = r.json.prBody!;
  expect(body.indexOf("- Issue neu.")).toBeGreaterThan(0);
  expect(body.indexOf("- Issue neu.")).toBeLessThan(body.indexOf("Gestrichen: - Grenze zwei."));
  expect(body.split("\n")).not.toContain("Gestrichen: - Issue neu.");
  expect(body.split("\n")).not.toContain("- Grenze zwei.");
});

test("[REQ-NACHTRAG-6] geänderte Grenze (Zeile ersetzt) -> neue Zeile wörtlich und alte als Gestrichen", () => {
  const r = run(BASIS, ersetzen(BASIS, "- Grenze zwei.", "- Grenze zwei, präzisiert."));
  expect(r.json.klasse).toBe("nachtrag");
  const zeilen = r.json.prBody!.split("\n");
  expect(zeilen).toContain("- Grenze zwei, präzisiert.");
  expect(zeilen).toContain("Gestrichen: - Grenze zwei.");
});

test("[REQ-NACHTRAG-6] bei anforderung und unveraendert gibt es kein prBody", () => {
  const anf = run(BASIS, ersetzen(BASIS, "- Umsetzung eins.", "- Umsetzung X."));
  const gl = run(BASIS, BASIS);
  expect(anf.json).not.toHaveProperty("prBody");
  expect(gl.json).not.toHaveProperty("prBody");
});

test("[REQ-NACHTRAG-6] CRLF-Eingabe: prBody enthält die hinzugekommene Zeile wörtlich (Inhalt ohne \\r)", () => {
  const alt = BASIS.replace(/\n/g, "\r\n");
  const neu = einfuegen(BASIS, "- Grenze zwei.", "- Grenze drei.").replace(/\n/g, "\r\n");
  const r = run(alt, neu);
  expect(r.json.klasse).toBe("nachtrag");
  expect(r.json.prBody!.split("\n")).toContain("- Grenze drei.");
  expect(r.json.prBody!.startsWith(`${PR_UEBERSCHRIFT}\n\n`)).toBe(true);
});

// ---------------------------------------------------------------------------------------------
// Realfall #13: Spec vor und nach dem F3-Nachtrag (Commit b1c4e5a), Fixtures eingecheckt
// ---------------------------------------------------------------------------------------------

test("[REQ-NACHTRAG-2] Realfall #13: Spec vor und nach dem F3-Nachtrag (nennt REQ-CFGBASE-4) -> nachtrag", () => {
  const altPfad = join(fixtures, "config-aus-basis-alt.md");
  const neuPfad = join(fixtures, "config-aus-basis-neu.md");
  const neuText = readFileSync(neuPfad, "utf8");
  expect(neuText).toContain("REQ-CFGBASE-4"); // Fixture ist die echte Nachtrags-Fassung
  const r = runPaths(altPfad, neuPfad);
  expect(r.status).toBe(0);
  expect(r.json.klasse).toBe("nachtrag");
  expect(r.json.gruende).toEqual([]);
});

test("[REQ-NACHTRAG-6] Realfall #13: prBody trägt die feste Überschrift und die sieben hinzugekommenen Zeilen wörtlich, ohne Gestrichen", () => {
  const altPfad = join(fixtures, "config-aus-basis-alt.md");
  const neuPfad = join(fixtures, "config-aus-basis-neu.md");
  const alt = new Set(readFileSync(altPfad, "utf8").split("\n"));
  const neu = readFileSync(neuPfad, "utf8").split("\n");
  const neue = neu.slice(141, 148); // Zeilen 142-148 (diff: 141a142,148)
  expect(neue).toHaveLength(7);
  expect(neue[0].startsWith("- **`.devloop` als Symlink in der Basis:**")).toBe(true);
  const r = runPaths(altPfad, neuPfad);
  const body = r.json.prBody!;
  expect(body.startsWith(`${PR_UEBERSCHRIFT}\n\n`)).toBe(true);
  expect(body.split("\n").slice(2)).toEqual(neue);
  expect(body).not.toContain("Gestrichen:");
  expect(neue.some((z) => alt.has(z))).toBe(false);
});

test("[REQ-NACHTRAG-3] Realfall #13 umgekehrt (neu -> alt, die Grenze wird gestrichen) -> nachtrag mit sieben Gestrichen-Zeilen", () => {
  const r = runPaths(join(fixtures, "config-aus-basis-neu.md"), join(fixtures, "config-aus-basis-alt.md"));
  expect(r.json.klasse).toBe("nachtrag");
  const gestrichen = r.json.prBody!.split("\n").filter((z) => z.startsWith("Gestrichen: "));
  expect(gestrichen).toHaveLength(7);
});

test("[REQ-NACHTRAG-3] Realfall #13: ein REQ-Kriterium statt der Grenze im selben Abschnitt kippt auf anforderung", () => {
  // Gegenprobe zum Realfall: dieselbe Position, aber als Definition formuliert.
  const alt = readFileSync(join(fixtures, "config-aus-basis-alt.md"), "utf8");
  const neu = readFileSync(join(fixtures, "config-aus-basis-neu.md"), "utf8").replace(
    "- **`.devloop` als Symlink in der Basis:**",
    "- **REQ-CFGBASE-99** *(unwanted)* — Symlink:",
  );
  const r = run(alt, neu);
  expect(r.json.klasse).toBe("anforderung");
  expect(r.json.gruende.map((g) => g.regel)).toEqual(["req-definition"]);
});
