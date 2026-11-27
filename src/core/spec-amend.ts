// Spec-amend classifier (#27): is a change between two spec.md versions a pure documentation
// addendum ("nachtrag": only lines inside "Bekannte Grenzen" / "Folge-Issues" sections, no REQ
// definition, no heading change) or a requirement change ("anforderung", stops for review)?
// Conservative by design: anything not provably an addendum is "anforderung".

export type AmendKlasse = "nachtrag" | "anforderung" | "unveraendert";
export type AmendRegel = "abschnitt" | "req-definition" | "ueberschrift";

export interface AmendGrund {
  stand: "alt" | "neu";
  zeile: number;
  regel: AmendRegel;
  text: string;
}

export interface SpecAmend {
  klasse: AmendKlasse;
  gruende: AmendGrund[];
  prBody?: string;
}

interface Line {
  nr: number; // 1-based in its version
  text: string; // without trailing \r
  inNachtrag: boolean;
}

const HEADING = /^#{1,6} /;
const REQ_DEF = /^\s*- \*\*REQ-[A-Z0-9]+-\d+\*\*/;
const NACHTRAG_TITEL = /^(Bekannte Grenzen|Folge-Issues)/;

// Non-blank lines of a version with 1-based numbers and nachtrag-section membership.
function parse(src: string): Line[] {
  const out: Line[] = [];
  let level: number | null = null; // heading level of the enclosing nachtrag section
  src.split("\n").forEach((raw, i) => {
    const text = raw.replace(/\r$/, "");
    if (HEADING.test(text)) {
      const l = text.indexOf(" ");
      if (level !== null && l <= level) level = null;
      if (level === null && NACHTRAG_TITEL.test(text.slice(l + 1).trim())) level = l;
    }
    if (text.trim() !== "") out.push({ nr: i + 1, text, inNachtrag: level !== null });
  });
  return out;
}

// Line diff via LCS (common prefix/suffix trimmed first). Returns removed (alt) and added (neu).
function diff(a: Line[], b: Line[]): { removed: Line[]; added: Line[] } {
  let s = 0;
  while (s < a.length && s < b.length && a[s].text === b[s].text) s++;
  let ea = a.length;
  let eb = b.length;
  while (ea > s && eb > s && a[ea - 1].text === b[eb - 1].text) {
    ea--;
    eb--;
  }
  const x = a.slice(s, ea);
  const y = b.slice(s, eb);
  const w = y.length + 1;
  const t = new Uint32Array((x.length + 1) * w);
  for (let i = x.length - 1; i >= 0; i--) {
    for (let j = y.length - 1; j >= 0; j--) {
      t[i * w + j] =
        x[i].text === y[j].text
          ? t[(i + 1) * w + j + 1] + 1
          : Math.max(t[(i + 1) * w + j], t[i * w + j + 1]);
    }
  }
  const removed: Line[] = [];
  const added: Line[] = [];
  let i = 0;
  let j = 0;
  while (i < x.length && j < y.length) {
    if (x[i].text === y[j].text) {
      i++;
      j++;
    } else if (t[(i + 1) * w + j] >= t[i * w + j + 1]) removed.push(x[i++]);
    else added.push(y[j++]);
  }
  while (i < x.length) removed.push(x[i++]);
  while (j < y.length) added.push(y[j++]);
  return { removed, added };
}

export function classifySpecAmend(alt: string, neu: string): SpecAmend {
  const { removed, added } = diff(parse(alt), parse(neu));
  if (removed.length === 0 && added.length === 0) return { klasse: "unveraendert", gruende: [] };

  const gruende: AmendGrund[] = [];
  const check = (stand: "alt" | "neu", l: Line): void => {
    const hit = (regel: AmendRegel): number =>
      gruende.push({ stand, zeile: l.nr, regel, text: l.text });
    if (HEADING.test(l.text)) hit("ueberschrift");
    if (!l.inNachtrag) hit("abschnitt");
    if (REQ_DEF.test(l.text)) hit("req-definition");
  };
  removed.forEach((l) => check("alt", l));
  added.forEach((l) => check("neu", l));

  if (gruende.length > 0) return { klasse: "anforderung", gruende };
  const prBody = [
    "## Spec-Nachträge (ohne Stopp)",
    "",
    ...added.map((l) => l.text),
    ...removed.map((l) => `Gestrichen: ${l.text}`),
  ].join("\n");
  return { klasse: "nachtrag", gruende: [], prBody };
}
