// CLI: classify a spec change as "nachtrag" (doc addendum, no stop), "anforderung" (stops for
// review) or "unveraendert". The agent never picks the class; this does (#27).
// Usage: spec-amend-class <abgenommener-stand> <neuer-stand>   Exit 2 on missing/unreadable input.
import { readFileSync } from "node:fs";
import { classifySpecAmend } from "../core/spec-amend.js";
const [, , oldPath, newPath] = process.argv;
if (!oldPath || !newPath) {
    process.stderr.write("usage: spec-amend-class <abgenommener-stand> <neuer-stand>\n");
    process.exit(2);
}
let alt;
let neu;
try {
    alt = readFileSync(oldPath, "utf8");
    neu = readFileSync(newPath, "utf8");
}
catch (e) {
    process.stderr.write(`spec-amend-class: cannot read input: ${e.message}\n`);
    process.exit(2);
}
process.stdout.write(JSON.stringify(classifySpecAmend(alt, neu), null, 2) + "\n");
