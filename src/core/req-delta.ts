// Spec-change delta: which EARS criteria (REQ-<CTX>-<nr>) were added, changed, or removed
// between two spec.md versions. Lets spec-to-tests touch exactly the affected REQs (surgical
// re-derivation) instead of the whole feature (design: spec-change loopback, §5.1).
//
// One criterion per line (the EARS convention): a line carrying a REQ id maps that id to its
// criterion text (everything after the id, minus an optional ":" / "-" / "—" separator).
// Comparison is whitespace-normalised.

export interface ReqDelta {
  added: string[];
  changed: string[];
  removed: string[];
}

const REQ_LINE = /\b(REQ-[A-Z0-9]+-\d+)\b\s*[:\-—]?\s*(.*)$/;
const normalize = (s: string): string => s.trim().replace(/\s+/g, " ");

function parseReqs(spec: string): Map<string, string> {
  const reqs = new Map<string, string>();
  for (const line of spec.split("\n")) {
    const m = line.match(REQ_LINE);
    if (m) reqs.set(m[1], normalize(m[2]));
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
