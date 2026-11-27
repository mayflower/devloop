import { HEADING, nachtragFlags } from "./spec-sections.js";
const REQ_DEF = /^\s*- \*\*REQ-[A-Z0-9]+-\d+\*\*/;
// Non-blank lines of a version with 1-based numbers and nachtrag-section membership.
function parse(src) {
    const texts = src.split("\n").map((raw) => raw.replace(/\r$/, ""));
    const flags = nachtragFlags(texts);
    const out = [];
    texts.forEach((text, i) => {
        if (text.trim() !== "")
            out.push({ nr: i + 1, text, inNachtrag: flags[i] });
    });
    return out;
}
// Line diff via LCS (common prefix/suffix trimmed first). Returns removed (alt) and added (neu).
function diff(a, b) {
    let s = 0;
    while (s < a.length && s < b.length && a[s].text === b[s].text)
        s++;
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
    const removed = [];
    const added = [];
    let i = 0;
    let j = 0;
    while (i < x.length && j < y.length) {
        if (x[i].text === y[j].text) {
            i++;
            j++;
        }
        else if (t[(i + 1) * w + j] >= t[i * w + j + 1])
            removed.push(x[i++]);
        else
            added.push(y[j++]);
    }
    while (i < x.length)
        removed.push(x[i++]);
    while (j < y.length)
        added.push(y[j++]);
    return { removed, added };
}
export function classifySpecAmend(alt, neu) {
    const { removed, added } = diff(parse(alt), parse(neu));
    if (removed.length === 0 && added.length === 0)
        return { klasse: "unveraendert", gruende: [] };
    const gruende = [];
    const check = (stand, l) => {
        const hit = (regel) => gruende.push({ stand, zeile: l.nr, regel, text: l.text });
        if (HEADING.test(l.text))
            hit("ueberschrift");
        if (!l.inNachtrag)
            hit("abschnitt");
        if (REQ_DEF.test(l.text))
            hit("req-definition");
    };
    removed.forEach((l) => check("alt", l));
    added.forEach((l) => check("neu", l));
    if (gruende.length > 0)
        return { klasse: "anforderung", gruende };
    const prBody = [
        "## Spec-Nachträge (ohne Stopp)",
        "",
        ...added.map((l) => l.text),
        ...removed.map((l) => `Gestrichen: ${l.text}`),
    ].join("\n");
    return { klasse: "nachtrag", gruende: [], prBody };
}
