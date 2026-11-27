// Spec-change delta: which EARS criteria (REQ-<CTX>-<nr>) were added, changed, or removed
// between two spec.md versions. Lets spec-to-tests touch exactly the affected REQs (surgical
// re-derivation) instead of the whole feature (design: spec-change loopback, §5.1).
//
// Only REQ *definitions* count (#30), recognised by form, not by a bare mention:
//  - bold definition: unindented line, optional "- "/"* ", then "**" directly followed by the id;
//  - plain definition: unindented line starting with the id (optional "- "/"* "), or a heading
//    "# REQ-…". Plain lines only count in a spec without any bold definition;
//  - never inside "Bekannte Grenzen" / "Folge-Issues" sections (shared with spec-amend-class).
// A criterion's text is its whole definition block (definition line + continuation lines up to
// the next blank line, heading, definition or unindented list item), whitespace-normalised.
// If an id is defined more than once, the first definition wins.

import { HEADING, nachtragFlags } from "./spec-sections.js";

export interface ReqDelta {
  added: string[];
  changed: string[];
  removed: string[];
}

const ID = String.raw`(REQ-[A-Z0-9]+-\d+)(?![-A-Za-z0-9])`;
const BOLD_DEF = new RegExp(String.raw`^(?:[-*] )?\*\*${ID}`);
const PLAIN_DEF = new RegExp(String.raw`^(?:(?:[-*] )?|#{1,6} )${ID}`);
const LIST_ITEM = /^[-*] /;
const normalize = (s: string): string => s.trim().replace(/\s+/g, " ");

interface Def {
  id: string;
  bold: boolean;
  start: number; // line index
  rest: string; // text after the id on the definition line
}

function parseReqs(spec: string): Map<string, string> {
  const lines = spec.split("\n").map((l) => l.replace(/\r$/, ""));
  const nachtrag = nachtragFlags(lines);

  const defs: Def[] = [];
  lines.forEach((line, i) => {
    if (nachtrag[i]) return;
    const b = line.match(BOLD_DEF);
    if (b) return void defs.push({ id: b[1], bold: true, start: i, rest: line.slice(b[0].length) });
    const p = line.match(PLAIN_DEF);
    if (p) defs.push({ id: p[1], bold: false, start: i, rest: line.slice(p[0].length) });
  });

  const useBold = defs.some((d) => d.bold);
  const isDefStart = new Set(defs.map((d) => d.start));
  const reqs = new Map<string, string>();
  for (const d of defs) {
    if (d.bold !== useBold || reqs.has(d.id)) continue;
    const parts = [d.rest.replace(/^\s*[:\-—]?/, "")];
    for (let j = d.start + 1; j < lines.length; j++) {
      const l = lines[j];
      if (l.trim() === "" || HEADING.test(l) || isDefStart.has(j) || LIST_ITEM.test(l)) break;
      parts.push(l);
    }
    reqs.set(d.id, normalize(parts.join("\n")));
  }
  return reqs;
}

export function reqDelta(oldSpec: string, newSpec: string): ReqDelta {
  const before = parseReqs(oldSpec);
  const after = parseReqs(newSpec);
  const delta: ReqDelta = { added: [], changed: [], removed: [] };

  for (const [id, text] of after) {
    if (!before.has(id)) delta.added.push(id);
    else if (before.get(id) !== text) delta.changed.push(id);
  }
  for (const id of before.keys()) {
    if (!after.has(id)) delta.removed.push(id);
  }
  return delta;
}
