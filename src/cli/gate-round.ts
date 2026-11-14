// CLI: structured gate findings -> ledger round (REQ-GATE-1..3).
// stdin: { raws, ran, ledger, addressed }. Invalid input -> message on stderr, exit 2, nothing
// on stdout. Only these four fields are read; judged/progress/oscillation come from the ledger.

import { applyGateRound, parseGateRoundInput } from "../core/gate-round.js";
import type { Ledger } from "../core/ledger.js";
import { readStdin } from "./_stdin.js";

function fail(msg: string): never {
  process.stderr.write(`gate-round: ${msg}\n`);
  process.exit(2);
}

let parsed: unknown;
try {
  parsed = JSON.parse(await readStdin());
} catch {
  fail("stdin is not valid JSON");
}

const input = parseGateRoundInput(parsed);
if (!input) fail("invalid input: need raws[], ran[], addressed[] with known gate kinds and required fields");
const ledger = (parsed as { ledger?: unknown }).ledger;
if (typeof ledger !== "object" || ledger === null || Array.isArray(ledger)) fail("invalid input: ledger must be an object");

const round = applyGateRound(ledger as Ledger, input);
process.stdout.write(JSON.stringify({ round }) + "\n");
