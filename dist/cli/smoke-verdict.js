// CLI: raw smoke report -> DERIVED smoke result for the DriverState (REQ-SMOKE-2/3).
// stdin: { rawOutput: string, retried?: boolean }. Any `status` in the input or in the report is
// ignored — the status comes from validating the report (see core/smoke.ts).
// stdout: { smoke: DriverState["smoke"], failedCases, abnahme, notApplicable }
import { parseSmokeReport } from "../core/smoke.js";
import { readStdin } from "./_stdin.js";
let input = {};
try {
    input = JSON.parse(await readStdin());
}
catch {
    /* unparseable input -> not-run below */
}
const run = parseSmokeReport(typeof input.rawOutput === "string" ? input.rawOutput : "");
const smoke = run.status === "not-run" ? { status: "not-run", retried: input.retried === true } : { status: run.status };
process.stdout.write(JSON.stringify({
    smoke,
    failedCases: run.failedCases,
    abnahme: run.abnahme,
    notApplicable: run.notApplicable,
}) + "\n");
