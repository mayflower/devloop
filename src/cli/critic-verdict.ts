// CLI: raw critic output(s) -> validated status, ledger round, DERIVED verdict (REQ-CRITIC-1/2/5).
// stdin: { rawOutputs: string[], ledger: Ledger, addressed: string[] }. Any `status` / `verdict`
// in the input is ignored — status comes from schema validation of rawOutputs, the verdict from
// the ledger.

import { mergeCriticRuns, parseCriticOutput } from "../core/critic.js";
import { applyRound, deriveVerdict, type Ledger } from "../core/ledger.js";
import { readStdin } from "./_stdin.js";

let input: { rawOutputs?: unknown; ledger?: Ledger; addressed?: unknown } = {};
try {
  input = JSON.parse(await readStdin());
} catch {
  /* unparseable input -> not-run below */
}

const raws = Array.isArray(input.rawOutputs) ? input.rawOutputs : [];
const runs = raws.map((r) => parseCriticOutput(typeof r === "string" ? r : ""));
const merged = mergeCriticRuns(runs);

if (merged.status !== "completed") {
  process.stdout.write(JSON.stringify({ status: "not-run" }) + "\n");
} else {
  const addressed = Array.isArray(input.addressed)
    ? input.addressed.filter((k): k is string => typeof k === "string")
    : [];
  const round = applyRound(input.ledger ?? {}, { findings: merged.findings, addressed });
  process.stdout.write(
    JSON.stringify({ status: "completed", verdict: deriveVerdict(round.ledger), round }) + "\n",
  );
}
